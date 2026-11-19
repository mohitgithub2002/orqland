import { and, inArray, or, sql, type SQL } from 'drizzle-orm';
import { orders, type OrderStatus } from '@/infrastructure/database/schema';

/** Tabs on the Orders / Bookings page. Each order appears where it needs attention next. */
export const ORDER_QUEUES = ['ALL', 'NEW', 'UPCOMING', 'PROCESSING', 'ONGOING', 'COMPLETED', 'CANCELLED', 'CANCEL_REQUESTS', 'SUPPORT'] as const;
export type OrderQueue = (typeof ORDER_QUEUES)[number];

export const CANCEL_REQUESTABLE_STATUSES: OrderStatus[] = ['ACCEPTED', 'PREPARING', 'READY_FOR_FULFILMENT', 'AWAITING_CUSTOMER_PICKUP'];

const cancelPending = () => and(sql`${orders.cancelRequestStatus} = 'REQUESTED'`, inArray(orders.orderStatus, CANCEL_REQUESTABLE_STATUSES))!;
const noCancelPending = () => sql`${orders.cancelRequestStatus} IS DISTINCT FROM 'REQUESTED'`;

/**
 * NEW        placed, waiting to be accepted ("New entries")
 * UPCOMING   new + accepted, preparation not started ("Delivery / Pickup scheduled")
 * PROCESSING in preparation (timer running)
 * ONGOING    ready, out for delivery, or waiting for customer pickup
 * COMPLETED  delivered / collected
 * CANCELLED  cancelled, rejected, or the customer asked to cancel
 * CANCEL_REQUESTS  only the open customer cancel requests (subset of CANCELLED)
 * SUPPORT    returns, failed deliveries and refunds due
 */
export function queueCondition(queue: OrderQueue): SQL | undefined {
  switch (queue) {
    case 'ALL':
      return undefined;
    case 'NEW':
      return inArray(orders.orderStatus, ['PLACED']);
    case 'UPCOMING':
      return and(inArray(orders.orderStatus, ['PLACED', 'ACCEPTED']), noCancelPending());
    case 'PROCESSING':
      return and(inArray(orders.orderStatus, ['PREPARING']), noCancelPending());
    case 'ONGOING':
      return and(inArray(orders.orderStatus, ['READY_FOR_FULFILMENT', 'AWAITING_CUSTOMER_PICKUP', 'OUT_FOR_DELIVERY']), noCancelPending());
    case 'COMPLETED':
      return inArray(orders.orderStatus, ['DELIVERED', 'PICKED_UP']);
    case 'CANCELLED':
      return or(inArray(orders.orderStatus, ['CANCELLED', 'REJECTED']), cancelPending());
    case 'CANCEL_REQUESTS':
      return cancelPending();
    case 'SUPPORT':
      return or(
        inArray(orders.orderStatus, ['RETURN_REQUESTED', 'DELIVERY_FAILED']),
        and(inArray(orders.orderStatus, ['RETURNED', 'CANCELLED', 'REJECTED']), inArray(orders.paymentStatus, ['REFUND_PENDING', 'PARTIALLY_REFUNDED'])),
      );
  }
}
