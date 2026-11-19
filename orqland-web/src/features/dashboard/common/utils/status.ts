import type { StatusTone } from '@/components/ui/status-dot';

/** One vocabulary for state across orders, deliveries, COD and earnings: a dot tone + a plain label. */
export interface StatusMeta {
  tone: StatusTone;
  label: string;
}

const m = (tone: StatusTone, label: string): StatusMeta => ({ tone, label });

export const ORDER_STATUS: Record<string, StatusMeta> = {
  PLACED: m('warning', 'New'),
  ACCEPTED: m('active', 'Accepted'),
  PREPARING: m('active', 'Preparing'),
  READY_FOR_FULFILMENT: m('warning', 'Ready'),
  AWAITING_CUSTOMER_PICKUP: m('active', 'Awaiting pickup'),
  OUT_FOR_DELIVERY: m('live', 'Out for delivery'),
  DELIVERY_FAILED: m('critical', 'Delivery failed'),
  DELIVERED: m('good', 'Delivered'),
  PICKED_UP: m('good', 'Picked up'),
  RETURN_REQUESTED: m('warning', 'Return requested'),
  RETURNED: m('idle', 'Returned'),
  REJECTED: m('idle', 'Rejected'),
  CANCELLED: m('idle', 'Cancelled'),
};

export const TASK_STATUS: Record<string, StatusMeta> = {
  PENDING_ASSIGNMENT: m('warning', 'Unassigned'),
  OFFERED: m('warning', 'Offered'),
  ACCEPTED: m('active', 'Accepted'),
  ARRIVING_AT_PICKUP: m('active', 'Arriving at pickup'),
  PICKED_UP: m('live', 'Picked up'),
  IN_TRANSIT: m('live', 'In transit'),
  DELIVERED: m('good', 'Delivered'),
  FAILED: m('critical', 'Failed'),
  CANCELLED: m('idle', 'Cancelled'),
  RETURNED_TO_ORIGIN: m('idle', 'Returned to origin'),
};

export const PAYMENT_STATUS: Record<string, StatusMeta> = {
  PENDING: m('warning', 'Unpaid'),
  PAID: m('good', 'Paid'),
  FAILED: m('critical', 'Payment failed'),
  REFUND_PENDING: m('warning', 'Refund due'),
  PARTIALLY_REFUNDED: m('idle', 'Part refunded'),
  REFUNDED: m('idle', 'Refunded'),
};

export const AVAILABILITY: Record<string, StatusMeta> = {
  ONLINE: m('live', 'Online'),
  BUSY: m('active', 'On a delivery'),
  OFFLINE: m('idle', 'Offline'),
};

export const AGENT_STATUS: Record<string, StatusMeta> = {
  ACTIVE: m('good', 'Verified'),
  PENDING_VERIFICATION: m('warning', 'Verifying'),
  MANUAL_REVIEW: m('warning', 'Under review'),
  KYC_BLOCKED: m('critical', 'KYC blocked'),
  SUSPENDED: m('critical', 'Suspended'),
  REJECTED: m('critical', 'Rejected'),
  DEACTIVATED: m('idle', 'Deactivated'),
};

export const KYC_CHECK: Record<string, StatusMeta> = {
  VERIFIED: m('good', 'Verified'),
  PENDING: m('warning', 'Pending'),
  NOT_STARTED: m('idle', 'Not started'),
  FAILED: m('critical', 'Failed'),
  MISMATCH: m('warning', 'Mismatch — in review'),
  PROVIDER_UNAVAILABLE: m('warning', 'Provider unavailable'),
  EXPIRED: m('critical', 'Expired'),
};

export const CONNECTION_STATUS: Record<string, StatusMeta> = {
  ACTIVE: m('good', 'Connected'),
  PENDING: m('warning', 'Invited'),
  DECLINED: m('idle', 'Declined'),
  CANCELLED: m('idle', 'Cancelled'),
  EXPIRED: m('idle', 'Expired'),
  DISCONNECTED: m('idle', 'Disconnected'),
};

export const COD_STATUS: Record<string, StatusMeta> = {
  PENDING_COLLECTION: m('idle', 'To collect'),
  COLLECTED: m('warning', 'With agent'),
  PARTIALLY_SETTLED: m('warning', 'Part settled'),
  SETTLED: m('good', 'Settled'),
  DISCREPANCY: m('critical', 'Discrepancy'),
  UNDER_REVIEW: m('warning', 'Under review'),
  NOT_COLLECTED: m('idle', 'Not collected'),
};

export const EARNING_STATUS: Record<string, StatusMeta> = {
  ESTIMATED: m('idle', 'Estimated'),
  PENDING_APPROVAL: m('warning', 'Pending approval'),
  UNDER_REVIEW: m('warning', 'Under review'),
  APPROVED: m('active', 'Approved'),
  PAID: m('good', 'Paid'),
  VOID: m('muted', 'Void'),
};

export const TICKET_STATUS: Record<string, StatusMeta> = {
  OPEN: m('warning', 'Open'),
  IN_PROGRESS: m('active', 'In progress'),
  WAITING_ON_AGENT: m('warning', 'Waiting on you'),
  RESOLVED: m('good', 'Resolved'),
  CLOSED: m('idle', 'Closed'),
};

export const metaOf = (map: Record<string, StatusMeta>, key: string | null | undefined): StatusMeta =>
  (key && map[key]) || { tone: 'idle', label: key ? key.charAt(0) + key.slice(1).toLowerCase().replace(/_/g, ' ') : '—' };

/** The agent delivery steps in order, for progress and timelines. */
export const TASK_STEPS = ['ACCEPTED', 'ARRIVING_AT_PICKUP', 'PICKED_UP', 'IN_TRANSIT', 'DELIVERED'] as const;
