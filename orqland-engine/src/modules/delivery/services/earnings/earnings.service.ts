import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, desc, eq, gte, inArray, sql, type SQL } from 'drizzle-orm';
import type { AuthUser } from '@/core/decorators/current-user.decorator';
import { DRIZZLE, type DrizzleDB } from '@/infrastructure/database/drizzle.module';
import {
  deliveryEarningAdjustments,
  deliveryEarnings,
  deliveryOffers,
  deliveryTasks,
  orders,
  orqspaces,
  orqUsers,
  type DistanceSource,
  type EarningStatus,
} from '@/infrastructure/database/schema';
import type { DbTx } from '@/core/utils/db-executor';
import { fromPaise, toPaise } from '@/core/utils/money';
import { AuditService } from '@/modules/orders/services/shared/audit.service';
import { OrqspaceAccessService } from '@/modules/orders/services/shared/orqspace-access.service';
import type {
  AdjustEarningInput,
  ApproveEarningInput,
  CostReportInput,
  EarningsFilterInput,
  MarkEarningsPaidInput,
} from '../../dto/inputs/finance.inputs';
import type {
  AgentEarningsSummaryType,
  AgentEarningsTrendPointType,
  AgentEarningsWindowType,
  AgentPerformanceType,
  AgentStatementType,
  DeliveryCostReportType,
  DeliveryEarningType,
} from '../../dto/types/finance.type';
import { deliveryConfig } from '@/config/delivery.config';
import { round2 } from '../../helpers/geo';
import { normalizePeriod, periodMonthFor } from '../../helpers/period';
import { displayNameOf } from '../agents/agent-directory.service';
import { DeliveryNotifierService } from '../notifications/delivery-notifier.service';

type EarningRow = typeof deliveryEarnings.$inferSelect;
type TaskRow = typeof deliveryTasks.$inferSelect;

/** Earnings = approved billable km × the rate snapshotted when the agent accepted the task. */
export function computeBillable(estimatedKm: number | null, measuredKm: number | null): { km: number; source: DistanceSource } {
  if (measuredKm !== null && measuredKm > 0) {
    const capped = estimatedKm !== null ? Math.min(measuredKm, estimatedKm * deliveryConfig.measuredDistanceCapFactor) : measuredKm;
    return { km: round2(capped), source: 'GPS_TRACE' };
  }
  return { km: round2(estimatedKm ?? 0), source: 'ESTIMATED_ROUTE' };
}

const amountFor = (km: string | number, rate: string) => Math.round(Number(km) * toPaise(rate));

@Injectable()
export class EarningsService {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    private readonly access: OrqspaceAccessService,
    private readonly audit: AuditService,
    private readonly notifier: DeliveryNotifierService,
  ) {}

  /** Called once when an AGENT task becomes DELIVERED. The unique task_id prevents duplicate earnings. */
  async createForDeliveredTask(tx: DbTx, task: TaskRow, timezone: string): Promise<void> {
    if (task.mode !== 'AGENT' || !task.agentUserId || !task.connectionId || !task.ratePerKmSnapshot) return;
    const estimated = task.estimatedDistanceKm === null ? null : Number(task.estimatedDistanceKm);
    const measured = task.measuredDistanceKm === null ? null : Number(task.measuredDistanceKm);
    const billable = computeBillable(estimated, measured);
    const base = amountFor(billable.km, task.ratePerKmSnapshot);
    await tx
      .insert(deliveryEarnings)
      .values({
        taskId: task.id,
        agentUserId: task.agentUserId,
        orqspaceId: task.orqspaceId,
        connectionId: task.connectionId,
        distanceSource: billable.source,
        measuredDistanceKm: task.measuredDistanceKm,
        approvedBillableKm: billable.km.toFixed(2),
        ratePerKm: task.ratePerKmSnapshot,
        baseAmount: fromPaise(base),
        adjustmentTotal: '0.00',
        finalAmount: fromPaise(base),
        status: 'PENDING_APPROVAL',
        periodMonth: periodMonthFor(task.deliveredAt ?? new Date(), timezone),
      })
      .onConflictDoNothing({ target: deliveryEarnings.taskId });
  }

  // ── workspace ──────────────────────────────────────────────────────────

  async list(user: AuthUser, filter: EarningsFilterInput): Promise<DeliveryEarningType[]> {
    await this.access.assertCanManage(user, filter.orqspaceId);
    const conditions: SQL[] = [eq(deliveryEarnings.orqspaceId, filter.orqspaceId)];
    if (filter.periodMonth) conditions.push(eq(deliveryEarnings.periodMonth, normalizePeriod(filter.periodMonth)));
    if (filter.statuses?.length) conditions.push(inArray(deliveryEarnings.status, filter.statuses));
    if (filter.agentUserId) conditions.push(eq(deliveryEarnings.agentUserId, filter.agentUserId));
    const rows = await this.db
      .select()
      .from(deliveryEarnings)
      .where(and(...conditions))
      .orderBy(desc(deliveryEarnings.createdAt))
      .limit(500);
    return this.toTypes(rows);
  }

  async approve(user: AuthUser, input: ApproveEarningInput): Promise<DeliveryEarningType> {
    const earning = await this.load(input.earningId);
    const actor = await this.access.assertCanManage(user, earning.orqspaceId);
    if (!['PENDING_APPROVAL', 'UNDER_REVIEW'].includes(earning.status)) {
      throw new BadRequestException(`Earning is ${earning.status}`);
    }
    if (input.approvedBillableKm !== undefined && !input.reason?.trim()) {
      throw new BadRequestException('A reason is required when changing billable km');
    }
    const km = input.approvedBillableKm ?? earning.approvedBillableKm;
    const base = amountFor(km, earning.ratePerKm);
    await this.db.transaction(async (tx) => {
      await tx
        .update(deliveryEarnings)
        .set({
          approvedBillableKm: Number(km).toFixed(2),
          distanceSource: input.approvedBillableKm !== undefined ? 'WORKSPACE_APPROVED' : earning.distanceSource,
          baseAmount: fromPaise(base),
          finalAmount: fromPaise(base + toPaise(earning.adjustmentTotal)),
          status: 'APPROVED',
          approvedByUserId: actor.userId,
          approvedAt: new Date(),
          finalizedAt: new Date(),
        })
        .where(eq(deliveryEarnings.id, earning.id));
      await this.audit.record(tx, {
        entityType: 'delivery_earning',
        entityId: earning.id,
        action: 'earning.approved',
        actorUserId: actor.userId,
        actorRole: actor.role,
        reason: input.reason ?? null,
        before: { approvedBillableKm: earning.approvedBillableKm, baseAmount: earning.baseAmount },
        after: { approvedBillableKm: km, baseAmount: fromPaise(base) },
      });
    });
    await this.notifier.send({
      userId: earning.agentUserId,
      type: 'EARNING_APPROVED',
      title: 'Earning approved',
      body: `₹${fromPaise(base + toPaise(earning.adjustmentTotal))} approved for ${Number(km).toFixed(2)} km.`,
    });
    return (await this.toTypes([await this.load(earning.id)]))[0];
  }

  async adjust(user: AuthUser, input: AdjustEarningInput): Promise<DeliveryEarningType> {
    const earning = await this.load(input.earningId);
    const actor = await this.access.assertCanManage(user, earning.orqspaceId);
    if (['PAID', 'VOID'].includes(earning.status)) throw new BadRequestException(`Earning is ${earning.status}`);
    const adjustment = toPaise(earning.adjustmentTotal) + toPaise(input.amount);
    const final = toPaise(earning.baseAmount) + adjustment;
    if (final < 0) throw new BadRequestException('Adjustments cannot make an earning negative');
    await this.db.transaction(async (tx) => {
      await tx.insert(deliveryEarningAdjustments).values({
        earningId: earning.id,
        amount: input.amount,
        reason: input.reason,
        createdByUserId: actor.userId,
      });
      await tx
        .update(deliveryEarnings)
        .set({ adjustmentTotal: fromPaise(adjustment), finalAmount: fromPaise(final) })
        .where(eq(deliveryEarnings.id, earning.id));
      await this.audit.record(tx, {
        entityType: 'delivery_earning',
        entityId: earning.id,
        action: 'earning.adjusted',
        actorUserId: actor.userId,
        actorRole: actor.role,
        reason: input.reason,
        after: { amount: input.amount, finalAmount: fromPaise(final) },
      });
    });
    return (await this.toTypes([await this.load(earning.id)]))[0];
  }

  /** Records an external payout. Only APPROVED earnings can be marked paid. */
  async markPaid(user: AuthUser, input: MarkEarningsPaidInput): Promise<DeliveryEarningType[]> {
    const actor = await this.access.assertCanManage(user, input.orqspaceId);
    const updated = await this.db.transaction(async (tx) => {
      const rows = await tx
        .update(deliveryEarnings)
        .set({ status: 'PAID', paidAt: new Date(), payoutReference: input.payoutReference })
        .where(
          and(
            inArray(deliveryEarnings.id, input.earningIds),
            eq(deliveryEarnings.orqspaceId, input.orqspaceId),
            eq(deliveryEarnings.status, 'APPROVED'),
          ),
        )
        .returning();
      if (rows.length !== input.earningIds.length) {
        throw new BadRequestException('Only approved earnings of this workspace can be marked paid');
      }
      await this.audit.record(tx, {
        entityType: 'delivery_earning',
        entityId: input.earningIds.join(',').slice(0, 64),
        action: 'earning.paid',
        actorUserId: actor.userId,
        actorRole: actor.role,
        after: { earningIds: input.earningIds, payoutReference: input.payoutReference },
      });
      return rows;
    });
    for (const agentUserId of new Set(updated.map((r) => r.agentUserId))) {
      await this.notifier.send({ userId: agentUserId, type: 'EARNING_PAID', title: 'Payout recorded', body: `Reference ${input.payoutReference}` });
    }
    return this.toTypes(updated);
  }

  async costReport(user: AuthUser, input: CostReportInput): Promise<DeliveryCostReportType> {
    await this.access.assertCanManage(user, input.orqspaceId);
    const period = normalizePeriod(input.periodMonth);
    const rows = await this.db
      .select()
      .from(deliveryEarnings)
      .where(and(eq(deliveryEarnings.orqspaceId, input.orqspaceId), eq(deliveryEarnings.periodMonth, period)));
    const names = await this.agentNames(rows.map((r) => r.agentUserId));

    const [taskStats] = await this.db
      .select({
        selfDeliveries: sql<number>`count(*) filter (where ${deliveryTasks.mode} = 'SELF' and ${deliveryTasks.status} = 'DELIVERED')`.mapWith(Number),
        failed: sql<number>`count(*) filter (where ${deliveryTasks.status} in ('FAILED','RETURNED_TO_ORIGIN'))`.mapWith(Number),
      })
      .from(deliveryTasks)
      .where(
        and(
          eq(deliveryTasks.orqspaceId, input.orqspaceId),
          sql`date_trunc('month', ${deliveryTasks.createdAt})::date = ${period}::date`,
        ),
      );

    const empty = () => ({ deliveries: 0, km: 0, amount: 0, pending: 0, approved: 0, paid: 0 });
    const total = empty();
    const byAgent = new Map<string, ReturnType<typeof empty>>();
    for (const row of rows) {
      if (row.status === 'VOID') continue;
      const agent = byAgent.get(row.agentUserId) ?? empty();
      for (const bucket of [total, agent]) {
        const amount = toPaise(row.finalAmount);
        bucket.deliveries++;
        bucket.km += Number(row.approvedBillableKm);
        bucket.amount += amount;
        if (row.status === 'PAID') bucket.paid += amount;
        else if (row.status === 'APPROVED') bucket.approved += amount;
        else bucket.pending += amount;
      }
      byAgent.set(row.agentUserId, agent);
    }
    return {
      periodMonth: period,
      deliveries: total.deliveries,
      billableKm: total.km.toFixed(2),
      totalAmount: fromPaise(total.amount),
      pendingAmount: fromPaise(total.pending),
      approvedAmount: fromPaise(total.approved),
      paidAmount: fromPaise(total.paid),
      selfDeliveries: taskStats?.selfDeliveries ?? 0,
      failedDeliveries: taskStats?.failed ?? 0,
      byAgent: [...byAgent.entries()].map(([agentUserId, b]) => ({
        agentUserId,
        agentName: names.get(agentUserId) ?? 'Agent',
        deliveries: b.deliveries,
        billableKm: b.km.toFixed(2),
        amount: fromPaise(b.amount),
        pendingAmount: fromPaise(b.pending),
        approvedAmount: fromPaise(b.approved),
        paidAmount: fromPaise(b.paid),
      })),
    };
  }

  // ── agent ──────────────────────────────────────────────────────────────

  async agentSummary(agentUserId: string, periodMonth?: string): Promise<AgentEarningsSummaryType> {
    const period = periodMonth ? normalizePeriod(periodMonth) : periodMonthFor(new Date(), 'Asia/Kolkata');
    const month = await this.db
      .select()
      .from(deliveryEarnings)
      .where(and(eq(deliveryEarnings.agentUserId, agentUserId), eq(deliveryEarnings.periodMonth, period)))
      .orderBy(desc(deliveryEarnings.createdAt));
    const recent = await this.db
      .select()
      .from(deliveryEarnings)
      .where(eq(deliveryEarnings.agentUserId, agentUserId))
      .orderBy(desc(deliveryEarnings.createdAt))
      .limit(20);
    return {
      periodMonth: period,
      today: await this.agentToday(agentUserId),
      month: this.window(month),
      recent: await this.toTypes(recent),
    };
  }

  /** Calendar-month statement (1st → last day). Each earning's month is fixed in its workspace's timezone. */
  async agentStatement(agentUserId: string, periodMonth: string): Promise<AgentStatementType> {
    const period = normalizePeriod(periodMonth);
    const rows = await this.db
      .select()
      .from(deliveryEarnings)
      .where(and(eq(deliveryEarnings.agentUserId, agentUserId), eq(deliveryEarnings.periodMonth, period)))
      .orderBy(deliveryEarnings.createdAt);
    const lines = await this.toTypes(rows);
    const live = lines.filter((l) => l.status !== 'VOID');

    const byWorkspace = new Map<string, { orqspaceId: string; orqspaceName: string; deliveries: number; km: number; amount: number }>();
    for (const l of live) {
      const b = byWorkspace.get(l.orqspaceId) ?? { orqspaceId: l.orqspaceId, orqspaceName: l.orqspaceName, deliveries: 0, km: 0, amount: 0 };
      b.deliveries++;
      b.km += Number(l.approvedBillableKm);
      b.amount += toPaise(l.finalAmount);
      byWorkspace.set(l.orqspaceId, b);
    }
    const [y, m] = period.split('-').map(Number);
    const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const periodEnd = `${period.slice(0, 8)}${String(lastDay).padStart(2, '0')}`;
    const adjustments = live.reduce((sum, l) => sum + toPaise(l.adjustmentTotal), 0);
    const grand = live.reduce((sum, l) => sum + toPaise(l.finalAmount), 0);

    const csvRows = [
      ['Delivered', 'Delivery', 'Order', 'Workspace', 'Distance source', 'Billable km', 'Rate per km', 'Base', 'Adjustments', 'Amount', 'Status', 'Payout reference'],
      ...lines.map((l) => [
        l.deliveredAt ? l.deliveredAt.toISOString().slice(0, 10) : '',
        l.taskNumber,
        l.orderNumber,
        l.orqspaceName,
        l.distanceSource,
        l.approvedBillableKm,
        l.ratePerKm,
        l.baseAmount,
        l.adjustmentTotal,
        l.finalAmount,
        l.status,
        l.payoutReference ?? '',
      ]),
    ];
    const csv = csvRows.map((r) => r.map((c) => (/[",\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c)).join(',')).join('\n');

    return {
      periodMonth: period,
      periodStart: period,
      periodEnd,
      isClosed: periodEnd < new Date().toISOString().slice(0, 10),
      totals: this.window(rows),
      adjustmentTotal: fromPaise(adjustments),
      grandTotal: fromPaise(grand),
      byWorkspace: [...byWorkspace.values()].map((b) => ({ ...b, billableKm: b.km.toFixed(2), amount: fromPaise(b.amount) })),
      lines,
      csv,
    };
  }

  /** Offer funnel and distance metrics for one month (Asia/Kolkata calendar month). */
  async agentPerformance(agentUserId: string, periodMonth: string): Promise<AgentPerformanceType> {
    const period = normalizePeriod(periodMonth);
    const inMonth = (column: SQL | typeof deliveryOffers.offeredAt) =>
      sql`date_trunc('month', ${column} AT TIME ZONE 'Asia/Kolkata')::date = ${period}::date`;
    const [offers] = await this.db
      .select({
        offered: sql<number>`count(*)`.mapWith(Number),
        accepted: sql<number>`count(*) filter (where ${deliveryOffers.status} = 'ACCEPTED')`.mapWith(Number),
        declined: sql<number>`count(*) filter (where ${deliveryOffers.status} = 'DECLINED')`.mapWith(Number),
        expired: sql<number>`count(*) filter (where ${deliveryOffers.status} = 'EXPIRED')`.mapWith(Number),
      })
      .from(deliveryOffers)
      .where(and(eq(deliveryOffers.agentUserId, agentUserId), inMonth(deliveryOffers.offeredAt)));
    const [tasks] = await this.db
      .select({
        completed: sql<number>`count(*) filter (where ${deliveryTasks.status} = 'DELIVERED')`.mapWith(Number),
        failed: sql<number>`count(*) filter (where ${deliveryTasks.status} in ('FAILED','RETURNED_TO_ORIGIN'))`.mapWith(Number),
        tracked: sql<string>`coalesce(sum(${deliveryTasks.measuredDistanceKm}) filter (where ${deliveryTasks.status} = 'DELIVERED'), 0)`,
      })
      .from(deliveryTasks)
      .where(and(eq(deliveryTasks.agentUserId, agentUserId), inMonth(sql`coalesce(${deliveryTasks.deliveredAt}, ${deliveryTasks.failedAt}, ${deliveryTasks.updatedAt})`)));
    const earnings = await this.db
      .select()
      .from(deliveryEarnings)
      .where(and(eq(deliveryEarnings.agentUserId, agentUserId), eq(deliveryEarnings.periodMonth, period)));
    const live = earnings.filter((e) => e.status !== 'VOID');
    const km = live.reduce((sum, e) => sum + Number(e.approvedBillableKm), 0);
    const amount = live.reduce((sum, e) => sum + toPaise(e.finalAmount), 0);
    return {
      periodMonth: period,
      ...offers,
      completed: tasks.completed,
      failed: tasks.failed,
      trackedKm: Number(tasks.tracked).toFixed(2),
      billableKm: km.toFixed(2),
      averageDistanceKm: live.length ? (km / live.length).toFixed(2) : '0.00',
      averageEarningPerDelivery: fromPaise(live.length ? Math.round(amount / live.length) : 0),
    };
  }

  /** Month-by-month totals for the last `months` months (current month included). */
  async agentTrend(agentUserId: string, months = 6): Promise<AgentEarningsTrendPointType[]> {
    const now = new Date();
    const periods = Array.from({ length: months }, (_, i) => {
      const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (months - 1 - i), 1));
      return d.toISOString().slice(0, 10);
    });
    const rows = await this.db
      .select({
        periodMonth: deliveryEarnings.periodMonth,
        deliveries: sql<number>`count(*)`.mapWith(Number),
        km: sql<string>`coalesce(sum(${deliveryEarnings.approvedBillableKm}), 0)`,
        amount: sql<string>`coalesce(sum(${deliveryEarnings.finalAmount}), 0)`,
      })
      .from(deliveryEarnings)
      .where(
        and(eq(deliveryEarnings.agentUserId, agentUserId), inArray(deliveryEarnings.periodMonth, periods), sql`${deliveryEarnings.status} <> 'VOID'`),
      )
      .groupBy(deliveryEarnings.periodMonth);
    const byPeriod = new Map(rows.map((r) => [r.periodMonth, r]));
    return periods.map((p) => {
      const r = byPeriod.get(p);
      return { periodMonth: p, deliveries: r?.deliveries ?? 0, billableKm: Number(r?.km ?? 0).toFixed(2), amount: fromPaise(toPaise(r?.amount ?? '0')) };
    });
  }

  async agentToday(agentUserId: string): Promise<AgentEarningsWindowType> {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const rows = await this.db
      .select()
      .from(deliveryEarnings)
      .where(and(eq(deliveryEarnings.agentUserId, agentUserId), gte(deliveryEarnings.createdAt, startOfDay)));
    return this.window(rows);
  }

  private window(rows: EarningRow[]): AgentEarningsWindowType {
    let km = 0;
    let estimated = 0;
    let approved = 0;
    let paid = 0;
    const live = rows.filter((r) => r.status !== 'VOID');
    for (const r of live) {
      km += Number(r.approvedBillableKm);
      const amount = toPaise(r.finalAmount);
      if (r.status === 'PAID') paid += amount;
      else if (r.status === 'APPROVED') approved += amount;
      else estimated += amount;
    }
    return {
      deliveries: live.length,
      billableKm: km.toFixed(2),
      estimated: fromPaise(estimated),
      approved: fromPaise(approved),
      paid: fromPaise(paid),
    };
  }

  private async load(id: string): Promise<EarningRow> {
    const [row] = await this.db.select().from(deliveryEarnings).where(eq(deliveryEarnings.id, id));
    if (!row) throw new NotFoundException('Earning not found');
    return row;
  }

  private async agentNames(ids: string[]): Promise<Map<string, string>> {
    const unique = [...new Set(ids)];
    if (!unique.length) return new Map();
    const users = await this.db.select().from(orqUsers).where(inArray(orqUsers.id, unique));
    return new Map(users.map((u) => [u.id, displayNameOf(u)]));
  }

  private async toTypes(rows: EarningRow[]): Promise<DeliveryEarningType[]> {
    if (!rows.length) return [];
    const tasks = await this.db
      .select({
        id: deliveryTasks.id,
        taskNumber: deliveryTasks.taskNumber,
        deliveredAt: deliveryTasks.deliveredAt,
        estimatedDistanceKm: deliveryTasks.estimatedDistanceKm,
        orderNumber: orders.orderNumber,
        orqspaceName: orqspaces.name,
      })
      .from(deliveryTasks)
      .innerJoin(orders, eq(orders.id, deliveryTasks.orderId))
      .innerJoin(orqspaces, eq(orqspaces.id, deliveryTasks.orqspaceId))
      .where(
        inArray(
          deliveryTasks.id,
          rows.map((r) => r.taskId),
        ),
      );
    const taskById = new Map(tasks.map((t) => [t.id, t]));
    const names = await this.agentNames(rows.map((r) => r.agentUserId));
    return rows.map((row) => {
      const task = taskById.get(row.taskId);
      return {
        ...row,
        taskNumber: task?.taskNumber ?? '',
        orderNumber: task?.orderNumber ?? '',
        orqspaceName: task?.orqspaceName ?? '',
        agentName: names.get(row.agentUserId) ?? 'Agent',
        estimatedDistanceKm: task?.estimatedDistanceKm ?? null,
        deliveredAt: task?.deliveredAt ?? null,
        status: row.status as EarningStatus,
      };
    });
  }
}
