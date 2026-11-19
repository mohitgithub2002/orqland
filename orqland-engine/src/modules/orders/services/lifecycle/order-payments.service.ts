import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import {
  orderInventoryReservations,
  orderPayments,
  orders,
  type OrderPaymentKind,
  type OrderPaymentMethod,
  type OrderPaymentRecordStatus,
  type OrderPaymentStatus,
  type OrderStatus,
} from '@/infrastructure/database/schema';
import { isUniqueViolation, type DbTx } from '@/core/utils/db-executor';
import { fromPaise, toPaise } from '@/core/utils/money';

export interface PaymentRecordInput {
  orderId: string;
  kind: OrderPaymentKind;
  method: OrderPaymentMethod;
  status: OrderPaymentRecordStatus;
  amount: string;
  provider?: string | null;
  providerReference?: string | null;
  failureReason?: string | null;
  recordedByUserId: string | null;
}

const REFUND_EXPECTED_STATUSES: OrderStatus[] = ['CANCELLED', 'REJECTED', 'RETURNED'];

/**
 * Provider-agnostic payment ledger. `orders.payment_status` is always derived from these rows,
 * never written directly. A payment gateway integration only needs to call `record()` from its webhook.
 */
@Injectable()
export class OrderPaymentsService {
  async record(tx: DbTx, input: PaymentRecordInput): Promise<OrderPaymentStatus> {
    const [order] = await tx.select().from(orders).where(eq(orders.id, input.orderId)).for('update');
    if (!order) throw new BadRequestException('Order not found');

    if (input.status === 'SUCCEEDED') {
      const { paid, refunded } = await this.totals(tx, input.orderId);
      const amount = toPaise(input.amount);
      if (input.kind === 'PAYMENT' && paid + amount > toPaise(order.totalAmount)) {
        throw new BadRequestException('Payment exceeds the order total');
      }
      if (input.kind === 'REFUND' && refunded + amount > paid) {
        throw new BadRequestException('Refund exceeds the amount paid');
      }
    }

    // Savepoint so a duplicate reference doesn't abort the caller's transaction.
    try {
      await tx.transaction(async (sp) => {
        await sp.insert(orderPayments).values({
          orderId: input.orderId,
          kind: input.kind,
          method: input.method,
          status: input.status,
          amount: input.amount,
          provider: input.provider ?? null,
          providerReference: input.providerReference ?? null,
          failureReason: input.failureReason ?? null,
          recordedByUserId: input.recordedByUserId,
        });
      });
    } catch (error) {
      if (isUniqueViolation(error, 'order_payments_provider_ref_uq')) {
        throw new ConflictException({ code: 'DUPLICATE_PAYMENT_REFERENCE', message: `Payment reference ${input.providerReference} is already recorded` });
      }
      throw error;
    }
    return this.recompute(tx, input.orderId);
  }

  async recompute(tx: DbTx, orderId: string): Promise<OrderPaymentStatus> {
    const [order] = await tx
      .select({ totalAmount: orders.totalAmount, orderStatus: orders.orderStatus })
      .from(orders)
      .where(eq(orders.id, orderId));
    const { paid, refunded, failed } = await this.totals(tx, orderId);

    let status: OrderPaymentStatus = 'PENDING';
    if (refunded > 0) status = refunded >= paid ? 'REFUNDED' : 'PARTIALLY_REFUNDED';
    else if (paid > 0 && REFUND_EXPECTED_STATUSES.includes(order.orderStatus)) status = 'REFUND_PENDING';
    else if (paid >= toPaise(order.totalAmount) && paid > 0) status = 'PAID';
    else if (failed > 0 && paid === 0) status = 'FAILED';

    await tx.update(orders).set({ paymentStatus: status }).where(eq(orders.id, orderId));
    if (status === 'PAID') {
      // A paid order no longer lapses — clear the payment-hold expiry on its stock reservations.
      await tx
        .update(orderInventoryReservations)
        .set({ expiresAt: null })
        .where(and(eq(orderInventoryReservations.orderId, orderId), eq(orderInventoryReservations.status, 'RESERVED')));
    }
    return status;
  }

  async amountPaid(tx: DbTx, orderId: string): Promise<string> {
    const { paid, refunded } = await this.totals(tx, orderId);
    return fromPaise(paid - refunded);
  }

  private async totals(tx: DbTx, orderId: string) {
    const rows = await tx
      .select({ kind: orderPayments.kind, status: orderPayments.status, amount: orderPayments.amount })
      .from(orderPayments)
      .where(and(eq(orderPayments.orderId, orderId)));
    let paid = 0;
    let refunded = 0;
    let failed = 0;
    for (const row of rows) {
      if (row.status === 'FAILED') failed++;
      if (row.status !== 'SUCCEEDED') continue;
      if (row.kind === 'PAYMENT') paid += toPaise(row.amount);
      else refunded += toPaise(row.amount);
    }
    return { paid, refunded, failed };
  }
}
