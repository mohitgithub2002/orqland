import { Inject, Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { and, eq, inArray, lt } from 'drizzle-orm';
import { DRIZZLE, type DrizzleDB } from '@/infrastructure/database/drizzle.module';
import { orders } from '@/infrastructure/database/schema';
import { ordersConfig } from '@/config/orders.config';
import { OrderLifecycleService } from '../services/lifecycle/order-lifecycle.service';

/**
 * Failed or expired payments (guide: "Handle failed or expired payments correctly").
 * An ONLINE order that is still PLACED and not PAID when its payment hold lapses is cancelled by SYSTEM.
 * The cancellation goes through the normal lifecycle, so reserved stock is released exactly once,
 * history is written and the payment status is recomputed.
 */
@Injectable()
export class OrderPaymentHoldJob {
  private readonly logger = new Logger('OrderPaymentHoldJob');

  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    private readonly lifecycle: OrderLifecycleService,
  ) {}

  @Interval('order-payment-hold', 60_000)
  async run(): Promise<number> {
    if (ordersConfig.paymentHoldMinutes <= 0) return 0;
    const cutoff = new Date(Date.now() - ordersConfig.paymentHoldMinutes * 60_000);
    const due = await this.db
      .select({ id: orders.id })
      .from(orders)
      .where(
        and(
          eq(orders.paymentMethod, 'ONLINE'),
          eq(orders.orderStatus, 'PLACED'),
          inArray(orders.paymentStatus, ['PENDING', 'FAILED']),
          lt(orders.createdAt, cutoff),
        ),
      )
      .limit(100);

    let cancelled = 0;
    for (const { id } of due) {
      try {
        await this.lifecycle.transition({
          orderId: id,
          to: 'CANCELLED',
          from: ['PLACED'],
          actor: { userId: null, role: 'SYSTEM' },
          reason: `Payment not completed within ${ordersConfig.paymentHoldMinutes} minutes`,
          metadata: { rule: 'payment_hold_expired' },
        });
        cancelled++;
      } catch (error) {
        // Another instance (or the customer/workspace) changed the order first — nothing to do.
        this.logger.debug(`Payment hold for ${id} skipped: ${(error as Error).message}`);
      }
    }
    if (cancelled) this.logger.log(`Cancelled ${cancelled} unpaid ONLINE orders`);
    return cancelled;
  }
}
