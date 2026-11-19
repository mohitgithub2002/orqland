import { Inject, Injectable } from '@nestjs/common';
import { and, count, eq, inArray, sql } from 'drizzle-orm';
import type { AuthUser } from '@/core/decorators/current-user.decorator';
import { fromPaise, toPaise } from '@/core/utils/money';
import { deliveryConfig } from '@/config/delivery.config';
import { ordersConfig } from '@/config/orders.config';
import { DRIZZLE, type DrizzleDB } from '@/infrastructure/database/drizzle.module';
import {
  deliveryAgentProfiles,
  deliveryCodRecords,
  deliveryOffers,
  deliveryTasks,
  orders,
  orqspaceAgentConnections,
  orqUsers,
  type DeliveryTaskStatus,
} from '@/infrastructure/database/schema';
import { OrqspaceAccessService } from '@/modules/orders/services/shared/orqspace-access.service';
import type { DeliveryOperationsType, SlaBreachType } from '../../dto/types/operations.type';
import { displayNameOf } from '../agents/agent-directory.service';
import { DeliverySettingsService } from '../settings/delivery-settings.service';

const minutes = (ms: number) => Math.round((ms / 60_000) * 10) / 10;

/**
 * Operations overview for the workspace console (guide §11 "Delivery overview and order queue",
 * "Live delivery monitoring"): queue counts, agent availability, time-to-accept / pickup / deliver
 * medians, SLA attainment, current SLA breaches, COD outstanding and a 14-day trend.
 */
@Injectable()
export class DeliveryOperationsService {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    private readonly access: OrqspaceAccessService,
    private readonly settings: DeliverySettingsService,
  ) {}

  async overview(user: AuthUser, orqspaceId: string, now = new Date()): Promise<DeliveryOperationsType> {
    await this.access.assertCanManage(user, orqspaceId);
    const settings = await this.settings.ensure(orqspaceId);
    const tz = settings.timezone;
    const since = sql`now() - interval '7 days'`;

    const orderCounts = await this.db
      .select({ status: orders.orderStatus, n: count() })
      .from(orders)
      .where(eq(orders.orqspaceId, orqspaceId))
      .groupBy(orders.orderStatus);
    const oc = new Map(orderCounts.map((r) => [r.status, r.n]));

    const taskCounts = await this.db
      .select({ status: deliveryTasks.status, n: count() })
      .from(deliveryTasks)
      .where(eq(deliveryTasks.orqspaceId, orqspaceId))
      .groupBy(deliveryTasks.status);
    const tc = new Map(taskCounts.map((r) => [r.status, r.n]));
    const sum = (statuses: DeliveryTaskStatus[]) => statuses.reduce((acc, s) => acc + (tc.get(s) ?? 0), 0);

    const today = sql`(now() AT TIME ZONE ${tz})::date`;
    const [todayRow] = await this.db
      .select({
        delivered: sql<number>`count(*) FILTER (WHERE (${deliveryTasks.deliveredAt} AT TIME ZONE ${tz})::date = ${today})::int`,
        failed: sql<number>`count(*) FILTER (WHERE (${deliveryTasks.failedAt} AT TIME ZONE ${tz})::date = ${today})::int`,
      })
      .from(deliveryTasks)
      .where(eq(deliveryTasks.orqspaceId, orqspaceId));
    const [attention] = await this.db
      .select({ n: count() })
      .from(deliveryTasks)
      .where(and(eq(deliveryTasks.orqspaceId, orqspaceId), eq(deliveryTasks.needsAttention, true), inArray(deliveryTasks.status, ['PENDING_ASSIGNMENT', 'OFFERED'])));
    const [openOffers] = await this.db
      .select({ n: count() })
      .from(deliveryOffers)
      .innerJoin(deliveryTasks, eq(deliveryTasks.id, deliveryOffers.taskId))
      .where(and(eq(deliveryTasks.orqspaceId, orqspaceId), eq(deliveryOffers.status, 'OFFERED')));

    // Medians over the last 7 days (minutes).
    const median = (expr: ReturnType<typeof sql>) => sql<number | null>`percentile_cont(0.5) WITHIN GROUP (ORDER BY extract(epoch FROM ${expr}) / 60)`;
    const [orderTimes] = await this.db
      .select({
        toAccept: median(sql`${orders.acceptedAt} - ${orders.createdAt}`),
        acceptedOnTime: sql<number>`count(*) FILTER (WHERE ${orders.acceptedAt} - ${orders.createdAt} <= make_interval(mins => ${ordersConfig.slaAcceptMinutes}))::int`,
        accepted: sql<number>`count(*)::int`,
      })
      .from(orders)
      .where(and(eq(orders.orqspaceId, orqspaceId), sql`${orders.acceptedAt} IS NOT NULL`, sql`${orders.createdAt} >= ${since}`));
    const [taskTimes] = await this.db
      .select({
        toAssign: median(sql`${deliveryTasks.acceptedAt} - ${deliveryTasks.createdAt}`),
        toPickup: median(sql`${deliveryTasks.pickedUpAt} - ${deliveryTasks.acceptedAt}`),
        toDeliver: median(sql`${deliveryTasks.deliveredAt} - ${deliveryTasks.pickedUpAt}`),
        endToEnd: median(sql`${deliveryTasks.deliveredAt} - ${deliveryTasks.createdAt}`),
        delivered: sql<number>`count(*) FILTER (WHERE ${deliveryTasks.status} = 'DELIVERED')::int`,
        deliveredOnTime: sql<number>`count(*) FILTER (WHERE ${deliveryTasks.status} = 'DELIVERED' AND ${deliveryTasks.deliveredAt} - ${deliveryTasks.pickedUpAt} <= make_interval(mins => ${deliveryConfig.slaDeliverMinutes}))::int`,
        failed: sql<number>`count(*) FILTER (WHERE ${deliveryTasks.status} IN ('FAILED', 'RETURNED_TO_ORIGIN'))::int`,
        avgKm: sql<string | null>`avg(coalesce(${deliveryTasks.measuredDistanceKm}, ${deliveryTasks.estimatedDistanceKm})) FILTER (WHERE ${deliveryTasks.status} = 'DELIVERED')`,
      })
      .from(deliveryTasks)
      .where(and(eq(deliveryTasks.orqspaceId, orqspaceId), sql`${deliveryTasks.createdAt} >= ${since}`));

    // Agents connected to this workspace and their live state.
    const agents = await this.db
      .select({ connection: orqspaceAgentConnections, profile: deliveryAgentProfiles, user: orqUsers })
      .from(orqspaceAgentConnections)
      .innerJoin(deliveryAgentProfiles, eq(deliveryAgentProfiles.userId, orqspaceAgentConnections.agentUserId))
      .innerJoin(orqUsers, eq(orqUsers.id, orqspaceAgentConnections.agentUserId))
      .where(and(eq(orqspaceAgentConnections.orqspaceId, orqspaceId), eq(orqspaceAgentConnections.status, 'ACTIVE')));
    const agentIds = agents.map((a) => a.profile.userId);
    const workload = agentIds.length
      ? await this.db
          .select({
            agentUserId: deliveryTasks.agentUserId,
            active: sql<number>`count(*) FILTER (WHERE ${deliveryTasks.status} IN ('ACCEPTED', 'ARRIVING_AT_PICKUP', 'PICKED_UP', 'IN_TRANSIT'))::int`,
            deliveredToday: sql<number>`count(*) FILTER (WHERE (${deliveryTasks.deliveredAt} AT TIME ZONE ${tz})::date = ${today})::int`,
          })
          .from(deliveryTasks)
          .where(and(eq(deliveryTasks.orqspaceId, orqspaceId), inArray(deliveryTasks.agentUserId, agentIds)))
          .groupBy(deliveryTasks.agentUserId)
      : [];
    const loadByAgent = new Map(workload.map((w) => [w.agentUserId, w]));
    const staleMs = deliveryConfig.staleLocationSeconds * 1000;

    const [cod] = await this.db
      .select({
        expected: sql<string>`coalesce(sum(${deliveryCodRecords.expectedAmount}) FILTER (WHERE ${deliveryCodRecords.status} NOT IN ('SETTLED', 'NOT_COLLECTED')), 0)`,
        collected: sql<string>`coalesce(sum(${deliveryCodRecords.collectedAmount}) FILTER (WHERE ${deliveryCodRecords.status} NOT IN ('SETTLED', 'NOT_COLLECTED')), 0)`,
        settled: sql<string>`coalesce(sum(${deliveryCodRecords.settledAmount}) FILTER (WHERE ${deliveryCodRecords.status} NOT IN ('SETTLED', 'NOT_COLLECTED')), 0)`,
        discrepancies: sql<number>`count(*) FILTER (WHERE ${deliveryCodRecords.status} = 'DISCREPANCY')::int`,
      })
      .from(deliveryCodRecords)
      .where(eq(deliveryCodRecords.orqspaceId, orqspaceId));

    const trend = await this.db.execute<{ day: string; delivered: number; failed: number }>(sql`
      WITH days AS (
        SELECT generate_series((now() AT TIME ZONE ${tz})::date - 13, (now() AT TIME ZONE ${tz})::date, interval '1 day')::date AS day
      )
      SELECT to_char(d.day, 'YYYY-MM-DD') AS day,
        (SELECT count(*)::int FROM ${deliveryTasks} t WHERE t.orqspace_id = ${orqspaceId} AND (t.delivered_at AT TIME ZONE ${tz})::date = d.day) AS delivered,
        (SELECT count(*)::int FROM ${deliveryTasks} t WHERE t.orqspace_id = ${orqspaceId} AND (t.failed_at AT TIME ZONE ${tz})::date = d.day) AS failed
      FROM days d ORDER BY d.day`);

    const delivered7 = taskTimes?.delivered ?? 0;
    return {
      orqspaceId,
      generatedAt: now,
      timezone: tz,
      queue: {
        newOrders: oc.get('PLACED') ?? 0,
        preparing: (oc.get('ACCEPTED') ?? 0) + (oc.get('PREPARING') ?? 0),
        readyForFulfilment: oc.get('READY_FOR_FULFILMENT') ?? 0,
        awaitingPickup: oc.get('AWAITING_CUSTOMER_PICKUP') ?? 0,
        outForDelivery: oc.get('OUT_FOR_DELIVERY') ?? 0,
        deliveryFailed: oc.get('DELIVERY_FAILED') ?? 0,
      },
      deliveries: {
        unassigned: sum(['PENDING_ASSIGNMENT']),
        offered: sum(['OFFERED']),
        toPickup: sum(['ACCEPTED', 'ARRIVING_AT_PICKUP']),
        inTransit: sum(['PICKED_UP', 'IN_TRANSIT']),
        needsAttention: attention.n,
        openOffers: openOffers.n,
        deliveredToday: todayRow?.delivered ?? 0,
        failedToday: todayRow?.failed ?? 0,
      },
      timings: {
        windowDays: 7,
        medianOrderAcceptMinutes: round(orderTimes?.toAccept),
        medianAssignMinutes: round(taskTimes?.toAssign),
        medianPickupMinutes: round(taskTimes?.toPickup),
        medianDeliverMinutes: round(taskTimes?.toDeliver),
        medianEndToEndMinutes: round(taskTimes?.endToEnd),
        orderAcceptSlaPercent: pct(orderTimes?.acceptedOnTime, orderTimes?.accepted),
        deliverySlaPercent: pct(taskTimes?.deliveredOnTime, delivered7),
        successRatePercent: pct(delivered7, delivered7 + (taskTimes?.failed ?? 0)),
        averageDistanceKm: taskTimes?.avgKm ? Number(taskTimes.avgKm).toFixed(2) : null,
        slaTargets: {
          orderAcceptMinutes: ordersConfig.slaAcceptMinutes,
          assignMinutes: deliveryConfig.slaAcceptMinutes,
          pickupMinutes: deliveryConfig.slaPickupMinutes,
          deliverMinutes: deliveryConfig.slaDeliverMinutes,
        },
      },
      agents: {
        connected: agents.length,
        connectionLimit: deliveryConfig.maxAgentsPerWorkspace,
        online: agents.filter((a) => a.profile.availability === 'ONLINE').length,
        busy: agents.filter((a) => a.profile.availability === 'BUSY').length,
        offline: agents.filter((a) => a.profile.availability === 'OFFLINE').length,
        staleLocation: agents.filter(
          (a) => a.profile.availability !== 'OFFLINE' && (!a.profile.lastLocationAt || now.getTime() - a.profile.lastLocationAt.getTime() > staleMs),
        ).length,
        workload: agents.map((a) => ({
          agentUserId: a.profile.userId,
          displayName: displayNameOf(a.user),
          orqUserId: a.user.orqUserId,
          availability: a.profile.availability,
          activeTasks: loadByAgent.get(a.profile.userId)?.active ?? 0,
          deliveredToday: loadByAgent.get(a.profile.userId)?.deliveredToday ?? 0,
          maxConcurrentTasks: a.profile.maxConcurrentTasks,
          ratePerKm: a.connection.currentRatePerKm,
          lastLocationAt: a.profile.lastLocationAt,
          locationStale: !a.profile.lastLocationAt || now.getTime() - a.profile.lastLocationAt.getTime() > staleMs,
          disconnectPending: a.connection.disconnectRequestStatus === 'REQUESTED',
        })),
      },
      cod: {
        outstanding: fromPaise(Math.max(toPaise(cod.collected) - toPaise(cod.settled), 0)),
        expectedOpen: fromPaise(toPaise(cod.expected)),
        discrepancies: cod.discrepancies,
      },
      breaches: await this.breaches(orqspaceId, now),
      trend: trend.rows.map((r) => ({ day: r.day, delivered: Number(r.delivered), failed: Number(r.failed) })),
    };
  }

  /** Items currently past their SLA target, most overdue first. */
  async breaches(orqspaceId: string, now = new Date()): Promise<SlaBreachType[]> {
    const result: SlaBreachType[] = [];
    const late = (since: Date | null, target: number) => (since ? minutes(now.getTime() - since.getTime()) - target : -1);

    const placed = await this.db
      .select({ id: orders.id, orderNumber: orders.orderNumber, createdAt: orders.createdAt })
      .from(orders)
      .where(and(eq(orders.orqspaceId, orqspaceId), eq(orders.orderStatus, 'PLACED')));
    for (const o of placed) {
      const over = late(o.createdAt, ordersConfig.slaAcceptMinutes);
      if (over > 0) result.push({ kind: 'ORDER_ACCEPT', orderId: o.id, taskId: null, reference: o.orderNumber, stage: 'Accept order', minutesOver: over, targetMinutes: ordersConfig.slaAcceptMinutes });
    }

    const active = await this.db
      .select()
      .from(deliveryTasks)
      .where(and(eq(deliveryTasks.orqspaceId, orqspaceId), inArray(deliveryTasks.status, ['PENDING_ASSIGNMENT', 'OFFERED', 'ACCEPTED', 'ARRIVING_AT_PICKUP', 'PICKED_UP', 'IN_TRANSIT'])));
    for (const t of active) {
      let stage: string;
      let target: number;
      let since: Date | null;
      if (t.status === 'PENDING_ASSIGNMENT' || t.status === 'OFFERED') {
        [stage, target, since] = ['Assign agent', deliveryConfig.slaAcceptMinutes, t.createdAt];
      } else if (t.status === 'ACCEPTED' || t.status === 'ARRIVING_AT_PICKUP') {
        [stage, target, since] = ['Pick up', deliveryConfig.slaPickupMinutes, t.acceptedAt];
      } else {
        [stage, target, since] = ['Deliver', deliveryConfig.slaDeliverMinutes, t.pickedUpAt];
      }
      const over = late(since, target);
      if (over > 0) result.push({ kind: 'DELIVERY', orderId: t.orderId, taskId: t.id, reference: t.taskNumber, stage, minutesOver: over, targetMinutes: target });
    }
    return result.sort((a, b) => b.minutesOver - a.minutesOver).slice(0, 50);
  }
}

function round(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  return Math.round(Number(value) * 10) / 10;
}

function pct(part: number | null | undefined, whole: number | null | undefined): number | null {
  if (!whole) return null;
  return Math.round(((part ?? 0) / whole) * 1000) / 10;
}
