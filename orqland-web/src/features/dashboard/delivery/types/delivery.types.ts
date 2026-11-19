import type { AddressSnapshot } from '../../orders/types/order.types';

export type Availability = 'OFFLINE' | 'ONLINE' | 'BUSY';
export type AgentStatus = 'PENDING_VERIFICATION' | 'MANUAL_REVIEW' | 'REJECTED' | 'ACTIVE' | 'KYC_BLOCKED' | 'SUSPENDED' | 'DEACTIVATED';
export type ConnectionStatus = 'PENDING' | 'ACTIVE' | 'DECLINED' | 'CANCELLED' | 'EXPIRED' | 'DISCONNECTED';
export type TaskStatus =
  | 'PENDING_ASSIGNMENT'
  | 'OFFERED'
  | 'ACCEPTED'
  | 'ARRIVING_AT_PICKUP'
  | 'PICKED_UP'
  | 'IN_TRANSIT'
  | 'DELIVERED'
  | 'FAILED'
  | 'CANCELLED'
  | 'RETURNED_TO_ORIGIN';
export type DeliveryMode = 'SELF' | 'AGENT';
export type AssignmentType = 'MANUAL' | 'AUTO';
export type AssignmentStrategy = 'NEAREST' | 'LEAST_LOADED' | 'HYBRID';
export type CodStatus = 'PENDING_COLLECTION' | 'COLLECTED' | 'PARTIALLY_SETTLED' | 'SETTLED' | 'DISCREPANCY' | 'UNDER_REVIEW' | 'NOT_COLLECTED';
export type CodMethod = 'CASH' | 'UPI_TO_SELLER' | 'OTHER';
export type EarningStatus = 'ESTIMATED' | 'PENDING_APPROVAL' | 'UNDER_REVIEW' | 'APPROVED' | 'PAID' | 'VOID';

export const PRE_PICKUP: TaskStatus[] = ['PENDING_ASSIGNMENT', 'OFFERED', 'ACCEPTED', 'ARRIVING_AT_PICKUP'];
export const TERMINAL: TaskStatus[] = ['DELIVERED', 'FAILED', 'CANCELLED', 'RETURNED_TO_ORIGIN'];

export interface AgentSummary {
  userId: string;
  orqUserId: string;
  displayName: string;
  avatar: string | null;
  phone: string | null;
  agentStatus: AgentStatus;
  availability: Availability;
  vehicleCategory: string;
  vehicleNumberMasked: string;
  kycValid: boolean;
  activeTaskCount: number;
  lastLat: number | null;
  lastLng: number | null;
  lastLocationAt: string | null;
}

export interface AgentConnection {
  id: string;
  orqspaceId: string;
  orqspaceName: string;
  agentUserId: string;
  agent: AgentSummary;
  status: ConnectionStatus;
  currentRatePerKm: string;
  inviteMessage: string | null;
  invitedAt: string;
  inviteExpiresAt: string;
  activatedAt: string | null;
  disconnectedAt: string | null;
  disconnectReason: string | null;
  disconnectRequestStatus: 'REQUESTED' | 'COMPLETED' | 'WITHDRAWN' | null;
  disconnectRequestedAt: string | null;
  disconnectRequestedByRole: 'AGENT' | 'WORKSPACE' | 'PLATFORM_ADMIN' | null;
  disconnectRequestReason: string | null;
  activeTaskCount: number;
  rateHistory?: { id: string; ratePerKm: string; effectiveFrom: string; reason: string | null }[];
}

export interface AgentSearchResult {
  agent: AgentSummary | null;
  canInvite: boolean;
  reason: string | null;
  existingConnection: Pick<AgentConnection, 'id' | 'status'> | null;
  workspaceActiveConnections: number;
  workspaceConnectionLimit: number;
}

export interface DeliveryOffer {
  id: string;
  taskId: string;
  agentUserId: string;
  agentName: string | null;
  assignmentType: AssignmentType;
  status: string;
  ratePerKmOffered: string;
  distanceToPickupKm: string | null;
  offeredAt: string;
  expiresAt: string;
  declineReason: string | null;
}

export interface DeliveryEvent {
  id: string;
  fromStatus: TaskStatus | null;
  toStatus: TaskStatus;
  actorRole: string;
  actorName: string | null;
  reason: string | null;
  isOverride: boolean;
  createdAt: string;
}

export interface DeliveryTask {
  id: string;
  taskNumber: string;
  orderId: string;
  orderNumber: string;
  orqspaceId: string;
  orqspaceName: string;
  mode: DeliveryMode;
  assignmentType: AssignmentType | null;
  status: TaskStatus;
  needsAttention: boolean;
  attentionReason: string | null;
  agentUserId: string | null;
  agent: AgentSummary | null;
  ratePerKmSnapshot: string | null;
  selfStaffName: string | null;
  selfStaffPhone: string | null;
  pickupSnapshot: AddressSnapshot | null;
  dropoffSnapshot: AddressSnapshot | null;
  dropoffArea: string | null;
  pickupLat: number | null;
  pickupLng: number | null;
  dropoffLat: number | null;
  dropoffLng: number | null;
  estimatedDistanceKm: string | null;
  measuredDistanceKm: string | null;
  estimatedEarnings: string | null;
  codAmount: string;
  requiresOtp: boolean;
  podType: string | null;
  podRecipientName: string | null;
  podFileId: string | null;
  acceptedAt: string | null;
  pickedUpAt: string | null;
  deliveredAt: string | null;
  failureReason: string | null;
  cancellationReason: string | null;
  attemptNo: number;
  currentOffer: DeliveryOffer | null;
  createdAt: string;
  updatedAt: string;
  events?: DeliveryEvent[];
  offers?: DeliveryOffer[];
}

export interface DeliverySettings {
  orqspaceId: string;
  timezone: string;
  pickupAddress: AddressSnapshot | null;
  pickupLat: number | null;
  pickupLng: number | null;
  autoAssignEnabled: boolean;
  assignmentStrategy: AssignmentStrategy;
  offerTimeoutSeconds: number;
  maxOfferAttempts: number;
  maxPickupRadiusKm: string;
  roadDistanceFactor: string;
  requireDeliveryOtp: boolean;
  activeAgentCount: number;
  agentLimit: number;
  readyForAgentDispatch: boolean;
}

export interface CodRecord {
  id: string;
  taskId: string;
  taskNumber: string;
  orderNumber: string;
  agentName: string | null;
  expectedAmount: string;
  collectedAmount: string | null;
  collectionMethod: CodMethod | null;
  collectionProofFileId: string | null;
  collectedAt: string | null;
  settledAmount: string;
  outstandingAmount: string;
  status: CodStatus;
  discrepancyReason: string | null;
  createdAt: string;
  settlements: { id: string; amount: string; method: CodMethod; note: string | null; recordedByName: string | null; createdAt: string }[];
}

export interface CodSummary {
  expected: string;
  collected: string;
  settled: string;
  outstanding: string;
  openRecords: number;
  discrepancies: number;
}

export interface DeliveryEarning {
  id: string;
  taskId: string;
  taskNumber: string;
  orderNumber: string;
  agentUserId: string;
  agentName: string;
  distanceSource: string;
  estimatedDistanceKm: string | null;
  measuredDistanceKm: string | null;
  approvedBillableKm: string;
  ratePerKm: string;
  baseAmount: string;
  adjustmentTotal: string;
  finalAmount: string;
  status: EarningStatus;
  periodMonth: string;
  deliveredAt: string | null;
  paidAt: string | null;
  payoutReference: string | null;
}

export interface CostReport {
  periodMonth: string;
  deliveries: number;
  billableKm: string;
  totalAmount: string;
  pendingAmount: string;
  approvedAmount: string;
  paidAmount: string;
  selfDeliveries: number;
  failedDeliveries: number;
  byAgent: { agentUserId: string; agentName: string; deliveries: number; billableKm: string; amount: string; pendingAmount: string; approvedAmount: string; paidAmount: string }[];
}

export interface DeliveryStatement {
  id: string;
  agentUserId: string;
  agentName: string;
  agentOrqUserId: string;
  orqspaceId: string;
  orqspaceName: string;
  periodMonth: string;
  periodStart: string;
  periodEnd: string;
  status: 'DRAFT' | 'FINAL';
  deliveries: number;
  approvedKm: string;
  baseAmount: string;
  adjustments: string;
  finalAmount: string;
  paidAmount: string;
  outstandingAmount: string;
  codCollected: string;
  codSettled: string;
  generatedAt: string;
  finalizedAt: string | null;
}

export interface AgentWorkload {
  agentUserId: string;
  displayName: string;
  orqUserId: string;
  availability: Availability;
  activeTasks: number;
  deliveredToday: number;
  maxConcurrentTasks: number;
  ratePerKm: string;
  lastLocationAt: string | null;
  locationStale: boolean;
  disconnectPending: boolean;
}

export interface SlaBreach {
  kind: 'ORDER_ACCEPT' | 'DELIVERY';
  orderId: string;
  taskId: string | null;
  reference: string;
  stage: string;
  minutesOver: number;
  targetMinutes: number;
}

export interface DeliveryOperations {
  orqspaceId: string;
  generatedAt: string;
  timezone: string;
  queue: { newOrders: number; preparing: number; readyForFulfilment: number; awaitingPickup: number; outForDelivery: number; deliveryFailed: number };
  deliveries: { unassigned: number; offered: number; toPickup: number; inTransit: number; needsAttention: number; openOffers: number; deliveredToday: number; failedToday: number };
  timings: {
    windowDays: number;
    medianOrderAcceptMinutes: number | null;
    medianAssignMinutes: number | null;
    medianPickupMinutes: number | null;
    medianDeliverMinutes: number | null;
    medianEndToEndMinutes: number | null;
    orderAcceptSlaPercent: number | null;
    deliverySlaPercent: number | null;
    successRatePercent: number | null;
    averageDistanceKm: string | null;
    slaTargets: { orderAcceptMinutes: number; assignMinutes: number; pickupMinutes: number; deliverMinutes: number };
  };
  agents: { connected: number; connectionLimit: number; online: number; busy: number; offline: number; staleLocation: number; workload: AgentWorkload[] };
  cod: { outstanding: string; expectedOpen: string; discrepancies: number };
  breaches: SlaBreach[];
  trend: { day: string; delivered: number; failed: number }[];
}
