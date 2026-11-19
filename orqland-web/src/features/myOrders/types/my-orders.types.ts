import type { AddressSnapshot, OrderDetail, OrderListItem } from '@/features/dashboard/orders/types/order.types';

export interface MyOrderListItem extends Omit<OrderListItem, 'delivery'> {
  orqspaceName: string;
  delivery: { status: string } | null;
}

export interface MyOrderDetail extends Omit<OrderDetail, 'delivery'> {
  orqspaceName: string;
  deliveryOtp: string | null;
  delivery: { id: string; status: string; mode: 'SELF' | 'AGENT'; taskNumber: string } | null;
}

export interface CheckoutAddress extends AddressSnapshot {
  id: string;
  addressType: string;
  isPrimary: boolean;
}

/** One line in the buyer's cart, supplied by the listing/cart pages that open the checkout. */
export interface CartLine {
  listingId: string;
  variantId?: string;
  quantity: number;
  title: string;
  variantLabel?: string;
  unitTotalPrice: string;
  orqspaceName?: string;
}
