import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import type { AuthUser } from '@/core/decorators/current-user.decorator';
import { DRIZZLE, type DrizzleDB } from '@/infrastructure/database/drizzle.module';
import {
  deliveryCodRecords,
  deliveryCodSettlements,
  deliveryTasks,
  orders,
  orqspaces,
  orqUsers,
  type CodCollectionMethod,
  type CodStatus,
} from '@/infrastructure/database/schema';
import type { DbTx } from '@/core/utils/db-executor';
import { fromPaise, toPaise } from '@/core/utils/money';
import { OrderPaymentsService } from '@/modules/orders/services/lifecycle/order-payments.service';
import { AuditService } from '@/modules/orders/services/shared/audit.service';
import { OrqspaceAccessService } from '@/modules/orders/services/shared/orqspace-access.service';
import type { CodFilterInput, RecordCodSettlementInput, ResolveCodInput } from '../../dto/inputs/finance.inputs';
import type { CodRecordType, CodSummaryType } from '../../dto/types/finance.type';
import { displayNameOf } from '../agents/agent-directory.service';
import { DeliveryNotifierService } from '../notifications/delivery-notifier.service';

type CodRow = typeof deliveryCodRecords.$inferSelect;

const OPEN_STATUSES: CodStatus[] = ['PENDING_COLLECTION', 'COLLECTED', 'PARTIALLY_SETTLED', 'DISCREPANCY', 'UNDER_REVIEW'];

/**
 * Cash-on-delivery, tracked independently of delivery status. An order is only marked PAID when its COD
 * record is SETTLED (cash handed over to the workspace) — never merely because the task was delivered.
 */
@Injectable()
export class CodService {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    private readonly access: OrqspaceAccessService,
    private readonly payments: OrderPaymentsService,
    private readonly audit: AuditService,
    private readonly notifier: DeliveryNotifierService,
  ) {}

  // ── lifecycle hooks (called inside task transactions) ───────────────────

  async createForTask(tx: DbTx, task: { id: string; orderId: string; orqspaceId: string; codAmount: string }) {
    if (toPaise(task.codAmount) <= 0) return;
    await tx
      .insert(deliveryCodRecords)
      .values({ taskId: task.id, orderId: task.orderId, orqspaceId: task.orqspaceId, expectedAmount: task.codAmount })
      .onConflictDoNothing();
  }

  async assignAgent(tx: DbTx, taskId: string, agentUserId: string | null) {
    await tx.update(deliveryCodRecords).set({ agentUserId }).where(eq(deliveryCodRecords.taskId, taskId));
  }

  async recordCollection(
    tx: DbTx,
    taskId: string,
    amount: string,
    method: CodCollectionMethod,
    proof: { url?: string | null; fileId?: string | null } = {},
  ) {
    const [record] = await tx.select().from(deliveryCodRecords).where(eq(deliveryCodRecords.taskId, taskId)).for('update');
    if (!record) return;
    const matches = toPaise(amount) === toPaise(record.expectedAmount);
    await tx
      .update(deliveryCodRecords)
      .set({
        collectedAmount: amount,
        collectionMethod: method,
        collectionProofUrl: proof.url ?? null,
        collectionProofFileId: proof.fileId ?? null,
        collectedAt: new Date(),
        status: matches ? 'COLLECTED' : 'DISCREPANCY',
        discrepancyReason: matches ? null : `Collected ₹${amount}, expected ₹${record.expectedAmount}`,
      })
      .where(eq(deliveryCodRecords.id, record.id));
  }

  /** Task cancelled or failed before any cash changed hands. */
  async markNotCollected(tx: DbTx, taskId: string, reason: string) {
    await tx
      .update(deliveryCodRecords)
      .set({ status: 'NOT_COLLECTED', discrepancyReason: reason })
      .where(and(eq(deliveryCodRecords.taskId, taskId), eq(deliveryCodRecords.status, 'PENDING_COLLECTION')));
  }

  // ── workspace actions ──────────────────────────────────────────────────

  async list(user: AuthUser, filter: CodFilterInput): Promise<CodRecordType[]> {
    await this.access.assertCanManage(user, filter.orqspaceId);
    const statuses = filter.statuses?.length ? filter.statuses : OPEN_STATUSES;
    const rows = await this.db
      .select()
      .from(deliveryCodRecords)
      .where(and(eq(deliveryCodRecords.orqspaceId, filter.orqspaceId), inArray(deliveryCodRecords.status, statuses)))
      .orderBy(desc(deliveryCodRecords.createdAt))
      .limit(200);
    return this.toTypes(rows);
  }

  async summary(user: AuthUser, orqspaceId: string): Promise<CodSummaryType> {
    await this.access.assertCanManage(user, orqspaceId);
    const [row] = await this.db
      .select({
        expected: sql<string>`coalesce(sum(${deliveryCodRecords.expectedAmount}) filter (where ${deliveryCodRecords.status} <> 'NOT_COLLECTED'), 0)`,
        collected: sql<string>`coalesce(sum(${deliveryCodRecords.collectedAmount}), 0)`,
        settled: sql<string>`coalesce(sum(${deliveryCodRecords.settledAmount}), 0)`,
        openRecords: sql<number>`count(*) filter (where ${deliveryCodRecords.status} in ('COLLECTED','PARTIALLY_SETTLED','DISCREPANCY','UNDER_REVIEW'))`.mapWith(Number),
        discrepancies: sql<number>`count(*) filter (where ${deliveryCodRecords.status} in ('DISCREPANCY','UNDER_REVIEW'))`.mapWith(Number),
      })
      .from(deliveryCodRecords)
      .where(eq(deliveryCodRecords.orqspaceId, orqspaceId));
    return {
      expected: fromPaise(toPaise(row.expected)),
      collected: fromPaise(toPaise(row.collected)),
      settled: fromPaise(toPaise(row.settled)),
      outstanding: fromPaise(toPaise(row.collected) - toPaise(row.settled)),
      openRecords: row.openRecords,
      discrepancies: row.discrepancies,
    };
  }

  async recordSettlement(user: AuthUser, input: RecordCodSettlementInput): Promise<CodRecordType> {
    const record = await this.load(input.codRecordId);
    const actor = await this.access.assertCanManage(user, record.orqspaceId);
    await this.db.transaction(async (tx) => {
      const [locked] = await tx.select().from(deliveryCodRecords).where(eq(deliveryCodRecords.id, record.id)).for('update');
      if (locked.collectedAmount === null) throw new BadRequestException('Cash has not been collected yet');
      if (!['COLLECTED', 'PARTIALLY_SETTLED', 'DISCREPANCY', 'UNDER_REVIEW'].includes(locked.status)) {
        throw new BadRequestException(`COD record is ${locked.status}`);
      }
      const settled = toPaise(locked.settledAmount) + toPaise(input.amount);
      if (settled > toPaise(locked.collectedAmount)) throw new BadRequestException('Settlement exceeds the amount collected');

      await tx.insert(deliveryCodSettlements).values({
        codRecordId: locked.id,
        amount: input.amount,
        method: input.method,
        recordedByUserId: actor.userId,
        note: input.note ?? null,
      });
      const fullyHandedOver = settled === toPaise(locked.collectedAmount);
      const matchesExpected = toPaise(locked.collectedAmount) === toPaise(locked.expectedAmount);
      const status: CodStatus =
        fullyHandedOver && matchesExpected ? 'SETTLED' : !matchesExpected ? locked.status : 'PARTIALLY_SETTLED';
      await tx
        .update(deliveryCodRecords)
        .set({ settledAmount: fromPaise(settled), status })
        .where(eq(deliveryCodRecords.id, locked.id));
      if (status === 'SETTLED') await this.markOrderPaid(tx, locked, fromPaise(settled), actor.userId);
      await this.audit.record(tx, {
        entityType: 'cod_record',
        entityId: locked.id,
        action: 'cod.settlement_recorded',
        actorUserId: actor.userId,
        actorRole: actor.role,
        after: { amount: input.amount, method: input.method, status },
      });
    });
    return (await this.toTypes([await this.load(record.id)]))[0];
  }

  async resolve(user: AuthUser, input: ResolveCodInput): Promise<CodRecordType> {
    const record = await this.load(input.codRecordId);
    const actor = await this.access.assertCanManage(user, record.orqspaceId);
    await this.db.transaction(async (tx) => {
      const [locked] = await tx.select().from(deliveryCodRecords).where(eq(deliveryCodRecords.id, record.id)).for('update');
      if (['SETTLED', 'NOT_COLLECTED'].includes(locked.status)) throw new BadRequestException(`COD record is ${locked.status}`);
      let status: CodStatus;
      if (input.resolution === 'ACCEPT_AS_SETTLED') {
        if (locked.collectedAmount === null || toPaise(locked.settledAmount) !== toPaise(locked.collectedAmount)) {
          throw new BadRequestException('Record every handover before accepting the record as settled');
        }
        status = 'SETTLED';
      } else {
        status = input.resolution === 'MARK_NOT_COLLECTED' ? 'NOT_COLLECTED' : 'UNDER_REVIEW';
      }
      await tx
        .update(deliveryCodRecords)
        .set({ status, discrepancyReason: input.reason, resolvedByUserId: actor.userId, resolvedAt: new Date() })
        .where(eq(deliveryCodRecords.id, locked.id));
      if (status === 'SETTLED' && toPaise(locked.settledAmount) > 0) {
        await this.markOrderPaid(tx, locked, locked.settledAmount, actor.userId);
      }
      await this.audit.record(tx, {
        entityType: 'cod_record',
        entityId: locked.id,
        action: `cod.resolved.${input.resolution.toLowerCase()}`,
        actorUserId: actor.userId,
        actorRole: actor.role,
        reason: input.reason,
        before: { status: locked.status },
        after: { status },
      });
    });
    return (await this.toTypes([await this.load(record.id)]))[0];
  }

  /** Tells the workspace owner when the cash collected differs from the amount expected. */
  async notifyDiscrepancy(taskId: string) {
    const [record] = await this.db
      .select({ status: deliveryCodRecords.status, reason: deliveryCodRecords.discrepancyReason, ownerId: orqspaces.ownerId })
      .from(deliveryCodRecords)
      .innerJoin(orqspaces, eq(orqspaces.id, deliveryCodRecords.orqspaceId))
      .where(eq(deliveryCodRecords.taskId, taskId));
    if (record?.status !== 'DISCREPANCY') return;
    await this.notifier.send({
      userId: record.ownerId,
      type: 'COD_DISCREPANCY',
      title: 'COD amount mismatch',
      body: record.reason ?? 'Review the COD record in Delivery Management.',
    });
  }

  private async markOrderPaid(tx: DbTx, record: CodRow, amount: string, actorUserId: string) {
    await this.payments.record(tx, {
      orderId: record.orderId,
      kind: 'PAYMENT',
      method: 'COD',
      status: 'SUCCEEDED',
      amount,
      provider: 'COD',
      providerReference: record.id,
      recordedByUserId: actorUserId,
    });
  }

  private async load(id: string): Promise<CodRow> {
    const [row] = await this.db.select().from(deliveryCodRecords).where(eq(deliveryCodRecords.id, id));
    if (!row) throw new NotFoundException('COD record not found');
    return row;
  }

  private async toTypes(rows: CodRow[]): Promise<CodRecordType[]> {
    if (!rows.length) return [];
    const taskIds = rows.map((r) => r.taskId);
    const tasks = await this.db
      .select({ id: deliveryTasks.id, taskNumber: deliveryTasks.taskNumber, orderNumber: orders.orderNumber })
      .from(deliveryTasks)
      .innerJoin(orders, eq(orders.id, deliveryTasks.orderId))
      .where(inArray(deliveryTasks.id, taskIds));
    const taskById = new Map(tasks.map((t) => [t.id, t]));
    const agentIds = rows.map((r) => r.agentUserId).filter((id): id is string => !!id);
    const agents = agentIds.length ? await this.db.select().from(orqUsers).where(inArray(orqUsers.id, agentIds)) : [];
    const agentName = new Map(agents.map((a) => [a.id, displayNameOf(a)]));
    const settlements = await this.db
      .select({
        id: deliveryCodSettlements.id,
        codRecordId: deliveryCodSettlements.codRecordId,
        amount: deliveryCodSettlements.amount,
        method: deliveryCodSettlements.method,
        note: deliveryCodSettlements.note,
        createdAt: deliveryCodSettlements.createdAt,
        recordedByName: orqUsers.displayName,
      })
      .from(deliveryCodSettlements)
      .leftJoin(orqUsers, eq(orqUsers.id, deliveryCodSettlements.recordedByUserId))
      .where(
        inArray(
          deliveryCodSettlements.codRecordId,
          rows.map((r) => r.id),
        ),
      )
      .orderBy(asc(deliveryCodSettlements.createdAt));

    return rows.map((row) => ({
      ...row,
      taskNumber: taskById.get(row.taskId)?.taskNumber ?? '',
      orderNumber: taskById.get(row.taskId)?.orderNumber ?? '',
      agentName: row.agentUserId ? (agentName.get(row.agentUserId) ?? null) : null,
      outstandingAmount: fromPaise(toPaise(row.collectedAmount) - toPaise(row.settledAmount)),
      settlements: settlements.filter((s) => s.codRecordId === row.id),
    }));
  }
}
