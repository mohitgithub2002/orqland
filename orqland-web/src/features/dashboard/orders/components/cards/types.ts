import type { Order } from '../../types/order.types';

export interface OrderCardProps {
  order: Order;
  orqspaceId: string;
  /** Opens the order view (details, payments, timeline and live delivery tracking). */
  onOpen: (orderId: string) => void;
}
