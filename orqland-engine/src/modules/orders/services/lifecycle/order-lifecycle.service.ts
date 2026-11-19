import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { DRIZZLE, type DrizzleDB } from '@/infrastructure/database/drizzle.module';
import {
  orders,
  orderStatusHistory,
  type ActorRole,
  type OrderFulfilmentMethod,
  type OrderStatus,
} from '@/infrastructure/database/schema';
import type { DbExecutor, DbTx } from '@/core/utils/db-executor';
import { canTransition, STOCK_RELEASABLE_STATUSES } from '../../helpers/order-state-machine';
import { AuditService } from '../shared/audit.service';
import { OrderInventoryService } from './order-inventory.service';
import { OrderPaymentsService } from './order-payments.service';

export type OrderRow = typeof orders.$inferSelect;

export interface OrderActor {
  userId: string | null;
  role: ActorRole;
}

export interface TransitionRequest {
  orderId: string;
  to: OrderStatus;
  actor: OrderActor;
  reason?: string | null;
  /** Restrict the transition to orders currently in one of these statuses. */
  from?: OrderStatus[];
  restock?: boolean;
  metadata?: Record<string, unknown>;
  /** Extra columns written in the same update (e.g. the preparation timer). */
  patch?: Partial<OrderRow>;
}

/** Runs before an order is cancelled (inside the same transaction). The Delivery module registers one. */
export type BeforeCancelHook = (tx: DbTx, order: OrderRow, actor: OrderActor) => Promise<void>;

/** Runs after a transition is written (inside the same transaction), e.g. to notify an assigned agent. */
export type AfterTransitionHook = (tx: DbTx, order: OrderRow, from: OrderStatus, actor: OrderActor) => Promise<void>;

const REASON_REQUIRED: OrderStatus[] = ['REJECTED', 'CANCELLED', 'RETURNED'];

@Injectable()
export class OrderLifecycleService {
  private readonly beforeCancelHooks: BeforeCancelHook[] = [];
  private readonly afterTransitionHooks: AfterTransitionHook[] = [];

  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    private readonly inventory: OrderInventoryService,
    private readonly payments: OrderPaymentsService,
    private readonly audit: AuditService,
  ) {}

  onBeforeCancel(hook: BeforeCancelHook): void {
    this.beforeCancelHooks.push(hook);
  }

  onAfterTransition(hook: AfterTransitionHook): void {
    this.afterTransitionHooks.push(hook);
  }

  /** Validates and applies one status transition, with side effects and history, atomically. */
  async transition(req: TransitionRequest, exec: DbExecutor = this.db): Promise<OrderRow> {
    return exec.transaction(async (tx) => {
      const order = await this.lockOrder(tx, req.orderId);
      const from = order.orderStatus;

      if (req.from && !req.from.includes(from)) {
        throw new ConflictException({ code: 'ORDER_STATUS_CHANGED', message: `Order is ${from}` });
      }
      if (!canTransition(from, req.to, req.actor.role)) {
        throw new BadRequestException({
          code: 'INVALID_ORDER_TRANSITION',
          message: `Cannot move order from ${from} to ${req.to}`,
        });
      }
      if (REASON_REQUIRED.includes(req.to) && !req.reason?.trim()) {
        throw new BadRequestException('A reason is required');
      }
      if (req.actor.role === 'PLATFORM_ADMIN' && !req.reason?.trim()) {
        throw new BadRequestException('Platform overrides require a reason');
      }

      if (req.to === 'CANCELLED') {
        for (const hook of this.beforeCancelHooks) await hook(tx, order, req.actor);
      }

      const patch = { ...this.patchFor(req, order), ...(req.patch ?? {}) };
      const [updated] = await tx
        .update(orders)
        .set({ ...patch, orderStatus: req.to, version: order.version + 1 })
        .where(and(eq(orders.id, order.id), eq(orders.version, order.version)))
        .returning();
      if (!updated) throw new ConflictException({ code: 'ORDER_STATUS_CHANGED', message: 'Order was updated, retry' });

      await this.applySideEffects(tx, from, req);

      await tx.insert(orderStatusHistory).values({
        orderId: order.id,
        fromStatus: from,
        toStatus: req.to,
        actorUserId: req.actor.userId,
        actorRole: req.actor.role,
        reason: req.reason ?? null,
        metadata: req.metadata ?? null,
      });

      if (req.actor.role === 'PLATFORM_ADMIN') {
        await this.audit.record(tx, {
          entityType: 'order',
          entityId: order.id,
          action: `order.override.${req.to.toLowerCase()}`,
          actorUserId: req.actor.userId,
          actorRole: req.actor.role,
          reason: req.reason,
          before: { orderStatus: from },
          after: { orderStatus: req.to },
        });
      }
      for (const hook of this.afterTransitionHooks) await hook(tx, updated, from, req.actor);
      return updated;
    });
  }

  /** Records the workspace's fulfilment choice without changing the order status. */
  async setFulfilmentMethod(tx: DbTx, orderId: string, method: OrderFulfilmentMethod | null): Promise<void> {
    await tx.update(orders).set({ fulfilmentMethod: method }).where(eq(orders.id, orderId));
  }

  async lockOrder(tx: DbTx, orderId: string): Promise<OrderRow> {
    const [order] = await tx.select().from(orders).where(eq(orders.id, orderId)).for('update');
    if (!order) throw new NotFoundException('Order not found');
    return order;
  }

  private patchFor(req: TransitionRequest, order: OrderRow): Partial<OrderRow> {
    const now = new Date();
    switch (req.to) {
      case 'ACCEPTED':
        return { acceptedAt: now };
      case 'PREPARING':
        return { preparingAt: now };
      case 'READY_FOR_FULFILMENT':
        // Re-opening after a failed delivery clears the previous method so the workspace chooses again.
        return order.orderStatus === 'DELIVERY_FAILED' || order.orderStatus === 'AWAITING_CUSTOMER_PICKUP'
          ? { fulfilmentMethod: null }
          : { readyAt: now };
      case 'AWAITING_CUSTOMER_PICKUP':
        return { fulfilmentMethod: 'PICKUP' };
      case 'OUT_FOR_DELIVERY':
        return { dispatchedAt: now };
      case 'DELIVERED':
        return { deliveredAt: now, completedAt: now };
      case 'PICKED_UP':
        return { completedAt: now };
      case 'REJECTED':
        return { rejectionReason: req.reason ?? null };
      case 'CANCELLED':
        return { cancelledAt: now, cancellationReason: req.reason ?? null, cancelledByRole: req.actor.role };
      default:
        return {};
    }
  }

  private async applySideEffects(tx: DbTx, from: OrderStatus, req: TransitionRequest): Promise<void> {
    if (req.to === 'ACCEPTED') await this.inventory.commit(tx, req.orderId);

    if ((req.to === 'REJECTED' || req.to === 'CANCELLED') && STOCK_RELEASABLE_STATUSES.includes(from)) {
      await this.inventory.release(tx, req.orderId);
    }
    if (req.to === 'RETURNED' && req.restock) await this.inventory.restore(tx, req.orderId);

    if (['REJECTED', 'CANCELLED', 'RETURNED'].includes(req.to)) await this.payments.recompute(tx, req.orderId);
  }
}
