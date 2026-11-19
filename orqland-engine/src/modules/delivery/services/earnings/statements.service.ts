import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { and, desc, eq, inArray, lt, ne, sql } from 'drizzle-orm';
import type { AuthUser } from '@/core/decorators/current-user.decorator';
import { fromPaise, toPaise } from '@/core/utils/money';
import { DRIZZLE, type DrizzleDB } from '@/infrastructure/database/drizzle.module';
import {
  deliveryCodRecords,
  deliveryEarnings,
  deliveryStatements,
  deliveryTasks,
  orqspaceDeliverySettings,
  orqspaces,
  orqUsers,
  type StatementTotals,
} from '@/infrastructure/database/schema';
import { OrqspaceAccessService } from '@/modules/orders/services/shared/orqspace-access.service';
import type { DeliveryStatementType } from '../../dto/types/finance.type';
import { normalizePeriod, periodMonthFor } from '../../helpers/period';
import { displayNameOf } from '../agents/agent-directory.service';
import { DeliveryNotifierService } from '../notifications/delivery-notifier.service';

type StatementRow = typeof deliveryStatements.$inferSelect;

/** Previous calendar month (YYYY-MM-01) of a period. */
export function previousPeriod(period: string): string {
  const [y, m] = period.split('-').map(Number);
  return m === 1 ? `${y - 1}-12-01` : `${y}-${String(m - 1).padStart(2, '0')}-01`;
}

/**
 * Monthly statements (guide §9 "Monthly earnings cycle"): one row per agent × workspace × calendar month
 * in the workspace's timezone. DRAFT rows are rebuilt as earnings change; after the month closes the
 * month-end job freezes them as FINAL and notifies the agent. Payout stays a separate process.
 */
@Injectable()
export class StatementsService {
  private readonly logger = new Logger('StatementsService');

  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    private readonly access: OrqspaceAccessService,
    private readonly notifier: DeliveryNotifierService,
  ) {}

  /** Recomputes totals for one agent × workspace × month. FINAL statements are never rewritten. */
  async rebuild(agentUserId: string, orqspaceId: string, periodMonth: string, finalize = false): Promise<StatementRow | null> {
    const period = normalizePeriod(periodMonth);
    const [existing] = await this.db
      .select()
      .from(deliveryStatements)
      .where(
        and(eq(deliveryStatements.agentUserId, agentUserId), eq(deliveryStatements.orqspaceId, orqspaceId), eq(deliveryStatements.periodMonth, period)),
      );
    if (existing?.status === 'FINAL') return existing;

    const totals = await this.computeTotals(agentUserId, orqspaceId, period);
    if (!existing && totals.deliveries === 0) return null;
    const now = new Date();
    const [row] = await this.db
      .insert(deliveryStatements)
      .values({
        agentUserId,
        orqspaceId,
        periodMonth: period,
        totals,
        status: finalize ? 'FINAL' : 'DRAFT',
        generatedAt: now,
        finalizedAt: finalize ? now : null,
      })
      .onConflictDoUpdate({
        target: [deliveryStatements.agentUserId, deliveryStatements.orqspaceId, deliveryStatements.periodMonth],
        set: { totals, generatedAt: now, ...(finalize ? { status: 'FINAL' as const, finalizedAt: now } : {}) },
        where: ne(deliveryStatements.status, 'FINAL'),
      })
      .returning();
    return row ?? existing ?? null;
  }

  /**
   * Month-end close. Runs daily shortly after midnight IST; for each workspace it finalises every month that
   * has ended in the workspace's own timezone and is not final yet — so a missed run catches up (idempotent).
   */
  @Cron('0 30 0 * * *', { name: 'delivery-statements-month-end', timeZone: 'Asia/Kolkata' })
  async closeEndedMonths(now = new Date()): Promise<number> {
    const spaces = await this.db
      .select({ orqspaceId: deliveryEarnings.orqspaceId, timezone: orqspaceDeliverySettings.timezone })
      .from(deliveryEarnings)
      .leftJoin(orqspaceDeliverySettings, eq(orqspaceDeliverySettings.orqspaceId, deliveryEarnings.orqspaceId))
      .groupBy(deliveryEarnings.orqspaceId, orqspaceDeliverySettings.timezone);

    let finalized = 0;
    for (const space of spaces) {
      const current = periodMonthFor(now, space.timezone ?? 'Asia/Kolkata');
      const pairs = await this.db
        .selectDistinct({ agentUserId: deliveryEarnings.agentUserId, periodMonth: deliveryEarnings.periodMonth })
        .from(deliveryEarnings)
        .where(and(eq(deliveryEarnings.orqspaceId, space.orqspaceId), lt(deliveryEarnings.periodMonth, current)));
      for (const { agentUserId, periodMonth: closing } of pairs) {
        try {
          const before = await this.find(agentUserId, space.orqspaceId, closing);
          if (before?.status === 'FINAL') continue;
          const row = await this.rebuild(agentUserId, space.orqspaceId, closing, true);
          if (row?.status !== 'FINAL') continue;
          finalized++;
          await this.notifier.send({
            userId: agentUserId,
            type: 'STATEMENT_READY',
            title: `Statement for ${closing.slice(0, 7)} is ready`,
            body: `${row.totals.deliveries} deliveries · ${row.totals.approvedKm} km · ₹${row.totals.finalAmount}`,
            data: { periodMonth: closing, orqspaceId: space.orqspaceId },
          });
        } catch (error) {
          this.logger.warn(`Statement ${agentUserId}/${space.orqspaceId}/${closing} failed: ${(error as Error).message}`);
        }
      }
    }
    if (finalized) this.logger.log(`Finalised ${finalized} monthly statements`);
    return finalized;
  }

  /** Agent: statement history across workspaces (latest first). Current-month drafts are refreshed first. */
  async listForAgent(user: AuthUser, limit = 24): Promise<DeliveryStatementType[]> {
    await this.refreshCurrentDrafts({ agentUserId: user.id });
    const rows = await this.db
      .select()
      .from(deliveryStatements)
      .where(eq(deliveryStatements.agentUserId, user.id))
      .orderBy(desc(deliveryStatements.periodMonth))
      .limit(Math.min(Math.max(limit, 1), 120));
    return this.toTypes(rows);
  }

  /** Workspace: one statement per connected agent for the month. */
  async listForWorkspace(user: AuthUser, orqspaceId: string, periodMonth: string): Promise<DeliveryStatementType[]> {
    await this.access.assertCanManage(user, orqspaceId);
    const period = normalizePeriod(periodMonth);
    const agents = await this.db
      .selectDistinct({ agentUserId: deliveryEarnings.agentUserId })
      .from(deliveryEarnings)
      .where(and(eq(deliveryEarnings.orqspaceId, orqspaceId), eq(deliveryEarnings.periodMonth, period)));
    for (const { agentUserId } of agents) await this.rebuild(agentUserId, orqspaceId, period);
    const rows = await this.db
      .select()
      .from(deliveryStatements)
      .where(and(eq(deliveryStatements.orqspaceId, orqspaceId), eq(deliveryStatements.periodMonth, period)))
      .orderBy(desc(deliveryStatements.generatedAt));
    return this.toTypes(rows);
  }

  /** Status of an agent's statements for a month (FINAL only when every workspace statement is final). */
  async statusFor(agentUserId: string, periodMonth: string): Promise<'DRAFT' | 'FINAL' | null> {
    const rows = await this.db
      .select({ status: deliveryStatements.status })
      .from(deliveryStatements)
      .where(and(eq(deliveryStatements.agentUserId, agentUserId), eq(deliveryStatements.periodMonth, normalizePeriod(periodMonth))));
    if (!rows.length) return null;
    return rows.every((r) => r.status === 'FINAL') ? 'FINAL' : 'DRAFT';
  }

  private async refreshCurrentDrafts(filter: { agentUserId: string }) {
    const pairs = await this.db
      .selectDistinct({ orqspaceId: deliveryEarnings.orqspaceId, periodMonth: deliveryEarnings.periodMonth })
      .from(deliveryEarnings)
      .where(eq(deliveryEarnings.agentUserId, filter.agentUserId));
    for (const pair of pairs) await this.rebuild(filter.agentUserId, pair.orqspaceId, pair.periodMonth);
  }

  private async find(agentUserId: string, orqspaceId: string, period: string) {
    const [row] = await this.db
      .select()
      .from(deliveryStatements)
      .where(and(eq(deliveryStatements.agentUserId, agentUserId), eq(deliveryStatements.orqspaceId, orqspaceId), eq(deliveryStatements.periodMonth, period)));
    return row ?? null;
  }

  private async computeTotals(agentUserId: string, orqspaceId: string, period: string): Promise<StatementTotals> {
    const earnings = await this.db
      .select()
      .from(deliveryEarnings)
      .where(
        and(
          eq(deliveryEarnings.agentUserId, agentUserId),
          eq(deliveryEarnings.orqspaceId, orqspaceId),
          eq(deliveryEarnings.periodMonth, period),
          ne(deliveryEarnings.status, 'VOID'),
        ),
      );
    let km = 0;
    let base = 0;
    let adjustments = 0;
    let final = 0;
    let paid = 0;
    for (const e of earnings) {
      km += Number(e.approvedBillableKm);
      base += toPaise(e.baseAmount);
      adjustments += toPaise(e.adjustmentTotal);
      final += toPaise(e.finalAmount);
      if (e.status === 'PAID') paid += toPaise(e.finalAmount);
    }
    const taskIds = earnings.map((e) => e.taskId);
    const cod = taskIds.length
      ? await this.db
          .select({
            collected: sql<string>`coalesce(sum(${deliveryCodRecords.collectedAmount}), 0)`,
            settled: sql<string>`coalesce(sum(${deliveryCodRecords.settledAmount}), 0)`,
          })
          .from(deliveryCodRecords)
          .innerJoin(deliveryTasks, eq(deliveryTasks.id, deliveryCodRecords.taskId))
          .where(inArray(deliveryCodRecords.taskId, taskIds))
      : [{ collected: '0', settled: '0' }];
    return {
      deliveries: earnings.length,
      approvedKm: km.toFixed(2),
      baseAmount: fromPaise(base),
      adjustments: fromPaise(adjustments),
      finalAmount: fromPaise(final),
      paidAmount: fromPaise(paid),
      codCollected: fromPaise(toPaise(cod[0].collected)),
      codSettled: fromPaise(toPaise(cod[0].settled)),
    };
  }

  private async toTypes(rows: StatementRow[]): Promise<DeliveryStatementType[]> {
    if (!rows.length) return [];
    const spaces = await this.db
      .select({ id: orqspaces.id, name: orqspaces.name })
      .from(orqspaces)
      .where(inArray(orqspaces.id, [...new Set(rows.map((r) => r.orqspaceId))]));
    const users = await this.db
      .select()
      .from(orqUsers)
      .where(inArray(orqUsers.id, [...new Set(rows.map((r) => r.agentUserId))]));
    const spaceName = new Map(spaces.map((s) => [s.id, s.name]));
    const userById = new Map(users.map((u) => [u.id, u]));
    return rows.map((r) => {
      const [y, m] = r.periodMonth.split('-').map(Number);
      const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
      const agent = userById.get(r.agentUserId);
      return {
        id: r.id,
        agentUserId: r.agentUserId,
        agentName: agent ? displayNameOf(agent) : 'Agent',
        agentOrqUserId: agent?.orqUserId ?? '',
        orqspaceId: r.orqspaceId,
        orqspaceName: spaceName.get(r.orqspaceId) ?? 'Workspace',
        periodMonth: r.periodMonth,
        periodStart: r.periodMonth,
        periodEnd: `${r.periodMonth.slice(0, 8)}${String(lastDay).padStart(2, '0')}`,
        status: r.status,
        ...r.totals,
        outstandingAmount: fromPaise(Math.max(toPaise(r.totals.finalAmount) - toPaise(r.totals.paidAmount), 0)),
        generatedAt: r.generatedAt,
        finalizedAt: r.finalizedAt,
      };
    });
  }
}
