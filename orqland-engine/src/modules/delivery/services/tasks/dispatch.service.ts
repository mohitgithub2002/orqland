import { BadRequestException, ConflictException, Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { and, count, eq, inArray, ne } from 'drizzle-orm';
import type { AuthUser } from '@/core/decorators/current-user.decorator';
import { DRIZZLE, type DrizzleDB } from '@/infrastructure/database/drizzle.module';
import { deliveryStatusEvents, deliveryTasks, orderItems, type CodCollectionMethod, type OrderStatus } from '@/infrastructure/database/schema';
import { generateTaskNumber } from '@/core/utils/public-codes';
import { isUniqueViolation, type DbTx } from '@/core/utils/db-executor';
import { fromPaise, toPaise } from '@/core/utils/money';
import { OrderLifecycleService, type OrderActor, type OrderRow } from '@/modules/orders/services/lifecycle/order-lifecycle.service';
import { OrderPaymentsService } from '@/modules/orders/services/lifecycle/order-payments.service';
import { OrqspaceAccessService, type WorkspaceActor } from '@/modules/orders/services/shared/orqspace-access.service';
import { OrdersQueryService } from '@/modules/orders/services/orders-query.service';
import type { DispatchOrderInput, ReassignTaskInput, TaskReasonInput } from '../../dto/inputs/task.inputs';
import type { DeliveryTaskType } from '../../dto/types/delivery-task.type';
import { OVERRIDE_DELIVERABLE_STATUSES, PRE_PICKUP_STATUSES } from '../../helpers/delivery-state-machine';
import { haversineKm, round2, toLatLng } from '../../helpers/geo';
import { CodService } from '../cod/cod.service';
import { DeliveryNotifierService } from '../notifications/delivery-notifier.service';
import { DeliverySettingsService } from '../settings/delivery-settings.service';
import { TrackingService } from '../tracking/tracking.service';
import { AssignmentEngineService, type AssignmentOutcome } from './assignment-engine.service';
import { DeliveryOtpService } from './delivery-otp.service';
import { TaskQueryService } from './task-query.service';
import { TaskTransitionsService, type TaskRow, type TaskTransitionActor } from './task-transitions.service';

/** Order statuses in which a delivery can be created (assignment may start during preparation). */
export const DISPATCHABLE_ORDER_STATUSES: OrderStatus[] = ['PREPARING', 'READY_FOR_FULFILMENT'];

export type SelfDeliveryStep = 'PICKED_UP' | 'IN_TRANSIT' | 'DELIVERED' | 'FAILED' | 'RETURNED_TO_ORIGIN';

export interface SelfDeliveryUpdate {
  taskId: string;
  step: SelfDeliveryStep;
  reason?: string;
  otp?: string;
  recipientName?: string;
  codCollectedAmount?: string;
  codMethod?: CodCollectionMethod;
}

/** Module E — workspace-side delivery operations: dispatch, assignment, reassignment, cancellation, overrides. */
@Injectable()
export class DispatchService implements OnModuleInit {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    private readonly access: OrqspaceAccessService,
    private readonly orderLifecycle: OrderLifecycleService,
    private readonly orderPayments: OrderPaymentsService,
    private readonly ordersQuery: OrdersQueryService,
    private readonly settings: DeliverySettingsService,
    private readonly engine: AssignmentEngineService,
    private readonly transitions: TaskTransitionsService,
    private readonly query: TaskQueryService,
    private readonly cod: CodService,
    private readonly otp: DeliveryOtpService,
    private readonly tracking: TrackingService,
    private readonly notifier: DeliveryNotifierService,
  ) {}

  /** Cancelling an order cancels its delivery if the goods have not been picked up yet. */
  onModuleInit() {
    this.orderLifecycle.onBeforeCancel((tx, order, actor) => this.cancelActiveTaskForOrder(tx, order, actor));
    // Agents assigned during preparation are told as soon as the order is ready to collect.
    this.orderLifecycle.onAfterTransition(async (tx, order, from) => {
      if (from !== 'PREPARING' || order.orderStatus !== 'READY_FOR_FULFILMENT') return;
      const [task] = await tx
        .select({ id: deliveryTasks.id, agentUserId: deliveryTasks.agentUserId, taskNumber: deliveryTasks.taskNumber })
        .from(deliveryTasks)
        .where(and(eq(deliveryTasks.orderId, order.id), inArray(deliveryTasks.status, ['ACCEPTED', 'ARRIVING_AT_PICKUP'])));
      if (task?.agentUserId) {
        await this.notifier.send({ userId: task.agentUserId, type: 'ORDER_READY_FOR_PICKUP', title: 'Order ready for pickup', body: `${task.taskNumber} is packed and waiting for you`, data: { taskId: task.id } });
      }
    });
  }

  async dispatch(user: AuthUser, input: DispatchOrderInput): Promise<DeliveryTaskType> {
    const order = await this.ordersQuery.findOrder(input.orderId);
    const actor = await this.access.assertCanManage(user, order.orqspaceId);
    const settings = await this.settings.ensure(order.orqspaceId);

    // Agents can be assigned as soon as preparation starts, so they travel to the workspace while the
    // order is being prepared; pickup itself is only possible once the order is marked ready.
    if (!DISPATCHABLE_ORDER_STATUSES.includes(order.orderStatus)) {
      throw new BadRequestException('Start preparing the order before assigning a delivery');
    }
    if (!order.deliveryAddressSnapshot) throw new BadRequestException('The customer chose pickup — there is no delivery address');
    if (input.mode === 'AGENT') {
      if (settings.pickupLat === null || settings.pickupLng === null) {
        throw new BadRequestException('Set the workspace pickup location in Delivery settings before using agents');
      }
      if (!input.assignmentType) throw new BadRequestException('Choose manual or automatic assignment');
      if (input.assignmentType === 'MANUAL' && !input.agentUserId) throw new BadRequestException('Choose an agent');
    }

    const performer = this.workspacePerformer(actor);
    let outcome: AssignmentOutcome = { offer: null, attentionReason: null };
    let taskId: string;
    try {
      taskId = await this.db.transaction(async (tx) => {
        const locked = await this.orderLifecycle.lockOrder(tx, order.id);
        if (!DISPATCHABLE_ORDER_STATUSES.includes(locked.orderStatus)) throw new ConflictException('Order status changed, refresh and retry');
        // Delivery tasks exist only for physical products; services follow the separate booking pipeline (review §2.2).
        const nonProduct = await tx
          .select({ listingType: orderItems.listingType })
          .from(orderItems)
          .where(and(eq(orderItems.orderId, order.id), ne(orderItems.listingType, 'PRODUCT')))
          .limit(1);
        if (nonProduct.length) throw new BadRequestException('Only product orders can be dispatched for delivery');

        const [{ attempts }] = await tx.select({ attempts: count() }).from(deliveryTasks).where(eq(deliveryTasks.orderId, order.id));
        const pickup = toLatLng(settings.pickupLat, settings.pickupLng);
        const dropoff = toLatLng(locked.deliveryAddressSnapshot!.latitude, locked.deliveryAddressSnapshot!.longitude);
        const estimated = pickup && dropoff ? round2(haversineKm(pickup, dropoff) * Number(settings.roadDistanceFactor)) : null;
        const codDue = locked.paymentMethod === 'COD' ? toPaise(locked.totalAmount) - toPaise(await this.orderPayments.amountPaid(tx, order.id)) : 0;

        const [task] = await tx
          .insert(deliveryTasks)
          .values({
            taskNumber: generateTaskNumber(),
            orderId: order.id,
            orqspaceId: order.orqspaceId,
            mode: input.mode,
            assignmentType: input.mode === 'AGENT' ? input.assignmentType! : null,
            status: 'PENDING_ASSIGNMENT',
            selfStaffName: input.mode === 'SELF' ? (input.selfStaffName ?? null) : null,
            selfStaffPhone: input.mode === 'SELF' ? (input.selfStaffPhone ?? null) : null,
            pickupSnapshot: settings.pickupAddress,
            dropoffSnapshot: locked.deliveryAddressSnapshot!,
            pickupLat: settings.pickupLat,
            pickupLng: settings.pickupLng,
            dropoffLat: dropoff ? dropoff.lat.toFixed(6) : null,
            dropoffLng: dropoff ? dropoff.lng.toFixed(6) : null,
            estimatedDistanceKm: estimated?.toFixed(2) ?? null,
            codAmount: fromPaise(Math.max(codDue, 0)),
            attemptNo: attempts + 1,
          })
          .returning();
        if (settings.requireDeliveryOtp) {
          await tx.update(deliveryTasks).set({ deliveryOtpHash: this.otp.hashFor(task.id) }).where(eq(deliveryTasks.id, task.id));
        }
        await this.orderLifecycle.setFulfilmentMethod(tx, order.id, input.mode === 'SELF' ? 'SELF_DELIVERY' : 'AGENT_DELIVERY');
        await this.cod.createForTask(tx, task);
        await tx.insert(deliveryStatusEvents).values({
          taskId: task.id,
          fromStatus: null,
          toStatus: 'PENDING_ASSIGNMENT',
          actorUserId: actor.userId,
          actorRole: actor.role,
          metadata: { mode: input.mode, assignmentType: input.assignmentType ?? null },
        });

        if (input.mode === 'AGENT') {
          const fresh = await this.transitions.lock(tx, task.id);
          if (input.assignmentType === 'MANUAL') {
            outcome = { offer: await this.engine.offerTo(tx, fresh, input.agentUserId!, settings, performer), attentionReason: null };
          } else {
            outcome = await this.engine.offerNext(tx, fresh, settings);
          }
        }
        return task.id;
      });
    } catch (error) {
      if (isUniqueViolation(error, 'delivery_tasks_one_active_per_order_uq')) {
        throw new ConflictException('This order already has an active delivery');
      }
      throw error;
    }
    await this.notifyOutcome(outcome, actor);
    return this.query.getForWorkspace(user, taskId);
  }

  /** Before pickup only: withdraw/unassign the current agent and start a new assignment round. */
  async reassign(user: AuthUser, input: ReassignTaskInput): Promise<DeliveryTaskType> {
    const existing = await this.query.find(input.taskId);
    const actor = await this.access.assertCanManage(user, existing.orqspaceId);
    if (existing.mode !== 'AGENT') throw new BadRequestException('Only agent deliveries can be reassigned');
    if (!PRE_PICKUP_STATUSES.includes(existing.status)) throw new BadRequestException('Deliveries cannot be reassigned after pickup');
    if (input.assignmentType === 'MANUAL' && !input.agentUserId) throw new BadRequestException('Choose an agent');
    const settings = await this.settings.ensure(existing.orqspaceId);
    const performer = this.workspacePerformer(actor);
    const previousAgent = existing.agentUserId;

    let outcome: AssignmentOutcome = { offer: null, attentionReason: null };
    await this.db.transaction(async (tx) => {
      let task = await this.transitions.lock(tx, existing.id);
      const open = await this.engine.openOffer(tx, task.id);
      if (open) await this.engine.closeOffer(tx, open, 'WITHDRAWN', input.reason, performer);
      task = await this.transitions.lock(tx, task.id);
      if (task.status === 'ACCEPTED' || task.status === 'ARRIVING_AT_PICKUP' || task.status === 'PENDING_ASSIGNMENT') {
        task = await this.transitions.apply(tx, task, 'PENDING_ASSIGNMENT', performer, {
          reason: input.reason,
          patch: { agentUserId: null, connectionId: null, ratePerKmSnapshot: null, acceptedAt: null, assignmentType: input.assignmentType },
          metadata: { newAssignmentRound: true, previousAgent },
        });
      }
      outcome =
        input.assignmentType === 'MANUAL'
          ? { offer: await this.engine.offerTo(tx, task, input.agentUserId!, settings, performer), attentionReason: null }
          : await this.engine.offerNext(tx, task, settings);
    });

    if (previousAgent) {
      await this.notifier.send({
        userId: previousAgent,
        type: 'DELIVERY_CANCELLED',
        title: 'Delivery reassigned',
        body: `${existing.taskNumber} was reassigned by the workspace: ${input.reason}`,
      });
    }
    await this.notifyOutcome(outcome, actor);
    return this.query.getForWorkspace(user, existing.id);
  }

  async cancelTask(user: AuthUser, input: TaskReasonInput): Promise<DeliveryTaskType> {
    const existing = await this.query.find(input.taskId);
    const actor = await this.access.assertCanManage(user, existing.orqspaceId);
    if (!PRE_PICKUP_STATUSES.includes(existing.status)) {
      throw new BadRequestException('After pickup, mark the delivery failed instead of cancelling it');
    }
    await this.db.transaction(async (tx) => this.cancelLocked(tx, existing.id, this.workspacePerformer(actor), input.reason));
    if (existing.agentUserId) {
      await this.notifier.send({
        userId: existing.agentUserId,
        type: 'DELIVERY_CANCELLED',
        title: 'Delivery cancelled',
        body: `${existing.taskNumber}: ${input.reason}`,
      });
    }
    return this.query.getForWorkspace(user, existing.id);
  }

  /** Authorized override: mark an agent's task delivered with a recorded reason and audit entry. */
  async overrideDelivered(user: AuthUser, input: TaskReasonInput): Promise<DeliveryTaskType> {
    const existing = await this.query.find(input.taskId);
    const actor = await this.access.assertCanManage(user, existing.orqspaceId);
    if (!OVERRIDE_DELIVERABLE_STATUSES.includes(existing.status)) {
      throw new BadRequestException(`A ${existing.status} delivery cannot be marked delivered`);
    }
    await this.db.transaction(async (tx) => {
      const task = await this.transitions.lock(tx, existing.id);
      const measured = await this.tracking.measuredDistanceKm(tx, task.id, task.pickedUpAt, new Date());
      await this.transitions.apply(tx, task, 'DELIVERED', this.workspacePerformer(actor), {
        reason: input.reason,
        isOverride: true,
        patch: { podType: 'ADMIN_OVERRIDE', measuredDistanceKm: measured?.toFixed(2) ?? null, needsAttention: false },
      });
    });
    return this.query.getForWorkspace(user, existing.id);
  }

  /** SELF mode: the workspace performs the delivery steps itself. */
  async selfDeliveryUpdate(user: AuthUser, input: SelfDeliveryUpdate): Promise<DeliveryTaskType> {
    const existing = await this.query.find(input.taskId);
    const actor = await this.access.assertCanManage(user, existing.orqspaceId);
    if (existing.mode !== 'SELF' && input.step !== 'RETURNED_TO_ORIGIN') {
      throw new BadRequestException('Agent deliveries are updated by the agent');
    }
    const performer: TaskTransitionActor = { userId: actor.userId, role: actor.role, as: input.step === 'RETURNED_TO_ORIGIN' && existing.mode === 'AGENT' ? 'WORKSPACE' : 'PERFORMER' };

    await this.db.transaction(async (tx) => {
      const task = await this.transitions.lock(tx, existing.id);
      if (input.step === 'DELIVERED') {
        await this.assertProof(task, input.otp, input.codCollectedAmount, input.codMethod);
        if (task.mode === 'SELF' && input.codCollectedAmount && input.codMethod) {
          await this.cod.recordCollection(tx, task.id, input.codCollectedAmount, input.codMethod);
        }
        await this.transitions.apply(tx, task, 'DELIVERED', performer, {
          patch: { podType: input.otp ? 'OTP' : 'SIGNATURE_NAME', podRecipientName: input.recipientName ?? null },
        });
      } else if (input.step === 'FAILED' || input.step === 'RETURNED_TO_ORIGIN') {
        if (!input.reason?.trim()) throw new BadRequestException('A reason is required');
        await this.transitions.apply(tx, task, input.step, performer, { reason: input.reason });
      } else {
        if (input.step === 'PICKED_UP') {
          // "Out for delivery" by the workspace's own staff finishes preparation in the same step.
          const order = await this.orderLifecycle.lockOrder(tx, task.orderId);
          if (order.orderStatus === 'PREPARING') {
            await this.orderLifecycle.transition({ orderId: order.id, to: 'READY_FOR_FULFILMENT', actor: { userId: actor.userId, role: actor.role } }, tx);
          }
        }
        await this.transitions.apply(tx, task, input.step, performer, { reason: input.reason ?? null });
      }
    });
    await this.cod.notifyDiscrepancy(existing.id);
    return this.query.getForWorkspace(user, existing.id);
  }

  /** Shared proof checks used by agents and self-delivery. */
  async assertProof(task: TaskRow, otp: string | undefined, codAmount: string | undefined, codMethod: string | undefined) {
    if (task.deliveryOtpHash) {
      if (!otp) throw new BadRequestException('Enter the 4-digit delivery code from the customer');
      if (!this.otp.verify(task.id, task.deliveryOtpHash, otp)) {
        throw new BadRequestException({ code: 'INVALID_OTP', message: 'The delivery code is incorrect' });
      }
    }
    if (toPaise(task.codAmount) > 0 && (!codAmount || !codMethod)) {
      throw new BadRequestException(`Record the cash collected (₹${task.codAmount} expected)`);
    }
  }

  private async cancelActiveTaskForOrder(tx: DbTx, order: OrderRow, actor: OrderActor) {
    const active = await this.query.latestRowForOrder(order.id);
    if (!active || ['DELIVERED', 'FAILED', 'CANCELLED', 'RETURNED_TO_ORIGIN'].includes(active.status)) return;
    if (!PRE_PICKUP_STATUSES.includes(active.status)) {
      throw new BadRequestException('The order is already out for delivery and cannot be cancelled');
    }
    const performer: TaskTransitionActor = { userId: actor.userId, role: actor.role, as: 'WORKSPACE' };
    await this.cancelLocked(tx, active.id, performer, 'Order cancelled');
  }

  private async cancelLocked(tx: DbTx, taskId: string, actor: TaskTransitionActor, reason: string) {
    const open = await this.engine.openOffer(tx, taskId);
    if (open) await this.engine.closeOffer(tx, open, 'WITHDRAWN', reason, actor);
    const task = await this.transitions.lock(tx, taskId);
    await this.transitions.apply(tx, task, 'CANCELLED', actor, { reason, patch: { needsAttention: false } });
  }

  private workspacePerformer(actor: WorkspaceActor): TaskTransitionActor {
    return { userId: actor.userId, role: actor.role, as: 'WORKSPACE' };
  }

  private async notifyOutcome(outcome: AssignmentOutcome, actor: WorkspaceActor) {
    if (outcome.offer) {
      await this.notifier.send({
        userId: outcome.offer.agentUserId,
        type: 'DELIVERY_OFFERED',
        title: `New delivery from ${actor.orqspace.name}`,
        body: `₹${outcome.offer.ratePerKmOffered}/km · respond before ${outcome.offer.expiresAt.toISOString()}`,
        data: { offerId: outcome.offer.id },
      });
    } else if (outcome.attentionReason) {
      await this.notifier.send({
        userId: actor.orqspace.ownerId,
        type: 'DELIVERY_UNASSIGNED',
        title: 'Delivery needs an agent',
        body: outcome.attentionReason,
      });
    }
  }
}

