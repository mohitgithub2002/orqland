import { ConflictException, Injectable } from '@nestjs/common';
import { and, eq, gte, inArray, sql } from 'drizzle-orm';
import { orderInventoryReservations, orqListingVariants } from '@/infrastructure/database/schema';
import type { DbTx } from '@/core/utils/db-executor';

export interface ReservationRequest {
  orderItemId: string;
  variantId: string;
  quantity: number;
  title: string;
}

/**
 * Concurrency-safe stock handling for LIMITED variants.
 * Stock is decremented with a conditional UPDATE, so two concurrent checkouts can never oversell.
 * Every release/restore is guarded by the reservation's status, so it is applied exactly once.
 */
@Injectable()
export class OrderInventoryService {
  /** `expiresAt` marks holds that lapse if the order is never paid (ONLINE orders). */
  async reserve(tx: DbTx, orderId: string, requests: ReservationRequest[], expiresAt: Date | null = null): Promise<void> {
    // Lock variants in a stable order to avoid deadlocks between concurrent checkouts.
    const sorted = [...requests].sort((a, b) => a.variantId.localeCompare(b.variantId));
    for (const req of sorted) {
      const updated = await tx
        .update(orqListingVariants)
        .set({ remainingQuantity: sql`${orqListingVariants.remainingQuantity} - ${req.quantity}` })
        .where(
          and(
            eq(orqListingVariants.id, req.variantId),
            eq(orqListingVariants.inventoryMode, 'LIMITED'),
            eq(orqListingVariants.variantStatus, 'ACTIVE'),
            gte(orqListingVariants.remainingQuantity, req.quantity),
          ),
        )
        .returning({ id: orqListingVariants.id });
      if (updated.length === 0) {
        throw new ConflictException({ code: 'OUT_OF_STOCK', message: `"${req.title}" does not have enough stock` });
      }
      await tx.insert(orderInventoryReservations).values({
        orderId,
        orderItemId: req.orderItemId,
        variantId: req.variantId,
        quantity: req.quantity,
        status: 'RESERVED',
        expiresAt,
      });
    }
  }

  async commit(tx: DbTx, orderId: string): Promise<void> {
    await tx
      .update(orderInventoryReservations)
      .set({ status: 'COMMITTED', committedAt: new Date() })
      .where(and(eq(orderInventoryReservations.orderId, orderId), eq(orderInventoryReservations.status, 'RESERVED')));
  }

  /** Stock never left the workspace (reject/cancel before dispatch). */
  async release(tx: DbTx, orderId: string): Promise<void> {
    const released = await tx
      .update(orderInventoryReservations)
      .set({ status: 'RELEASED', releasedAt: new Date() })
      .where(
        and(
          eq(orderInventoryReservations.orderId, orderId),
          inArray(orderInventoryReservations.status, ['RESERVED', 'COMMITTED']),
        ),
      )
      .returning({ variantId: orderInventoryReservations.variantId, quantity: orderInventoryReservations.quantity });
    await this.addBack(tx, released);
  }

  /** Returned goods that the workspace marked as restockable. */
  async restore(tx: DbTx, orderId: string): Promise<void> {
    const restored = await tx
      .update(orderInventoryReservations)
      .set({ status: 'RESTORED', restoredAt: new Date() })
      .where(and(eq(orderInventoryReservations.orderId, orderId), eq(orderInventoryReservations.status, 'COMMITTED')))
      .returning({ variantId: orderInventoryReservations.variantId, quantity: orderInventoryReservations.quantity });
    await this.addBack(tx, restored);
  }

  private async addBack(tx: DbTx, rows: { variantId: string; quantity: number }[]): Promise<void> {
    for (const row of rows) {
      await tx
        .update(orqListingVariants)
        .set({ remainingQuantity: sql`${orqListingVariants.remainingQuantity} + ${row.quantity}` })
        .where(and(eq(orqListingVariants.id, row.variantId), eq(orqListingVariants.inventoryMode, 'LIMITED')));
    }
  }
}
