import type { AgentConnection, DeliveryOffer, DeliveryTask } from '@/features/dashboard/delivery/types/delivery.types';

export type KycCheckStatus = 'NOT_STARTED' | 'PENDING' | 'VERIFIED' | 'FAILED' | 'MISMATCH' | 'PROVIDER_UNAVAILABLE' | 'EXPIRED';
export type VehicleCategory = 'SCOOTER' | 'MOTORCYCLE' | 'THREE_WHEELER' | 'CAR' | 'VAN' | 'OTHER';

export interface AgentProfile {
  userId: string;
  orqUserId: string;
  displayName: string;
  agentStatus: 'PENDING_VERIFICATION' | 'MANUAL_REVIEW' | 'REJECTED' | 'ACTIVE' | 'KYC_BLOCKED' | 'SUSPENDED' | 'DEACTIVATED';
  availability: 'OFFLINE' | 'ONLINE' | 'BUSY';
  licenceNumberLast4: string;
  licenceStatus: KycCheckStatus;
  licenceValidTo: string | null;
  licenceNextDueAt: string | null;
  vehicleNumberMasked: string;
  vehicleCategory: VehicleCategory;
  vehicleStatus: KycCheckStatus;
  vehicleNextDueAt: string | null;
  lastFailureReason: string | null;
  suspendedReason: string | null;
  eligibleForAssignments: boolean;
  kycAlerts: string[];
  licenceFrontFileId: string | null;
  licenceBackFileId: string | null;
  vehicleRcFileId: string | null;
}

export interface EarningsWindow {
  deliveries: number;
  billableKm: string;
  estimated: string;
  approved: string;
  paid: string;
}

export interface RunHome {
  profile: AgentProfile;
  activeTasks: DeliveryTask[];
  openOffers: { offer: DeliveryOffer; task: DeliveryTask }[];
  invitations: AgentConnection[];
  connections: AgentConnection[];
  today: EarningsWindow;
  connectionLimit: number;
  unreadNotifications: number;
}

export const VEHICLE_OPTIONS: { value: VehicleCategory; label: string }[] = [
  { value: 'MOTORCYCLE', label: 'Motorcycle' },
  { value: 'SCOOTER', label: 'Scooter' },
  { value: 'THREE_WHEELER', label: 'Three-wheeler' },
  { value: 'CAR', label: 'Car' },
  { value: 'VAN', label: 'Van / goods vehicle' },
];

export interface EarningLine {
  id: string;
  taskId: string;
  taskNumber: string;
  orderNumber: string;
  orqspaceId: string;
  orqspaceName: string;
  distanceSource: string;
  estimatedDistanceKm: string | null;
  measuredDistanceKm: string | null;
  approvedBillableKm: string;
  ratePerKm: string;
  baseAmount: string;
  adjustmentTotal: string;
  finalAmount: string;
  status: string;
  periodMonth: string;
  deliveredAt: string | null;
  paidAt: string | null;
  payoutReference: string | null;
}

export interface EarningsOverview {
  myDeliveryStatement: {
    periodMonth: string;
    periodStart: string;
    periodEnd: string;
    isClosed: boolean;
    status: 'DRAFT' | 'FINAL' | null;
    adjustmentTotal: string;
    grandTotal: string;
    csv: string;
    totals: EarningsWindow;
    byWorkspace: { orqspaceId: string; orqspaceName: string; deliveries: number; billableKm: string; amount: string }[];
    lines: EarningLine[];
  };
  myDeliveryPerformance: {
    offered: number;
    accepted: number;
    declined: number;
    expired: number;
    completed: number;
    failed: number;
    trackedKm: string;
    billableKm: string;
    averageDistanceKm: string;
    averageEarningPerDelivery: string;
  };
  myDeliveryEarningsTrend: { periodMonth: string; deliveries: number; billableKm: string; amount: string }[];
}

export interface VerificationAttempt {
  id: string;
  checkType: 'DRIVING_LICENCE' | 'VEHICLE_RC';
  trigger: string;
  status: string;
  mismatchFields: string[];
  requestedAt: string;
  completedAt: string | null;
}

export interface FullAgentProfile extends AgentProfile {
  vehicleRcValidTo: string | null;
  licenceVerifiedAt: string | null;
  vehicleVerifiedAt: string | null;
  activatedAt: string | null;
  maxConcurrentTasks: number;
  verifications: VerificationAttempt[];
}

export interface RunNotification {
  id: string;
  type: string;
  title: string;
  body: string;
  readAt: string | null;
  createdAt: string;
}

export type TicketCategory = 'DELIVERY' | 'EARNINGS_PAYMENT' | 'KYC' | 'WORKSPACE' | 'TECHNICAL' | 'ACCOUNT_SECURITY' | 'EMERGENCY';

export interface SupportTicket {
  id: string;
  ticketNumber: string;
  category: TicketCategory;
  subject: string;
  description: string;
  priority: string;
  status: string;
  assignedTeam: string | null;
  relatedTaskId: string | null;
  relatedTaskNumber: string | null;
  relatedEarningId: string | null;
  relatedPeriodMonth: string | null;
  resolvedAt: string | null;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
  messages?: { id: string; authorRole: string; authorName: string | null; body: string; attachmentUrls: string[]; attachmentFileIds: string[]; createdAt: string }[];
}

export const TICKET_CATEGORIES: { value: TicketCategory; label: string; hint: string }[] = [
  { value: 'DELIVERY', label: 'Delivery issue', hint: 'Customer unavailable, wrong address, failed pickup, delivery dispute' },
  { value: 'EARNINGS_PAYMENT', label: 'Earnings & payment', hint: 'Wrong kilometres, rate mismatch, missing or unpaid earnings, COD' },
  { value: 'KYC', label: 'Verification (KYC)', hint: 'Surepass failure, wrong document details, re-KYC problems' },
  { value: 'WORKSPACE', label: 'Workspace', hint: 'Connection disputes, incorrect rates, disconnection problems' },
  { value: 'TECHNICAL', label: 'App / technical', hint: 'GPS failure, app crash, network problems, cannot accept a delivery' },
  { value: 'ACCOUNT_SECURITY', label: 'Account & security', hint: 'Restricted access, suspected fraud, unauthorised activity, deactivation' },
  { value: 'EMERGENCY', label: 'Emergency / accident', hint: 'Urgent safety incident — also call 112' },
];

export interface AgentStatement {
  id: string;
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

export interface NotificationPreference {
  type: string;
  group: 'OFFERS' | 'DELIVERY_UPDATES' | 'WORKSPACES' | 'EARNINGS_COD' | 'ACCOUNT_KYC' | 'SUPPORT';
  label: string;
  enabled: boolean;
  locked: boolean;
}
