import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, count, desc, eq, ilike, inArray, notInArray, or, type SQL } from 'drizzle-orm';
import type { AuthUser } from '@/core/decorators/current-user.decorator';
import { DRIZZLE, type DrizzleDB } from '@/infrastructure/database/drizzle.module';
import {
  deliveryOffers,
  deliveryStatusEvents,
  deliveryTasks,
  orders,
  orqspaceAgentConnections,
  orqspaces,
  orqUsers,
  type AddressSnapshot,
} from '@/infrastructure/database/schema';
import { fromPaise, toPaise } from '@/core/utils/money';
import { OrqspaceAccessService } from '@/modules/orders/services/shared/orqspace-access.service';
import type { WorkspaceTasksFilterInput } from '../../dto/inputs/task.inputs';
import type {
  AgentOfferType,
  DeliveryOfferType,
  DeliveryStatusEventType,
  DeliveryTaskPageType,
  DeliveryTaskType,
} from '../../dto/types/delivery-task.type';
import { AGENT_LOAD_STATUSES, TERMINAL_TASK_STATUSES } from '../../helpers/delivery-state-machine';
import { AgentDirectoryService, displayNameOf } from '../agents/agent-directory.service';
import type { OfferRow } from './assignment-engine.service';
import type { TaskRow } from './task-transitions.service';

type Viewer = { kind: 'WORKSPACE' } | { kind: 'AGENT'; agentUserId: string } | { kind: 'CUSTOMER' };

const areaOf = (a: AddressSnapshot | null) => (a ? [a.city ?? a.district, a.pincode].filter(Boolean).join(' ') || null : null);

@Injectable()
export class TaskQueryService {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    private readonly access: OrqspaceAccessService,
    private readonly directory: AgentDirectoryService,
  ) {}

  // ── workspace ──────────────────────────────────────────────────────────

  async listForWorkspace(user: AuthUser, filter: WorkspaceTasksFilterInput): Promise<DeliveryTaskPageType> {
    await this.access.assertCanManage(user, filter.orqspaceId);
    const conditions: SQL[] = [eq(deliveryTasks.orqspaceId, filter.orqspaceId)];
    if (filter.statuses?.length) conditions.push(inArray(deliveryTasks.status, filter.statuses));
    if (filter.needsAttention !== undefined) conditions.push(eq(deliveryTasks.needsAttention, filter.needsAttention));
    if (filter.search?.trim()) {
      const term = `%${filter.search.trim()}%`;
      conditions.push(or(ilike(deliveryTasks.taskNumber, term), ilike(orders.orderNumber, term))!);
    }
    const where = and(...conditions);
    const [{ total }] = await this.db
      .select({ total: count() })
      .from(deliveryTasks)
      .innerJoin(orders, eq(orders.id, deliveryTasks.orderId))
      .where(where);
    const rows = await this.db
      .select({ task: deliveryTasks })
      .from(deliveryTasks)
      .innerJoin(orders, eq(orders.id, deliveryTasks.orderId))
      .where(where)
      .orderBy(desc(deliveryTasks.createdAt))
      .limit(filter.pageSize)
      .offset((filter.page - 1) * filter.pageSize);
    return {
      items: await this.toTypes(
        rows.map((r) => r.task),
        { kind: 'WORKSPACE' },
      ),
      total,
      page: filter.page,
      pageSize: filter.pageSize,
    };
  }

  /** Live operations board: every non-terminal task with its agent's last known position. */
  async liveForWorkspace(user: AuthUser, orqspaceId: string): Promise<DeliveryTaskType[]> {
    await this.access.assertCanManage(user, orqspaceId);
    const rows = await this.db
      .select()
      .from(deliveryTasks)
      .where(and(eq(deliveryTasks.orqspaceId, orqspaceId), notInArray(deliveryTasks.status, TERMINAL_TASK_STATUSES)))
      .orderBy(desc(deliveryTasks.needsAttention), asc(deliveryTasks.createdAt));
    return this.toTypes(rows, { kind: 'WORKSPACE' });
  }

  async getForWorkspace(user: AuthUser, taskId: string): Promise<DeliveryTaskType> {
    const task = await this.find(taskId);
    await this.access.assertCanManage(user, task.orqspaceId);
    return (await this.toTypes([task], { kind: 'WORKSPACE' }))[0];
  }

  async latestRowForOrder(orderId: string): Promise<TaskRow | null> {
    const [row] = await this.db
      .select()
      .from(deliveryTasks)
      .where(eq(deliveryTasks.orderId, orderId))
      .orderBy(desc(deliveryTasks.createdAt))
      .limit(1);
    return row ?? null;
  }

  async forOrder(orderId: string, viewer: Viewer): Promise<DeliveryTaskType | null> {
    const row = await this.latestRowForOrder(orderId);
    return row ? (await this.toTypes([row], viewer))[0] : null;
  }

  async events(taskId: string): Promise<DeliveryStatusEventType[]> {
    const rows = await this.db
      .select({ event: deliveryStatusEvents, actor: orqUsers })
      .from(deliveryStatusEvents)
      .leftJoin(orqUsers, eq(orqUsers.id, deliveryStatusEvents.actorUserId))
      .where(eq(deliveryStatusEvents.taskId, taskId))
      .orderBy(asc(deliveryStatusEvents.createdAt));
    return rows.map(({ event, actor }) => ({ ...event, actorName: actor ? displayNameOf(actor) : null }));
  }

  async offers(taskId: string): Promise<DeliveryOfferType[]> {
    const rows = await this.db.select().from(deliveryOffers).where(eq(deliveryOffers.taskId, taskId)).orderBy(asc(deliveryOffers.offeredAt));
    return this.offerTypes(rows);
  }

  // ── agent ──────────────────────────────────────────────────────────────

  async agentActiveTasks(agentUserId: string): Promise<DeliveryTaskType[]> {
    const rows = await this.db
      .select()
      .from(deliveryTasks)
      .where(and(eq(deliveryTasks.agentUserId, agentUserId), inArray(deliveryTasks.status, [...AGENT_LOAD_STATUSES, 'FAILED'])))
      .orderBy(asc(deliveryTasks.acceptedAt));
    // FAILED tasks stay on the agent's board until returned to origin.
    return this.toTypes(rows, { kind: 'AGENT', agentUserId });
  }

  async agentHistory(agentUserId: string, limit = 30): Promise<DeliveryTaskType[]> {
    const rows = await this.db
      .select()
      .from(deliveryTasks)
      .where(and(eq(deliveryTasks.agentUserId, agentUserId), inArray(deliveryTasks.status, ['DELIVERED', 'RETURNED_TO_ORIGIN', 'CANCELLED'])))
      .orderBy(desc(deliveryTasks.updatedAt))
      .limit(limit);
    return this.toTypes(rows, { kind: 'AGENT', agentUserId });
  }

  async agentOpenOffers(agentUserId: string): Promise<AgentOfferType[]> {
    const offers = await this.db
      .select()
      .from(deliveryOffers)
      .where(and(eq(deliveryOffers.agentUserId, agentUserId), eq(deliveryOffers.status, 'OFFERED')))
      .orderBy(asc(deliveryOffers.expiresAt));
    if (!offers.length) return [];
    const tasks = await this.db.select().from(deliveryTasks).where(inArray(deliveryTasks.id, offers.map((o) => o.taskId)));
    const taskTypes = new Map((await this.toTypes(tasks, { kind: 'AGENT', agentUserId })).map((t) => [t.id, t]));
    const offerTypes = await this.offerTypes(offers);
    return offerTypes.filter((o) => taskTypes.has(o.taskId)).map((offer) => ({ offer, task: taskTypes.get(offer.taskId)! }));
  }

  async getForAgent(agentUserId: string, taskId: string): Promise<DeliveryTaskType> {
    const task = await this.find(taskId);
    const [offer] = await this.db
      .select({ id: deliveryOffers.id })
      .from(deliveryOffers)
      .where(and(eq(deliveryOffers.taskId, taskId), eq(deliveryOffers.agentUserId, agentUserId)))
      .limit(1);
    if (task.agentUserId !== agentUserId && !offer) throw new NotFoundException('Delivery not found');
    return (await this.toTypes([task], { kind: 'AGENT', agentUserId }))[0];
  }

  async find(taskId: string): Promise<TaskRow> {
    const [task] = await this.db.select().from(deliveryTasks).where(eq(deliveryTasks.id, taskId));
    if (!task) throw new NotFoundException('Delivery not found');
    return task;
  }

  // ── mapping ────────────────────────────────────────────────────────────

  async toTypes(rows: TaskRow[], viewer: Viewer): Promise<DeliveryTaskType[]> {
    if (!rows.length) return [];
    const orderRows = await this.db
      .select({ id: orders.id, orderNumber: orders.orderNumber })
      .from(orders)
      .where(inArray(orders.id, [...new Set(rows.map((r) => r.orderId))]));
    const orderNumber = new Map(orderRows.map((o) => [o.id, o.orderNumber]));
    const spaceRows = await this.db
      .select({ id: orqspaces.id, name: orqspaces.name })
      .from(orqspaces)
      .where(inArray(orqspaces.id, [...new Set(rows.map((r) => r.orqspaceId))]));
    const spaceName = new Map(spaceRows.map((s) => [s.id, s.name]));

    const open = await this.db
      .select()
      .from(deliveryOffers)
      .where(and(inArray(deliveryOffers.taskId, rows.map((r) => r.id)), eq(deliveryOffers.status, 'OFFERED')));
    const openOffer = new Map((await this.offerTypes(open)).map((o) => [o.taskId, o]));

    const agentIds = rows.map((r) => r.agentUserId).filter((id): id is string => !!id);
    const agents = viewer.kind === 'WORKSPACE' ? await this.directory.summaries(agentIds, true) : new Map();

    // Current connection rate is the best estimate for tasks not yet accepted.
    const connectionIds = [...new Set(open.map((o) => o.connectionId))];
    const rates = connectionIds.length
      ? await this.db
          .select({ id: orqspaceAgentConnections.id, rate: orqspaceAgentConnections.currentRatePerKm })
          .from(orqspaceAgentConnections)
          .where(inArray(orqspaceAgentConnections.id, connectionIds))
      : [];
    const rateByConnection = new Map(rates.map((r) => [r.id, r.rate]));

    return rows.map((task) => {
      const offer = openOffer.get(task.id) ?? null;
      const hideDropoff = viewer.kind === 'AGENT' && (task.agentUserId !== viewer.agentUserId || task.status === 'OFFERED');
      const rate = task.ratePerKmSnapshot ?? (offer ? (rateByConnection.get(open.find((o) => o.id === offer.id)!.connectionId) ?? offer.ratePerKmOffered) : null);
      const estimatedEarnings =
        rate && task.estimatedDistanceKm ? fromPaise(Math.round(Number(task.estimatedDistanceKm) * toPaise(rate))) : null;
      return {
        ...task,
        orderNumber: orderNumber.get(task.orderId) ?? '',
        orqspaceName: spaceName.get(task.orqspaceId) ?? 'Workspace',
        agent: task.agentUserId ? (agents.get(task.agentUserId) ?? null) : null,
        dropoffSnapshot: hideDropoff ? null : task.dropoffSnapshot,
        dropoffArea: areaOf(task.dropoffSnapshot),
        pickupLat: task.pickupLat === null ? null : Number(task.pickupLat),
        pickupLng: task.pickupLng === null ? null : Number(task.pickupLng),
        dropoffLat: hideDropoff || task.dropoffLat === null ? null : Number(task.dropoffLat),
        dropoffLng: hideDropoff || task.dropoffLng === null ? null : Number(task.dropoffLng),
        estimatedEarnings,
        requiresOtp: !!task.deliveryOtpHash,
        currentOffer: viewer.kind === 'AGENT' && offer?.agentUserId !== viewer.agentUserId ? null : offer,
        selfStaffPhone: viewer.kind === 'WORKSPACE' ? task.selfStaffPhone : null,
      };
    });
  }

  private async offerTypes(rows: OfferRow[]): Promise<DeliveryOfferType[]> {
    if (!rows.length) return [];
    const users = await this.db.select().from(orqUsers).where(inArray(orqUsers.id, [...new Set(rows.map((r) => r.agentUserId))]));
    const name = new Map(users.map((u) => [u.id, displayNameOf(u)]));
    return rows.map((r) => ({ ...r, agentName: name.get(r.agentUserId) ?? null }));
  }
}
