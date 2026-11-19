import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import {
  deliveryStatusEvents,
  deliveryTasks,
  orqspaceDeliverySettings,
  type ActorRole,
  type DeliveryTaskStatus,
} from '@/infrastructure/database/schema';
import type { DbTx } from '@/core/utils/db-executor';
import { OrderLifecycleService } from '@/modules/orders/services/lifecycle/order-lifecycle.service';
import { AuditService } from '@/modules/orders/services/shared/audit.service';
import { canTaskTransition, type TaskActor } from '../../helpers/delivery-state-machine';
import { AgentAvailabilityService } from '../agents/agent-availability.service';
import { CodService } from '../cod/cod.service';
import { EarningsService } from '../earnings/earnings.service';

export type TaskRow = typeof deliveryTasks.$inferSelect;

export interface TaskTransitionActor {
  userId: string | null;
  role: ActorRole;
  as: TaskActor;
}

export interface TaskTransitionOptions {
  reason?: string | null;
  isOverride?: boolean;
  lat?: number | null;
  lng?: number | null;
  patch?: Partial<TaskRow>;
  metadata?: Record<string, unknown>;
}

/**
 * The single place where a delivery task changes status. Keeps the order, COD record, earnings,
 * agent availability, timeline and audit trail consistent inside the caller's transaction.
 */
@Injectable()
export class TaskTransitionsService {
  constructor(
    private readonly orderLifecycle: OrderLifecycleService,
    private readonly availability: AgentAvailabilityService,
    private readonly cod: CodService,
    private readonly earnings: EarningsService,
    private readonly audit: AuditService,
  ) {}

  async lock(tx: DbTx, taskId: string): Promise<TaskRow> {
    const [task] = await tx.select().from(deliveryTasks).where(eq(deliveryTasks.id, taskId)).for('update');
    if (!task) throw new NotFoundException('Delivery task not found');
    return task;
  }

  async apply(tx: DbTx, task: TaskRow, to: DeliveryTaskStatus, actor: TaskTransitionActor, opts: TaskTransitionOptions = {}): Promise<TaskRow> {
    const from = task.status;
    if (!opts.isOverride && !canTaskTransition(from, to, actor.as)) {
      throw new BadRequestException({ code: 'INVALID_TASK_TRANSITION', message: `Cannot move delivery from ${from} to ${to}` });
    }
    if (opts.isOverride && !opts.reason?.trim()) throw new BadRequestException('Overrides require a reason');

    const now = new Date();
    const timestampPatches: Partial<Record<DeliveryTaskStatus, Partial<TaskRow>>> = {
      ACCEPTED: { acceptedAt: now },
      PICKED_UP: { pickedUpAt: now },
      DELIVERED: { deliveredAt: now },
      FAILED: { failedAt: now, failureReason: opts.reason ?? null },
      CANCELLED: { cancelledAt: now, cancellationReason: opts.reason ?? null },
    };
    const timestamps = timestampPatches[to] ?? {};

    const [updated] = await tx
      .update(deliveryTasks)
      .set({ ...timestamps, ...opts.patch, status: to, version: task.version + 1 })
      .where(and(eq(deliveryTasks.id, task.id), eq(deliveryTasks.version, task.version)))
      .returning();
    if (!updated) throw new ConflictException({ code: 'TASK_CHANGED', message: 'The delivery was updated by someone else. Refresh and retry.' });

    await tx.insert(deliveryStatusEvents).values({
      taskId: task.id,
      fromStatus: from,
      toStatus: to,
      actorUserId: actor.userId,
      actorRole: actor.role,
      reason: opts.reason ?? null,
      isOverride: !!opts.isOverride,
      lat: opts.lat?.toFixed(6) ?? null,
      lng: opts.lng?.toFixed(6) ?? null,
      metadata: opts.metadata ?? null,
    });
    if (opts.isOverride) {
      await this.audit.record(tx, {
        entityType: 'delivery_task',
        entityId: task.id,
        action: `task.override.${to.toLowerCase()}`,
        actorUserId: actor.userId,
        actorRole: actor.role,
        reason: opts.reason,
        before: { status: from },
        after: { status: to },
      });
    }

    await this.syncOrder(tx, updated, from, to, opts);
    await this.syncFinance(tx, updated, to, opts);

    const agentIds = new Set([task.agentUserId, updated.agentUserId].filter((id): id is string => !!id));
    for (const agentUserId of agentIds) await this.availability.refreshBusy(tx, agentUserId);
    return updated;
  }

  private async syncOrder(tx: DbTx, task: TaskRow, from: DeliveryTaskStatus, to: DeliveryTaskStatus, opts: TaskTransitionOptions) {
    const system = { userId: null, role: 'SYSTEM' as const };
    const reason = opts.reason ?? null;
    if (to === 'PICKED_UP') {
      await this.orderLifecycle.transition({ orderId: task.orderId, to: 'OUT_FOR_DELIVERY', actor: system, from: ['READY_FOR_FULFILMENT'], metadata: { taskId: task.id } }, tx);
    } else if (to === 'DELIVERED') {
      await this.orderLifecycle.transition(
        { orderId: task.orderId, to: 'DELIVERED', actor: system, reason, from: ['READY_FOR_FULFILMENT', 'OUT_FOR_DELIVERY'], metadata: { taskId: task.id, override: !!opts.isOverride } },
        tx,
      );
    } else if (to === 'FAILED') {
      await this.orderLifecycle.transition({ orderId: task.orderId, to: 'DELIVERY_FAILED', actor: system, reason, from: ['OUT_FOR_DELIVERY'], metadata: { taskId: task.id } }, tx);
    } else if (to === 'CANCELLED' && from !== 'PICKED_UP') {
      // Order stays READY_FOR_FULFILMENT; the workspace chooses a fulfilment method again.
      await this.orderLifecycle.setFulfilmentMethod(tx, task.orderId, null);
    }
  }

  private async syncFinance(tx: DbTx, task: TaskRow, to: DeliveryTaskStatus, opts: TaskTransitionOptions) {
    if (to === 'ACCEPTED' || to === 'PENDING_ASSIGNMENT') await this.cod.assignAgent(tx, task.id, task.agentUserId);
    if (to === 'CANCELLED' || to === 'FAILED') await this.cod.markNotCollected(tx, task.id, opts.reason ?? to);
    if (to === 'DELIVERED') {
      const [settings] = await tx
        .select({ timezone: orqspaceDeliverySettings.timezone })
        .from(orqspaceDeliverySettings)
        .where(eq(orqspaceDeliverySettings.orqspaceId, task.orqspaceId));
      await this.earnings.createForDeliveredTask(tx, task, settings?.timezone ?? 'Asia/Kolkata');
    }
  }
}
