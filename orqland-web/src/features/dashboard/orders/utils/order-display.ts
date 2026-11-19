import { haversineKm } from '@/features/dashboard/common/utils/geo';
import type { Order } from '../types/order.types';

/** "Online · Paid", "Cash on delivery", "COD · Paid". */
export function paymentLabel(o: Pick<Order, 'paymentMethod' | 'paymentStatus'>): string {
  if (o.paymentMethod === 'COD') return o.paymentStatus === 'PAID' ? 'COD · Paid' : 'Cash on delivery';
  return { PAID: 'Online · Paid', PENDING: 'Online · Unpaid', FAILED: 'Payment failed', REFUND_PENDING: 'Refund due', PARTIALLY_REFUNDED: 'Part refunded', REFUNDED: 'Refunded' }[o.paymentStatus];
}

export function deliveryTypeLabel(o: Pick<Order, 'requestedFulfilment' | 'fulfilmentMethod' | 'scheduledFor'>): string {
  if (o.fulfilmentMethod === 'PICKUP' || o.requestedFulfilment === 'PICKUP') return o.scheduledFor ? 'Scheduled pickup' : 'Customer pickup';
  if (o.fulfilmentMethod === 'SELF_DELIVERY') return 'Own delivery';
  return o.scheduledFor ? 'Scheduled delivery' : 'Delivery to customer';
}

export const addressLine1 = (o: Order) =>
  o.deliveryAddressSnapshot ? [o.deliveryAddressSnapshot.doorNo, o.deliveryAddressSnapshot.street].filter(Boolean).join(', ') || o.deliveryAddressSnapshot.city || '—' : 'Collect from the shop';
export const addressLine2 = (o: Order) =>
  o.deliveryAddressSnapshot ? [o.deliveryAddressSnapshot.landmark, o.deliveryAddressSnapshot.city, o.deliveryAddressSnapshot.pincode].filter(Boolean).join(', ') : '';

export const totalQuantity = (o: Order) => o.items.reduce((n, i) => n + i.quantity, 0);
export const primaryItem = (o: Order) => o.items[0];

/** "Jan 15, 2026 at 3:00 pm" */
export function formatWhen(value: string | null | undefined): string {
  if (!value) return '—';
  const d = new Date(value);
  return `${d.toLocaleDateString('en-IN', { month: 'short', day: 'numeric', year: 'numeric' })} at ${d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })}`;
}

/** Minutes left (negative when overdue). */
export const minutesLeft = (due: string | null | undefined, now: number) => (due ? (new Date(due).getTime() - now) / 60_000 : null);

/** City travel time for display only (~20 km/h + 5 min handover). */
export const travelMinutes = (km: number | null | undefined) => (km === null || km === undefined ? null : Math.round((km / 20) * 60 + 5));

/** Agent progress towards a point, 0–1, from where the agent was when they accepted (straight line). */
export function agentDistanceKm(o: Order, target: 'pickup' | 'dropoff'): number | null {
  const a = o.delivery?.agent;
  const d = o.delivery;
  if (!a || !d || a.lastLat === null || a.lastLng === null) return null;
  const lat = target === 'pickup' ? d.pickupLat : d.dropoffLat;
  const lng = target === 'pickup' ? d.pickupLng : d.dropoffLng;
  if (lat === null || lng === null) return null;
  return haversineKm({ lat: a.lastLat, lng: a.lastLng }, { lat, lng });
}

export const reasonFor = (o: Order, status: string) => [...o.history].reverse().find((h) => h.toStatus === status)?.reason ?? null;

export const refundDue = (o: Order) => o.paymentStatus === 'REFUND_PENDING' || o.paymentStatus === 'PARTIALLY_REFUNDED';
export const cancelPending = (o: Order) => o.cancelRequestStatus === 'REQUESTED' && ['ACCEPTED', 'PREPARING', 'READY_FOR_FULFILMENT', 'AWAITING_CUSTOMER_PICKUP'].includes(o.orderStatus);

/** Delivery statuses that mean a partner is (or is being) assigned and the trip is not over. */
export const ACTIVE_DELIVERY_STATUSES = ['PENDING_ASSIGNMENT', 'OFFERED', 'ACCEPTED', 'ARRIVING_AT_PICKUP', 'PICKED_UP', 'IN_TRANSIT'];
export const hasActiveDelivery = (o: Order) => !!o.delivery && ACTIVE_DELIVERY_STATUSES.includes(o.delivery.status);
export const isPickupOrder = (o: Order) => o.requestedFulfilment === 'PICKUP' || !o.deliveryAddressSnapshot;

/** Mirrors ORDER_DEFAULT_PREPARATION_MINUTES / ORDER_PREPARATION_EXTENSION_MINUTES on the engine. */
export const DEFAULT_PREP_MINUTES = 15;
export const PREP_EXTENSION_MINUTES = 2;
export const PREP_OPTIONS = [5, 10, 15, 20, 25, 30, 45, 60, 90, 120];

/** 'low' blinks the card border; 'overdue' keeps it solid red. */
export function prepUrgency(o: Order, now: number): 'low' | 'overdue' | null {
  if (o.orderStatus !== 'PREPARING' || !o.preparationDueAt) return null;
  const left = (new Date(o.preparationDueAt).getTime() - now) / 60_000;
  if (left < 0) return 'overdue';
  const total = o.preparationMinutes ?? DEFAULT_PREP_MINUTES;
  return left <= Math.min(5, Math.max(2, total * 0.25)) ? 'low' : null;
}

export const formatClock = (value: string | number | Date | null | undefined) =>
  value === null || value === undefined ? '—' : new Date(value).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });

export function navigateUrl(o: Order): string | null {
  const lat = o.delivery?.dropoffLat ?? o.deliveryAddressSnapshot?.latitude;
  const lng = o.delivery?.dropoffLng ?? o.deliveryAddressSnapshot?.longitude;
  if (lat !== null && lat !== undefined && lng !== null && lng !== undefined) return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
  const a = o.deliveryAddressSnapshot;
  if (!a) return null;
  const q = [a.doorNo, a.street, a.landmark, a.city, a.pincode].filter(Boolean).join(', ');
  return q ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(q)}` : null;
}
