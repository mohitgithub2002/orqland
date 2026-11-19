import type { ActorRole, OrderStatus } from '@/infrastructure/database/schema';

type TransitionTable = Record<OrderStatus, Partial<Record<OrderStatus, ActorRole[]>>>;

const W: ActorRole = 'WORKSPACE';
const C: ActorRole = 'CUSTOMER';
const S: ActorRole = 'SYSTEM';

/**
 * Allowed order transitions and who may perform them.
 * OUT_FOR_DELIVERY / DELIVERED / DELIVERY_FAILED are driven only by delivery-task events (SYSTEM).
 * PLATFORM_ADMIN may perform any listed transition (always with a reason; audited).
 */
export const ORDER_TRANSITIONS: TransitionTable = {
  // SYSTEM: unpaid ONLINE orders are cancelled when the payment hold expires (OrderPaymentHoldJob).
  PLACED: { ACCEPTED: [W], REJECTED: [W], CANCELLED: [C, W, S] },
  ACCEPTED: { PREPARING: [W], CANCELLED: [W] },
  PREPARING: { READY_FOR_FULFILMENT: [W], CANCELLED: [W] },
  READY_FOR_FULFILMENT: {
    AWAITING_CUSTOMER_PICKUP: [W],
    OUT_FOR_DELIVERY: [S],
    DELIVERED: [S],
    CANCELLED: [W],
  },
  AWAITING_CUSTOMER_PICKUP: { PICKED_UP: [W], READY_FOR_FULFILMENT: [W], CANCELLED: [W] },
  OUT_FOR_DELIVERY: { DELIVERED: [S], DELIVERY_FAILED: [S] },
  DELIVERY_FAILED: { READY_FOR_FULFILMENT: [W], RETURNED: [W], CANCELLED: [W] },
  DELIVERED: { RETURN_REQUESTED: [C, W] },
  PICKED_UP: { RETURN_REQUESTED: [C, W] },
  RETURN_REQUESTED: { RETURNED: [W], DELIVERED: [W], PICKED_UP: [W] },
  REJECTED: {},
  CANCELLED: {},
  RETURNED: {},
};

export const TERMINAL_ORDER_STATUSES: OrderStatus[] = ['REJECTED', 'CANCELLED', 'RETURNED'];

/** Statuses in which reserved stock has not left the workspace yet. */
export const STOCK_RELEASABLE_STATUSES: OrderStatus[] = [
  'PLACED',
  'ACCEPTED',
  'PREPARING',
  'READY_FOR_FULFILMENT',
  'AWAITING_CUSTOMER_PICKUP',
];

export function canTransition(from: OrderStatus, to: OrderStatus, actor: ActorRole): boolean {
  const allowed = ORDER_TRANSITIONS[from]?.[to];
  if (!allowed) return false;
  return actor === 'PLATFORM_ADMIN' || allowed.includes(actor);
}

export function allowedNextStatuses(from: OrderStatus, actor: ActorRole): OrderStatus[] {
  return (Object.keys(ORDER_TRANSITIONS[from] ?? {}) as OrderStatus[]).filter((to) => canTransition(from, to, actor));
}
