import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, desc, eq, sql } from 'drizzle-orm';
import type { AuthUser } from '@/core/decorators/current-user.decorator';
import { DRIZZLE, type DrizzleDB } from '@/infrastructure/database/drizzle.module';
import { ordersConfig } from '@/config/orders.config';
import { orders, orderStatusHistory, type OrderStatus } from '@/infrastructure/database/schema';
import type {
  AcceptOrderInput,
  ApproveRefundInput,
  ExtendPreparationInput,
  MarkOrderReturnedInput,
  OrderActionInput,
  OrderReasonInput,
  RecordOrderPaymentInput,
  ScheduleReturnPickupInput,
  StartPreparationInput,
} from '../../dto/inputs/order-action.inputs';
import { AuditService } from '../shared/audit.service';
import { OrdersQueryService } from '../orders-query.service';
import { OrqspaceAccessService } from '../shared/orqspace-access.service';
import { OrderLifecycleService, type OrderRow } from './order-lifecycle.service';
import { OrderPaymentsService } from './order-payments.service';

/** Authorization-aware entry points for workspace and customer order actions. */
@Injectable()
export class OrderActionsService {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    private readonly lifecycle: OrderLifecycleService,
    private readonly payments: OrderPaymentsService,
    private readonly query: OrdersQueryService,
    private readonly access: OrqspaceAccessService,
    private readonly audit: AuditService,
  ) {}

  /** Accept, or "Accept & Start Prep" (accept and start the preparation timer atomically). */
  async accept(user: AuthUser, input: AcceptOrderInput) {
    const order = await this.query.findOrder(input.orderId);
    const actor = await this.access.assertCanManage(user, order.orqspaceId);
    const who = { userId: actor.userId, role: actor.role };
    await this.db.transaction(async (tx) => {
      await this.lifecycle.transition({ orderId: order.id, to: 'ACCEPTED', actor: who, reason: input.note ?? null }, tx);
      if (input.startPreparation) {
        await this.lifecycle.transition({ orderId: order.id, to: 'PREPARING', actor: who, patch: preparationPatch(input.preparationMinutes) }, tx);
      }
    });
    return this.query.getForWorkspace(user, order.id);
  }

  reject(user: AuthUser, input: OrderReasonInput) {
    return this.workspaceTransition(user, input.orderId, 'REJECTED', input.reason);
  }

  startPreparing(user: AuthUser, input: StartPreparationInput) {
    return this.workspaceTransition(user, input.orderId, 'PREPARING', input.note, preparationPatch(input.preparationMinutes));
  }

  /** "+2 Mins": moves the preparation deadline (from now if it has already passed). */
  async extendPreparation(user: AuthUser, input: ExtendPreparationInput) {
    const order = await this.query.findOrder(input.orderId);
    const actor = await this.access.assertCanManage(user, order.orqspaceId);
    const minutes = input.minutes ?? ordersConfig.preparationExtensionMinutes;
    await this.db.transaction(async (tx) => {
      const [updated] = await tx
        .update(orders)
        .set({
          preparationDueAt: sql`greatest(coalesce(${orders.preparationDueAt}, now()), now()) + make_interval(mins => ${minutes})`,
          preparationMinutes: sql`least(coalesce(${orders.preparationMinutes}, 0) + ${minutes}, 480)`,
        })
        .where(and(eq(orders.id, order.id), eq(orders.orderStatus, 'PREPARING')))
        .returning({ preparationDueAt: orders.preparationDueAt });
      if (!updated) throw new ConflictException({ code: 'ORDER_STATUS_CHANGED', message: 'Only orders in preparation have a timer to extend' });
      await this.audit.record(tx, {
        entityType: 'order',
        entityId: order.id,
        action: 'order.preparation_extended',
        actorUserId: actor.userId,
        actorRole: actor.role,
        after: { minutes, preparationDueAt: updated.preparationDueAt?.toISOString() ?? null },
      });
    });
    return this.query.getForWorkspace(user, order.id);
  }

  markReady(user: AuthUser, input: OrderActionInput) {
    return this.workspaceTransition(user, input.orderId, 'READY_FOR_FULFILMENT', input.note);
  }

  /** Workspace chooses customer pickup as the fulfilment method. */
  markAwaitingPickup(user: AuthUser, input: OrderActionInput) {
    return this.workspaceTransition(user, input.orderId, 'AWAITING_CUSTOMER_PICKUP', input.note);
  }

  confirmCustomerPickup(user: AuthUser, input: OrderActionInput) {
    return this.workspaceTransition(user, input.orderId, 'PICKED_UP', input.note);
  }

  /** Back to READY_FOR_FULFILMENT after a failed delivery or a changed pickup plan. */
  reopenForFulfilment(user: AuthUser, input: OrderActionInput) {
    return this.workspaceTransition(user, input.orderId, 'READY_FOR_FULFILMENT', input.note);
  }

  cancelByWorkspace(user: AuthUser, input: OrderReasonInput) {
    return this.workspaceTransition(user, input.orderId, 'CANCELLED', input.reason);
  }

  async markReturned(user: AuthUser, input: MarkOrderReturnedInput) {
    const order = await this.query.findOrder(input.orderId);
    const actor = await this.access.assertCanManage(user, order.orqspaceId);
    const updated = await this.lifecycle.transition({
      orderId: order.id,
      to: 'RETURNED',
      actor: { userId: actor.userId, role: actor.role },
      reason: input.reason,
      restock: input.restock,
      metadata: { restock: input.restock },
    });
    return this.query.getForWorkspace(user, updated.id);
  }

  /** Declining a return puts the order back to the status it had before the request. */
  async declineReturn(user: AuthUser, input: OrderReasonInput) {
    const order = await this.query.findOrder(input.orderId);
    if (order.orderStatus !== 'RETURN_REQUESTED') throw new BadRequestException('No return was requested');
    const [requested] = await this.db
      .select({ fromStatus: orderStatusHistory.fromStatus })
      .from(orderStatusHistory)
      .where(and(eq(orderStatusHistory.orderId, order.id), eq(orderStatusHistory.toStatus, 'RETURN_REQUESTED')))
      .orderBy(desc(orderStatusHistory.createdAt))
      .limit(1);
    const previous: OrderStatus = requested?.fromStatus === 'PICKED_UP' ? 'PICKED_UP' : 'DELIVERED';
    return this.workspaceTransition(user, order.id, previous, input.reason);
  }

  async recordPayment(user: AuthUser, input: RecordOrderPaymentInput) {
    const order = await this.query.findOrder(input.orderId);
    const actor = await this.access.assertCanManage(user, order.orqspaceId);
    if (input.status === 'FAILED' && !input.failureReason) throw new BadRequestException('Add a failure reason');
    await this.db.transaction((tx) =>
      this.payments.record(tx, {
        orderId: order.id,
        kind: input.kind,
        method: input.method,
        status: input.status,
        amount: input.amount,
        provider: input.provider ?? 'MANUAL',
        providerReference: input.providerReference ?? null,
        failureReason: input.failureReason ?? null,
        recordedByUserId: actor.userId,
      }),
    );
    return this.query.getForWorkspace(user, order.id);
  }

  /**
   * Customer cancellation. Before the workspace accepts, the order is cancelled at once; afterwards the
   * customer can only request it ("Cancel requested") and the workspace approves or declines.
   */
  async cancelByCustomer(user: AuthUser, input: OrderReasonInput) {
    const order = await this.assertCustomer(user, input.orderId);
    if (order.orderStatus === 'PLACED') {
      await this.lifecycle.transition({ orderId: input.orderId, to: 'CANCELLED', actor: { userId: user.id, role: 'CUSTOMER' }, reason: input.reason });
      return this.query.getForCustomer(user, input.orderId);
    }
    if (!CANCEL_REQUESTABLE.includes(order.orderStatus)) {
      throw new BadRequestException(order.orderStatus === 'OUT_FOR_DELIVERY' ? 'The order is already on its way and can no longer be cancelled' : 'This order can no longer be cancelled');
    }
    if (order.cancelRequestStatus === 'REQUESTED') throw new BadRequestException('You have already asked to cancel this order');
    await this.db.transaction(async (tx) => {
      await tx
        .update(orders)
        .set({ cancelRequestStatus: 'REQUESTED', cancelRequestedAt: new Date(), cancelRequestReason: input.reason.trim(), cancelRequestResolution: null })
        .where(eq(orders.id, order.id));
      await this.audit.record(tx, { entityType: 'order', entityId: order.id, action: 'order.cancel_requested', actorUserId: user.id, actorRole: 'CUSTOMER', reason: input.reason });
    });
    return this.query.getForCustomer(user, input.orderId);
  }

  /** "Approve Cancel": cancels the order with the customer's reason (stock is released, an unpicked delivery is cancelled). */
  async approveCancellation(user: AuthUser, input: OrderActionInput) {
    const order = await this.query.findOrder(input.orderId);
    const actor = await this.access.assertCanManage(user, order.orqspaceId);
    if (order.cancelRequestStatus !== 'REQUESTED') throw new BadRequestException('The customer has not asked to cancel this order');
    await this.lifecycle.transition({
      orderId: order.id,
      to: 'CANCELLED',
      actor: { userId: actor.userId, role: actor.role },
      reason: `Customer request: ${order.cancelRequestReason ?? 'no reason given'}`,
      patch: { cancelRequestStatus: 'APPROVED', cancelRequestResolution: input.note ?? null },
      metadata: { cancelRequest: true },
    });
    return this.query.getForWorkspace(user, order.id);
  }

  async declineCancellation(user: AuthUser, input: OrderReasonInput) {
    const order = await this.query.findOrder(input.orderId);
    const actor = await this.access.assertCanManage(user, order.orqspaceId);
    if (order.cancelRequestStatus !== 'REQUESTED') throw new BadRequestException('The customer has not asked to cancel this order');
    await this.db.transaction(async (tx) => {
      await tx.update(orders).set({ cancelRequestStatus: 'DECLINED', cancelRequestResolution: input.reason.trim() }).where(eq(orders.id, order.id));
      await this.audit.record(tx, { entityType: 'order', entityId: order.id, action: 'order.cancel_request_declined', actorUserId: actor.userId, actorRole: actor.role, reason: input.reason });
    });
    return this.query.getForWorkspace(user, order.id);
  }

  /** Return requested → agree the pickup date with the customer. */
  async scheduleReturnPickup(user: AuthUser, input: ScheduleReturnPickupInput) {
    const order = await this.query.findOrder(input.orderId);
    const actor = await this.access.assertCanManage(user, order.orqspaceId);
    if (order.orderStatus !== 'RETURN_REQUESTED') throw new BadRequestException('No return was requested for this order');
    if (input.pickupDate < new Date().toISOString().slice(0, 10)) throw new BadRequestException('Choose today or a later date for the pickup');
    await this.db.transaction(async (tx) => {
      await tx.update(orders).set({ returnPickupDate: input.pickupDate }).where(eq(orders.id, order.id));
      await this.audit.record(tx, { entityType: 'order', entityId: order.id, action: 'order.return_pickup_scheduled', actorUserId: actor.userId, actorRole: actor.role, after: { pickupDate: input.pickupDate } });
    });
    return this.query.getForWorkspace(user, order.id);
  }

  /** "Approve Refund": refunds everything paid on a returned / cancelled / rejected order. */
  async approveRefund(user: AuthUser, input: ApproveRefundInput) {
    const order = await this.query.findOrder(input.orderId);
    const actor = await this.access.assertCanManage(user, order.orqspaceId);
    if (order.paymentStatus !== 'REFUND_PENDING' && order.paymentStatus !== 'PARTIALLY_REFUNDED') {
      throw new BadRequestException('There is no refund due on this order');
    }
    await this.db.transaction(async (tx) => {
      const due = await this.payments.amountPaid(tx, order.id);
      if (Number(due) <= 0) throw new BadRequestException('There is no refund due on this order');
      await this.payments.record(tx, {
        orderId: order.id,
        kind: 'REFUND',
        method: order.paymentMethod,
        status: 'SUCCEEDED',
        amount: due,
        provider: 'MANUAL',
        providerReference: input.providerReference ?? null,
        failureReason: null,
        recordedByUserId: actor.userId,
      });
      await this.audit.record(tx, { entityType: 'order', entityId: order.id, action: 'order.refund_approved', actorUserId: actor.userId, actorRole: actor.role, after: { amount: due } });
    });
    return this.query.getForWorkspace(user, order.id);
  }

  async requestReturn(user: AuthUser, input: OrderReasonInput) {
    const order = await this.assertCustomer(user, input.orderId);
    const completedAt = order.completedAt ?? order.deliveredAt;
    if (ordersConfig.returnWindowHours > 0 && completedAt && Date.now() - completedAt.getTime() > ordersConfig.returnWindowHours * 3_600_000) {
      throw new BadRequestException(`Returns can be requested within ${ordersConfig.returnWindowHours} hours of delivery`);
    }
    await this.lifecycle.transition({
      orderId: input.orderId,
      to: 'RETURN_REQUESTED',
      actor: { userId: user.id, role: 'CUSTOMER' },
      reason: input.reason,
    });
    return this.query.getForCustomer(user, input.orderId);
  }

  private async workspaceTransition(user: AuthUser, orderId: string, to: OrderStatus, reason?: string | null, patch?: Partial<OrderRow>) {
    const order = await this.query.findOrder(orderId);
    const actor = await this.access.assertCanManage(user, order.orqspaceId);
    const updated: OrderRow = await this.lifecycle.transition({
      orderId,
      to,
      actor: { userId: actor.userId, role: actor.role },
      reason: reason ?? null,
      patch,
    });
    return this.query.getForWorkspace(user, updated.id);
  }

  private async assertCustomer(user: AuthUser, orderId: string): Promise<OrderRow> {
    const order = await this.query.findOrder(orderId);
    if (order.customerId !== user.id) throw new NotFoundException('Order not found');
    return order;
  }
}

/** After acceptance the customer can ask to cancel until the order leaves the workspace. */
const CANCEL_REQUESTABLE: OrderStatus[] = ['ACCEPTED', 'PREPARING', 'READY_FOR_FULFILMENT', 'AWAITING_CUSTOMER_PICKUP'];

function preparationPatch(minutes: number | undefined): Partial<OrderRow> {
  const m = minutes ?? ordersConfig.defaultPreparationMinutes;
  return { preparationMinutes: m, preparationDueAt: new Date(Date.now() + m * 60_000) };
}
