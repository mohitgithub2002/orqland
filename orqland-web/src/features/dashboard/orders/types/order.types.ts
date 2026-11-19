export type OrderStatus =
  | 'PLACED'
  | 'ACCEPTED'
  | 'REJECTED'
  | 'PREPARING'
  | 'READY_FOR_FULFILMENT'
  | 'AWAITING_CUSTOMER_PICKUP'
  | 'OUT_FOR_DELIVERY'
  | 'DELIVERY_FAILED'
  | 'DELIVERED'
  | 'PICKED_UP'
  | 'CANCELLED'
  | 'RETURN_REQUESTED'
  | 'RETURNED';

export type PaymentMethod = 'ONLINE' | 'COD';
export type PaymentStatus = 'PENDING' | 'PAID' | 'FAILED' | 'REFUND_PENDING' | 'PARTIALLY_REFUNDED' | 'REFUNDED';
export type FulfilmentMethod = 'SELF_DELIVERY' | 'AGENT_DELIVERY' | 'PICKUP';

/** Tabs on the Orders / Bookings page (server-side filters). */
export type OrderQueue = 'ALL' | 'NEW' | 'UPCOMING' | 'PROCESSING' | 'ONGOING' | 'COMPLETED' | 'CANCELLED' | 'CANCEL_REQUESTS' | 'SUPPORT';

export interface AddressSnapshot {
  recipientName: string | null;
  recipientPhone: string | null;
  doorNo: string | null;
  street: string | null;
  landmark: string | null;
  city: string | null;
  state: string | null;
  pincode: string | null;
  latitude: number | null;
  longitude: number | null;
}

export interface OrderItem {
  id: string;
  title: string;
  variantLabel: string | null;
  sku: string | null;
  imageUrl: string | null;
  quantity: number;
  unitBasePrice?: string;
  gstPercentage?: string;
  unitTotalPrice: string;
  lineTotal: string;
  stockRemaining: number | null;
}

export interface OrderHistoryEntry {
  id: string;
  fromStatus: OrderStatus | null;
  toStatus: OrderStatus;
  actorRole: string;
  actorName: string | null;
  reason: string | null;
  createdAt: string;
}

export interface OrderPayment {
  id: string;
  kind: 'PAYMENT' | 'REFUND';
  method: PaymentMethod;
  status: string;
  amount: string;
  provider: string | null;
  providerReference: string | null;
  occurredAt: string;
}

export interface OrderDeliveryAgent {
  userId: string;
  orqUserId: string;
  displayName: string;
  avatar: string | null;
  phone: string | null;
  availability: string;
  vehicleNumberMasked: string;
  lastLat: number | null;
  lastLng: number | null;
  lastLocationAt: string | null;
}

export interface OrderDeliverySummary {
  id: string;
  taskNumber: string;
  status: string;
  mode: 'SELF' | 'AGENT';
  needsAttention: boolean;
  attentionReason: string | null;
  codAmount: string;
  requiresOtp: boolean;
  selfStaffName: string | null;
  selfStaffPhone: string | null;
  estimatedDistanceKm: string | null;
  pickupLat: number | null;
  pickupLng: number | null;
  dropoffLat: number | null;
  dropoffLng: number | null;
  acceptedAt: string | null;
  pickedUpAt: string | null;
  createdAt: string;
  agent: OrderDeliveryAgent | null;
  currentOffer: { id: string; agentUserId: string; agentName: string | null; expiresAt: string } | null;
}

export interface OrderDocument {
  id: string;
  mimeType: string;
  sizeBytes: number;
  originalName: string | null;
  createdAt: string;
}

/** Everything an order card and the order view need. */
export interface Order {
  id: string;
  orderNumber: string;
  orqspaceId?: string;
  orderStatus: OrderStatus;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  requestedFulfilment: 'DELIVERY' | 'PICKUP';
  fulfilmentMethod: FulfilmentMethod | null;
  subtotalBase: string;
  totalGst: string;
  deliveryFee: string;
  discountTotal: string;
  totalAmount: string;
  itemCount: number;
  allowedNextStatuses: OrderStatus[];
  customerNote: string | null;
  rejectionReason: string | null;
  cancellationReason: string | null;
  createdAt: string;
  acceptedAt: string | null;
  preparingAt: string | null;
  readyAt: string | null;
  dispatchedAt: string | null;
  deliveredAt: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
  scheduledFor: string | null;
  preparationMinutes: number | null;
  preparationDueAt: string | null;
  cancelRequestStatus: 'REQUESTED' | 'APPROVED' | 'DECLINED' | null;
  cancelRequestedAt: string | null;
  cancelRequestReason: string | null;
  cancelRequestResolution: string | null;
  returnPickupDate: string | null;
  returnWindowEndsAt: string | null;
  /** Successful payments minus refunds. */
  amountPaid: string;
  distanceFromPickupKm: number | null;
  buyerSnapshot: { name: string; phone: string | null; email: string | null; orqUserId: string };
  deliveryAddressSnapshot: AddressSnapshot | null;
  items: OrderItem[];
  invoice: OrderDocument | null;
  history: OrderHistoryEntry[];
  delivery: OrderDeliverySummary | null;
  payments?: OrderPayment[];
  checkoutId?: string;
}

/** Kept for existing imports. */
export type OrderDetail = Order;
export type OrderListItem = Order;

export interface OrderPage {
  items: Order[];
  total: number;
  page: number;
  pageSize: number;
}

export interface OrdersFilter {
  orqspaceId: string;
  queue?: OrderQueue;
  statuses?: OrderStatus[];
  paymentMethod?: PaymentMethod;
  search?: string;
  page: number;
  pageSize: number;
}

export interface OrderSummary {
  totalSales: string;
  totalSalesChangePercent: number | null;
  ongoingOrders: number;
  newOrdersToday: number;
  completedOrders: number;
  completedChangePercent: number | null;
  tabs: { queue: OrderQueue; count: number }[];
}

/** Page tabs, in the order of the design. */
export const ORDER_TABS: { key: OrderQueue; label: string }[] = [
  { key: 'ALL', label: 'All' },
  { key: 'PROCESSING', label: 'Processing' },
  { key: 'ONGOING', label: 'Ongoing' },
  { key: 'UPCOMING', label: 'Upcoming' },
  { key: 'COMPLETED', label: 'Completed' },
  { key: 'CANCELLED', label: 'Cancelled' },
  { key: 'SUPPORT', label: 'Support' },
];
