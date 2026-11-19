import { sql } from 'drizzle-orm';
import {
  bigserial,
  boolean,
  char,
  check,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  real,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
// Existing ORQLAND tables (read-only references — never altered by this module).
import { deliveryAgents } from './delivery-agents.schema';
import { orqspaces } from './orqspaces.schema';
import { orqUsers } from './users.schema';
import { actorRoleEnum, orders, type AddressSnapshot } from './orders.schema';

/**
 * Delivery Management — tables 6–19 of the approved proposal:
 * delivery settings, agent profiles & KYC, workspace connections & rates, tasks, offers, events,
 * location pings, COD, earnings and the audit log.
 */

// Column helpers
const ts = (name: string) => timestamp(name, { withTimezone: true });
const coord = (name: string) => numeric(name, { precision: 9, scale: 6 });
const km = (name: string) => numeric(name, { precision: 8, scale: 2 });
const money = (name: string) => numeric(name, { precision: 12, scale: 2 });

// ── Enums ──────────────────────────────────────────────────────────────────
export const deliveryAgentStatusEnum = pgEnum('delivery_agent_status', [
  'PENDING_VERIFICATION',
  'MANUAL_REVIEW',
  'REJECTED',
  'ACTIVE',
  'KYC_BLOCKED',
  'SUSPENDED',
  'DEACTIVATED',
]);

export const deliveryAgentAvailabilityEnum = pgEnum('delivery_agent_availability', ['OFFLINE', 'ONLINE', 'BUSY']);

export const kycCheckStatusEnum = pgEnum('kyc_check_status', [
  'NOT_STARTED',
  'PENDING',
  'VERIFIED',
  'FAILED',
  'MISMATCH',
  'PROVIDER_UNAVAILABLE',
  'EXPIRED',
]);

export const vehicleCategoryEnum = pgEnum('vehicle_category', [
  'BICYCLE',
  'SCOOTER',
  'MOTORCYCLE',
  'THREE_WHEELER',
  'CAR',
  'VAN',
  'OTHER',
]);

export const kycCheckTypeEnum = pgEnum('kyc_check_type', ['DRIVING_LICENCE', 'VEHICLE_RC']);

export const kycTriggerEnum = pgEnum('kyc_trigger', ['REGISTRATION', 'RE_KYC', 'VEHICLE_CHANGE', 'MANUAL_REVIEW']);

export const kycAttemptStatusEnum = pgEnum('kyc_attempt_status', [
  'PENDING',
  'PASSED',
  'FAILED',
  'MISMATCH',
  'PROVIDER_UNAVAILABLE',
]);

export const agentConnectionStatusEnum = pgEnum('agent_connection_status', [
  'PENDING',
  'ACTIVE',
  'DECLINED',
  'CANCELLED',
  'EXPIRED',
  'DISCONNECTED',
]);

export const assignmentStrategyEnum = pgEnum('assignment_strategy', ['NEAREST', 'LEAST_LOADED', 'HYBRID']);

export const deliveryModeEnum = pgEnum('delivery_mode', ['SELF', 'AGENT']);

export const assignmentTypeEnum = pgEnum('assignment_type', ['MANUAL', 'AUTO']);

export const deliveryTaskStatusEnum = pgEnum('delivery_task_status', [
  'PENDING_ASSIGNMENT',
  'OFFERED',
  'ACCEPTED',
  'ARRIVING_AT_PICKUP',
  'PICKED_UP',
  'IN_TRANSIT',
  'DELIVERED',
  'FAILED',
  'CANCELLED',
  'RETURNED_TO_ORIGIN',
]);

export const deliveryOfferStatusEnum = pgEnum('delivery_offer_status', [
  'OFFERED',
  'ACCEPTED',
  'DECLINED',
  'EXPIRED',
  'WITHDRAWN',
]);

export const proofOfDeliveryTypeEnum = pgEnum('proof_of_delivery_type', [
  'OTP',
  'PHOTO',
  'SIGNATURE_NAME',
  'ADMIN_OVERRIDE',
]);

export const codCollectionMethodEnum = pgEnum('cod_collection_method', ['CASH', 'UPI_TO_SELLER', 'OTHER']);

export const codStatusEnum = pgEnum('cod_status', [
  'PENDING_COLLECTION',
  'COLLECTED',
  'PARTIALLY_SETTLED',
  'SETTLED',
  'DISCREPANCY',
  'UNDER_REVIEW',
  'NOT_COLLECTED',
]);

export const distanceSourceEnum = pgEnum('distance_source', ['ESTIMATED_ROUTE', 'GPS_TRACE', 'WORKSPACE_APPROVED']);

/** Proposed addition (SCHEMA_DESIGN.md §11): what an uploaded delivery document is for. */
export const deliveryFilePurposeEnum = pgEnum('delivery_file_purpose', [
  'LICENCE_FRONT',
  'LICENCE_BACK',
  'VEHICLE_RC',
  'PROOF_OF_DELIVERY',
  'COD_PROOF',
  'SUPPORT_ATTACHMENT',
  'ORDER_INVOICE',
]);

export const deliveryStatementStatusEnum = pgEnum('delivery_statement_status', ['DRAFT', 'FINAL']);

export const disconnectRequestStatusEnum = pgEnum('disconnect_request_status', ['REQUESTED', 'COMPLETED', 'WITHDRAWN']);

export const earningStatusEnum = pgEnum('earning_status', [
  'ESTIMATED',
  'PENDING_APPROVAL',
  'UNDER_REVIEW',
  'APPROVED',
  'PAID',
  'VOID',
]);

export type DeliveryAgentStatus = (typeof deliveryAgentStatusEnum.enumValues)[number];
export type DeliveryAgentAvailability = (typeof deliveryAgentAvailabilityEnum.enumValues)[number];
export type KycCheckStatus = (typeof kycCheckStatusEnum.enumValues)[number];
export type VehicleCategory = (typeof vehicleCategoryEnum.enumValues)[number];
export type KycCheckType = (typeof kycCheckTypeEnum.enumValues)[number];
export type KycTrigger = (typeof kycTriggerEnum.enumValues)[number];
export type KycAttemptStatus = (typeof kycAttemptStatusEnum.enumValues)[number];
export type AgentConnectionStatus = (typeof agentConnectionStatusEnum.enumValues)[number];
export type AssignmentStrategy = (typeof assignmentStrategyEnum.enumValues)[number];
export type DeliveryMode = (typeof deliveryModeEnum.enumValues)[number];
export type AssignmentType = (typeof assignmentTypeEnum.enumValues)[number];
export type DeliveryTaskStatus = (typeof deliveryTaskStatusEnum.enumValues)[number];
export type DeliveryOfferStatus = (typeof deliveryOfferStatusEnum.enumValues)[number];
export type ProofOfDeliveryType = (typeof proofOfDeliveryTypeEnum.enumValues)[number];
export type CodCollectionMethod = (typeof codCollectionMethodEnum.enumValues)[number];
export type CodStatus = (typeof codStatusEnum.enumValues)[number];
export type DistanceSource = (typeof distanceSourceEnum.enumValues)[number];
export type EarningStatus = (typeof earningStatusEnum.enumValues)[number];
export type DeliveryFilePurpose = (typeof deliveryFilePurposeEnum.enumValues)[number];
export type DeliveryStatementStatus = (typeof deliveryStatementStatusEnum.enumValues)[number];
export type DisconnectRequestStatus = (typeof disconnectRequestStatusEnum.enumValues)[number];

// ── Workspace delivery settings, connections & rates ──────────────────────

/** Per-workspace delivery configuration. Also used as the lock row for connection-limit checks. */
export const orqspaceDeliverySettings = pgTable(
  'orqspace_delivery_settings',
  {
    orqspaceId: uuid('orqspace_id')
      .primaryKey()
      .references(() => orqspaces.id, { onDelete: 'cascade' }),
    timezone: varchar('timezone', { length: 64 }).notNull().default('Asia/Kolkata'),
    pickupAddress: jsonb('pickup_address').$type<AddressSnapshot>(),
    pickupLat: numeric('pickup_lat', { precision: 9, scale: 6 }),
    pickupLng: numeric('pickup_lng', { precision: 9, scale: 6 }),
    autoAssignEnabled: boolean('auto_assign_enabled').notNull().default(false),
    assignmentStrategy: assignmentStrategyEnum('assignment_strategy').notNull().default('NEAREST'),
    offerTimeoutSeconds: integer('offer_timeout_seconds').notNull().default(90),
    maxOfferAttempts: integer('max_offer_attempts').notNull().default(5),
    maxPickupRadiusKm: numeric('max_pickup_radius_km', { precision: 6, scale: 2 }).notNull().default('15'),
    roadDistanceFactor: numeric('road_distance_factor', { precision: 4, scale: 2 }).notNull().default('1.30'),
    requireDeliveryOtp: boolean('require_delivery_otp').notNull().default(true),
    createdAt: ts('created_at').notNull().defaultNow(),
    updatedAt: ts('updated_at')
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    check('orqspace_delivery_settings_timeout_chk', sql`${t.offerTimeoutSeconds} BETWEEN 15 AND 900`),
    check('orqspace_delivery_settings_attempts_chk', sql`${t.maxOfferAttempts} BETWEEN 1 AND 20`),
  ],
);

/** Workspace ↔ delivery agent relationship. History is preserved; only one live row per pair. */
export const orqspaceAgentConnections = pgTable(
  'orqspace_agent_connections',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orqspaceId: uuid('orqspace_id')
      .notNull()
      .references(() => orqspaces.id, { onDelete: 'restrict' }),
    agentUserId: uuid('agent_user_id')
      .notNull()
      .references(() => deliveryAgents.userId, { onDelete: 'restrict' }),
    status: agentConnectionStatusEnum('status').notNull().default('PENDING'),
    initiatedByUserId: uuid('initiated_by_user_id')
      .notNull()
      .references(() => orqUsers.id, { onDelete: 'restrict' }),
    initiatedByRole: actorRoleEnum('initiated_by_role').notNull().default('WORKSPACE'),
    currentRatePerKm: numeric('current_rate_per_km', { precision: 10, scale: 2 }).notNull(),
    inviteMessage: varchar('invite_message', { length: 280 }),
    invitedAt: ts('invited_at').notNull().defaultNow(),
    inviteExpiresAt: ts('invite_expires_at').notNull(),
    respondedAt: ts('responded_at'),
    activatedAt: ts('activated_at'),
    disconnectedAt: ts('disconnected_at'),
    disconnectedByUserId: uuid('disconnected_by_user_id').references(() => orqUsers.id, { onDelete: 'set null' }),
    disconnectReason: text('disconnect_reason'),
    // Disconnect request (guide §Workspace connection: "either side may request a disconnection;
    // the engine stops new offers and completes the disconnect once active tasks reach zero").
    disconnectRequestStatus: disconnectRequestStatusEnum('disconnect_request_status'),
    disconnectRequestedAt: ts('disconnect_requested_at'),
    disconnectRequestedByUserId: uuid('disconnect_requested_by_user_id').references(() => orqUsers.id, { onDelete: 'set null' }),
    disconnectRequestedByRole: actorRoleEnum('disconnect_requested_by_role'),
    disconnectRequestReason: text('disconnect_request_reason'),
    createdAt: ts('created_at').notNull().defaultNow(),
    updatedAt: ts('updated_at')
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    uniqueIndex('orqspace_agent_connections_live_uq')
      .on(t.orqspaceId, t.agentUserId)
      .where(sql`${t.status} IN ('PENDING', 'ACTIVE')`),
    index('orqspace_agent_connections_orqspace_idx').on(t.orqspaceId, t.status),
    index('orqspace_agent_connections_agent_idx').on(t.agentUserId, t.status),
    check('orqspace_agent_connections_rate_chk', sql`${t.currentRatePerKm} > 0`),
  ],
);

export const orqspaceAgentRateHistory = pgTable(
  'orqspace_agent_rate_history',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    connectionId: uuid('connection_id')
      .notNull()
      .references(() => orqspaceAgentConnections.id, { onDelete: 'cascade' }),
    ratePerKm: numeric('rate_per_km', { precision: 10, scale: 2 }).notNull(),
    effectiveFrom: ts('effective_from').notNull().defaultNow(),
    setByUserId: uuid('set_by_user_id').references(() => orqUsers.id, { onDelete: 'set null' }),
    reason: text('reason'),
    createdAt: ts('created_at').notNull().defaultNow(),
  },
  (t) => [
    index('orqspace_agent_rate_history_connection_idx').on(t.connectionId, t.effectiveFrom.desc()),
    check('orqspace_agent_rate_history_rate_chk', sql`${t.ratePerKm} > 0`),
  ],
);

// ── Delivery documents ────────────────────────────────────────────────────

/**
 * Uploaded delivery documents (licence front/back, RC, proof of delivery, COD proof, ticket attachments).
 * Bytes live in object storage (local encrypted disk in dev, GCP bucket in the main codebase); this row
 * is the access-controlled index. KYC images are never served publicly — downloads go through the engine.
 */
export const deliveryFiles = pgTable(
  'delivery_files',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ownerUserId: uuid('owner_user_id')
      .notNull()
      .references(() => orqUsers.id, { onDelete: 'cascade' }),
    purpose: deliveryFilePurposeEnum('purpose').notNull(),
    storageKey: varchar('storage_key', { length: 255 }).notNull().unique(),
    mimeType: varchar('mime_type', { length: 80 }).notNull(),
    sizeBytes: integer('size_bytes').notNull(),
    sha256: char('sha256', { length: 64 }).notNull(),
    originalName: varchar('original_name', { length: 160 }),
    /** For ORDER_INVOICE: the order the invoice belongs to (visible to that order's customer and workspace). */
    orderId: uuid('order_id').references(() => orders.id, { onDelete: 'cascade' }),
    /** Set when the file is attached to a record; unattached uploads are purged after 24 h. */
    attachedAt: ts('attached_at'),
    deletedAt: ts('deleted_at'),
    createdAt: ts('created_at').notNull().defaultNow(),
  },
  (t) => [
    index('delivery_files_owner_idx').on(t.ownerUserId, t.purpose, t.createdAt.desc()),
    index('delivery_files_order_idx').on(t.orderId, t.purpose, t.createdAt.desc()),
    index('delivery_files_unattached_idx')
      .on(t.createdAt)
      .where(sql`${t.attachedAt} IS NULL AND ${t.deletedAt} IS NULL`),
    check('delivery_files_size_chk', sql`${t.sizeBytes} > 0`),
  ],
);

// ── Agent profiles & KYC ──────────────────────────────────────────────────

/**
 * One row per Orqland user who applied to become a delivery agent.
 * Raw licence/vehicle numbers are only stored encrypted (AES-256-GCM); lookups use keyed fingerprints.
 */
export const deliveryAgentProfiles = pgTable(
  'delivery_agent_profiles',
  {
    userId: uuid('user_id')
      .primaryKey()
      .references(() => orqUsers.id, { onDelete: 'cascade' }),
    agentStatus: deliveryAgentStatusEnum('agent_status').notNull().default('PENDING_VERIFICATION'),
    availability: deliveryAgentAvailabilityEnum('availability').notNull().default('OFFLINE'),
    maxConcurrentTasks: smallint('max_concurrent_tasks').notNull().default(1),

    licenceNumberEnc: text('licence_number_enc').notNull(),
    licenceNumberLast4: varchar('licence_number_last4', { length: 4 }).notNull(),
    licenceDobEnc: text('licence_dob_enc').notNull(),
    licenceStatus: kycCheckStatusEnum('licence_status').notNull().default('NOT_STARTED'),
    licenceValidTo: date('licence_valid_to'),
    licenceVerifiedAt: ts('licence_verified_at'),
    licenceNextDueAt: ts('licence_next_due_at'),

    vehicleNumberEnc: text('vehicle_number_enc').notNull(),
    vehicleNumberMasked: varchar('vehicle_number_masked', { length: 20 }).notNull(),
    vehicleCategory: vehicleCategoryEnum('vehicle_category').notNull(),
    vehicleStatus: kycCheckStatusEnum('vehicle_status').notNull().default('NOT_STARTED'),
    vehicleRcValidTo: date('vehicle_rc_valid_to'),
    vehicleVerifiedAt: ts('vehicle_verified_at'),
    vehicleNextDueAt: ts('vehicle_next_due_at'),

    licenceFp: char('licence_fp', { length: 64 }).notNull(),
    vehicleFp: char('vehicle_fp', { length: 64 }).notNull(),
    combinedFp: char('combined_fp', { length: 64 }).notNull(),

    // Document images captured at registration (guide: "Required documents: driving licence,
    // licence images, vehicle registration number"). Reviewed by the platform team only.
    licenceFrontFileId: uuid('licence_front_file_id').references(() => deliveryFiles.id, { onDelete: 'set null' }),
    licenceBackFileId: uuid('licence_back_file_id').references(() => deliveryFiles.id, { onDelete: 'set null' }),
    vehicleRcFileId: uuid('vehicle_rc_file_id').references(() => deliveryFiles.id, { onDelete: 'set null' }),

    consentVersion: varchar('consent_version', { length: 20 }).notNull(),
    consentGivenAt: ts('consent_given_at').notNull(),
    lastFailureReason: text('last_failure_reason'),

    suspendedReason: text('suspended_reason'),
    suspendedAt: ts('suspended_at'),
    suspendedByUserId: uuid('suspended_by_user_id').references(() => orqUsers.id, { onDelete: 'set null' }),
    activatedAt: ts('activated_at'),

    lastLat: numeric('last_lat', { precision: 9, scale: 6 }),
    lastLng: numeric('last_lng', { precision: 9, scale: 6 }),
    lastLocationAt: ts('last_location_at'),
    lastAvailabilityChangeAt: ts('last_availability_change_at'),

    createdAt: ts('created_at').notNull().defaultNow(),
    updatedAt: ts('updated_at')
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    // Rejected applications are excluded so a failed attempt with someone else's licence cannot block its owner.
    uniqueIndex('delivery_agent_profiles_licence_fp_uq')
      .on(t.licenceFp)
      .where(sql`${t.agentStatus} <> 'REJECTED'`),
    uniqueIndex('delivery_agent_profiles_combined_fp_uq')
      .on(t.combinedFp)
      .where(sql`${t.agentStatus} <> 'REJECTED'`),
    index('delivery_agent_profiles_vehicle_fp_idx').on(t.vehicleFp),
    index('delivery_agent_profiles_status_idx').on(t.agentStatus, t.availability),
    index('delivery_agent_profiles_licence_due_idx').on(t.licenceNextDueAt),
    index('delivery_agent_profiles_vehicle_due_idx').on(t.vehicleNextDueAt),
  ],
);

export type KycResponseSummary = {
  validTo?: string | null;
  providerStatus?: string | null;
  nameMatch?: boolean | null;
  categoryMatch?: boolean | null;
  notes?: string[];
};

/** Append-only log of every verification attempt. Never stores raw document numbers. */
export const deliveryAgentVerifications = pgTable(
  'delivery_agent_verifications',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => orqUsers.id, { onDelete: 'cascade' }),
    checkType: kycCheckTypeEnum('check_type').notNull(),
    trigger: kycTriggerEnum('trigger').notNull(),
    status: kycAttemptStatusEnum('status').notNull().default('PENDING'),
    provider: varchar('provider', { length: 30 }).notNull().default('SUREPASS'),
    providerReference: varchar('provider_reference', { length: 120 }),
    providerHttpStatus: integer('provider_http_status'),
    mismatchFields: text('mismatch_fields')
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    responseSummary: jsonb('response_summary').$type<KycResponseSummary>(),
    requestedByUserId: uuid('requested_by_user_id').references(() => orqUsers.id, { onDelete: 'set null' }),
    requestedAt: ts('requested_at').notNull().defaultNow(),
    completedAt: ts('completed_at'),
  },
  (t) => [index('delivery_agent_verifications_user_idx').on(t.userId, t.checkType, t.requestedAt.desc())],
);

// ── Delivery tasks, offers, events & tracking ─────────────────────────────

export const ACTIVE_DELIVERY_TASK_STATUSES = [
  'PENDING_ASSIGNMENT',
  'OFFERED',
  'ACCEPTED',
  'ARRIVING_AT_PICKUP',
  'PICKED_UP',
  'IN_TRANSIT',
] as const;

/** One delivery job for an order. A re-dispatch after failure creates a new task (attempt_no + 1). */
export const deliveryTasks = pgTable(
  'delivery_tasks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    taskNumber: varchar('task_number', { length: 24 }).notNull().unique(),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'restrict' }),
    orqspaceId: uuid('orqspace_id')
      .notNull()
      .references(() => orqspaces.id, { onDelete: 'restrict' }),
    mode: deliveryModeEnum('mode').notNull(),
    assignmentType: assignmentTypeEnum('assignment_type'),
    status: deliveryTaskStatusEnum('status').notNull().default('PENDING_ASSIGNMENT'),
    needsAttention: boolean('needs_attention').notNull().default(false),
    attentionReason: varchar('attention_reason', { length: 160 }),
    agentUserId: uuid('agent_user_id').references(() => deliveryAgents.userId, { onDelete: 'restrict' }),
    connectionId: uuid('connection_id').references(() => orqspaceAgentConnections.id, { onDelete: 'restrict' }),
    ratePerKmSnapshot: numeric('rate_per_km_snapshot', { precision: 10, scale: 2 }),
    selfStaffName: varchar('self_staff_name', { length: 150 }),
    selfStaffPhone: varchar('self_staff_phone', { length: 20 }),
    pickupSnapshot: jsonb('pickup_snapshot').$type<AddressSnapshot>(),
    dropoffSnapshot: jsonb('dropoff_snapshot').$type<AddressSnapshot>().notNull(),
    pickupLat: coord('pickup_lat'),
    pickupLng: coord('pickup_lng'),
    dropoffLat: coord('dropoff_lat'),
    dropoffLng: coord('dropoff_lng'),
    estimatedDistanceKm: km('estimated_distance_km'),
    measuredDistanceKm: km('measured_distance_km'),
    codAmount: numeric('cod_amount', { precision: 12, scale: 2 }).notNull().default('0'),
    deliveryOtpHash: char('delivery_otp_hash', { length: 64 }),
    podType: proofOfDeliveryTypeEnum('pod_type'),
    podPhotoUrl: text('pod_photo_url'),
    podFileId: uuid('pod_file_id').references(() => deliveryFiles.id, { onDelete: 'set null' }),
    podRecipientName: varchar('pod_recipient_name', { length: 150 }),
    acceptedAt: ts('accepted_at'),
    pickedUpAt: ts('picked_up_at'),
    deliveredAt: ts('delivered_at'),
    failedAt: ts('failed_at'),
    cancelledAt: ts('cancelled_at'),
    failureReason: text('failure_reason'),
    cancellationReason: text('cancellation_reason'),
    attemptNo: smallint('attempt_no').notNull().default(1),
    version: integer('version').notNull().default(1),
    createdAt: ts('created_at').notNull().defaultNow(),
    updatedAt: ts('updated_at')
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    uniqueIndex('delivery_tasks_one_active_per_order_uq')
      .on(t.orderId)
      .where(sql`${t.status} NOT IN ('DELIVERED', 'FAILED', 'CANCELLED', 'RETURNED_TO_ORIGIN')`),
    index('delivery_tasks_orqspace_status_idx').on(t.orqspaceId, t.status),
    index('delivery_tasks_agent_status_idx').on(t.agentUserId, t.status),
    index('delivery_tasks_order_idx').on(t.orderId),
  ],
);

/** Every offer of a task to an agent. At most one open offer per task. */
export const deliveryOffers = pgTable(
  'delivery_offers',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    taskId: uuid('task_id')
      .notNull()
      .references(() => deliveryTasks.id, { onDelete: 'cascade' }),
    agentUserId: uuid('agent_user_id')
      .notNull()
      .references(() => deliveryAgents.userId, { onDelete: 'restrict' }),
    connectionId: uuid('connection_id')
      .notNull()
      .references(() => orqspaceAgentConnections.id, { onDelete: 'restrict' }),
    assignmentType: assignmentTypeEnum('assignment_type').notNull(),
    rankScore: numeric('rank_score', { precision: 10, scale: 4 }),
    distanceToPickupKm: km('distance_to_pickup_km'),
    ratePerKmOffered: numeric('rate_per_km_offered', { precision: 10, scale: 2 }).notNull(),
    status: deliveryOfferStatusEnum('status').notNull().default('OFFERED'),
    offeredAt: ts('offered_at')
      .notNull()
      .default(sql`clock_timestamp()`),
    expiresAt: ts('expires_at').notNull(),
    respondedAt: ts('responded_at'),
    declineReason: text('decline_reason'),
  },
  (t) => [
    uniqueIndex('delivery_offers_one_open_per_task_uq')
      .on(t.taskId)
      .where(sql`${t.status} = 'OFFERED'`),
    index('delivery_offers_agent_status_idx').on(t.agentUserId, t.status),
    index('delivery_offers_open_expiry_idx')
      .on(t.expiresAt)
      .where(sql`${t.status} = 'OFFERED'`),
  ],
);

export const deliveryStatusEvents = pgTable(
  'delivery_status_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    taskId: uuid('task_id')
      .notNull()
      .references(() => deliveryTasks.id, { onDelete: 'cascade' }),
    fromStatus: deliveryTaskStatusEnum('from_status'),
    toStatus: deliveryTaskStatusEnum('to_status').notNull(),
    actorUserId: uuid('actor_user_id').references(() => orqUsers.id, { onDelete: 'set null' }),
    actorRole: actorRoleEnum('actor_role').notNull(),
    reason: text('reason'),
    isOverride: boolean('is_override').notNull().default(false),
    lat: coord('lat'),
    lng: coord('lng'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),
    // clock_timestamp(): several transitions can happen in one transaction and must keep their order.
    createdAt: ts('created_at')
      .notNull()
      .default(sql`clock_timestamp()`),
  },
  (t) => [index('delivery_status_events_task_idx').on(t.taskId, t.createdAt)],
);

/** Purpose-limited GPS points. Retention is enforced by a cleanup job. */
export const deliveryLocationPings = pgTable(
  'delivery_location_pings',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    agentUserId: uuid('agent_user_id')
      .notNull()
      .references(() => deliveryAgents.userId, { onDelete: 'cascade' }),
    taskId: uuid('task_id').references(() => deliveryTasks.id, { onDelete: 'set null' }),
    lat: coord('lat').notNull(),
    lng: coord('lng').notNull(),
    accuracyM: real('accuracy_m'),
    speedMps: real('speed_mps'),
    heading: real('heading'),
    recordedAt: ts('recorded_at').notNull(),
    receivedAt: ts('received_at').notNull().defaultNow(),
  },
  (t) => [
    index('delivery_location_pings_agent_idx').on(t.agentUserId, t.recordedAt.desc()),
    index('delivery_location_pings_task_idx').on(t.taskId, t.recordedAt),
    index('delivery_location_pings_received_idx').on(t.receivedAt),
  ],
);

// ── COD & earnings ────────────────────────────────────────────────────────

/** Cash-on-delivery tracking, independent of delivery status. */
export const deliveryCodRecords = pgTable(
  'delivery_cod_records',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    taskId: uuid('task_id')
      .notNull()
      .unique()
      .references(() => deliveryTasks.id, { onDelete: 'restrict' }),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'restrict' }),
    orqspaceId: uuid('orqspace_id')
      .notNull()
      .references(() => orqspaces.id, { onDelete: 'restrict' }),
    agentUserId: uuid('agent_user_id').references(() => deliveryAgents.userId, { onDelete: 'restrict' }),
    expectedAmount: money('expected_amount').notNull(),
    collectedAmount: money('collected_amount'),
    collectionMethod: codCollectionMethodEnum('collection_method'),
    collectionProofUrl: text('collection_proof_url'),
    collectionProofFileId: uuid('collection_proof_file_id').references(() => deliveryFiles.id, { onDelete: 'set null' }),
    collectedAt: ts('collected_at'),
    settledAmount: money('settled_amount').notNull().default('0'),
    status: codStatusEnum('status').notNull().default('PENDING_COLLECTION'),
    discrepancyReason: text('discrepancy_reason'),
    resolvedByUserId: uuid('resolved_by_user_id').references(() => orqUsers.id, { onDelete: 'set null' }),
    resolvedAt: ts('resolved_at'),
    createdAt: ts('created_at').notNull().defaultNow(),
    updatedAt: ts('updated_at')
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    index('delivery_cod_records_orqspace_status_idx').on(t.orqspaceId, t.status),
    index('delivery_cod_records_agent_idx').on(t.agentUserId, t.status),
    check('delivery_cod_records_amounts_chk', sql`${t.expectedAmount} >= 0 AND ${t.settledAmount} >= 0`),
  ],
);

/** Ledger of cash handovers from the agent to the workspace. */
export const deliveryCodSettlements = pgTable(
  'delivery_cod_settlements',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    codRecordId: uuid('cod_record_id')
      .notNull()
      .references(() => deliveryCodRecords.id, { onDelete: 'restrict' }),
    amount: money('amount').notNull(),
    method: codCollectionMethodEnum('method').notNull(),
    recordedByUserId: uuid('recorded_by_user_id').references(() => orqUsers.id, { onDelete: 'set null' }),
    note: text('note'),
    createdAt: ts('created_at').notNull().defaultNow(),
  },
  (t) => [
    index('delivery_cod_settlements_record_idx').on(t.codRecordId),
    check('delivery_cod_settlements_amount_chk', sql`${t.amount} > 0`),
  ],
);

/** One earning per completed agent task. task_id is unique → no duplicate earnings. */
export const deliveryEarnings = pgTable(
  'delivery_earnings',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    taskId: uuid('task_id')
      .notNull()
      .unique()
      .references(() => deliveryTasks.id, { onDelete: 'restrict' }),
    agentUserId: uuid('agent_user_id')
      .notNull()
      .references(() => deliveryAgents.userId, { onDelete: 'restrict' }),
    orqspaceId: uuid('orqspace_id')
      .notNull()
      .references(() => orqspaces.id, { onDelete: 'restrict' }),
    connectionId: uuid('connection_id')
      .notNull()
      .references(() => orqspaceAgentConnections.id, { onDelete: 'restrict' }),
    distanceSource: distanceSourceEnum('distance_source').notNull(),
    measuredDistanceKm: numeric('measured_distance_km', { precision: 8, scale: 2 }),
    approvedBillableKm: numeric('approved_billable_km', { precision: 8, scale: 2 }).notNull(),
    ratePerKm: numeric('rate_per_km', { precision: 10, scale: 2 }).notNull(),
    baseAmount: money('base_amount').notNull(),
    adjustmentTotal: money('adjustment_total').notNull().default('0'),
    finalAmount: money('final_amount').notNull(),
    status: earningStatusEnum('status').notNull().default('PENDING_APPROVAL'),
    periodMonth: date('period_month').notNull(),
    approvedByUserId: uuid('approved_by_user_id').references(() => orqUsers.id, { onDelete: 'set null' }),
    approvedAt: ts('approved_at'),
    paidAt: ts('paid_at'),
    payoutReference: varchar('payout_reference', { length: 120 }),
    finalizedAt: ts('finalized_at'),
    createdAt: ts('created_at').notNull().defaultNow(),
    updatedAt: ts('updated_at')
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    index('delivery_earnings_agent_period_idx').on(t.agentUserId, t.periodMonth),
    index('delivery_earnings_orqspace_period_idx').on(t.orqspaceId, t.periodMonth),
    check('delivery_earnings_final_chk', sql`${t.finalAmount} = ${t.baseAmount} + ${t.adjustmentTotal}`),
    check('delivery_earnings_km_chk', sql`${t.approvedBillableKm} >= 0`),
  ],
);

export const deliveryEarningAdjustments = pgTable(
  'delivery_earning_adjustments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    earningId: uuid('earning_id')
      .notNull()
      .references(() => deliveryEarnings.id, { onDelete: 'restrict' }),
    amount: money('amount').notNull(),
    reason: text('reason').notNull(),
    createdByUserId: uuid('created_by_user_id').references(() => orqUsers.id, { onDelete: 'set null' }),
    createdAt: ts('created_at').notNull().defaultNow(),
  },
  (t) => [index('delivery_earning_adjustments_earning_idx').on(t.earningId)],
);

export type StatementTotals = {
  deliveries: number;
  approvedKm: string;
  baseAmount: string;
  adjustments: string;
  finalAmount: string;
  paidAmount: string;
  codCollected: string;
  codSettled: string;
};

/**
 * Monthly agent ↔ workspace statement (guide: "monthly statements"). Rebuilt as DRAFT during the month;
 * the month-end job freezes it as FINAL once the period closes. One row per agent, workspace and month.
 */
export const deliveryStatements = pgTable(
  'delivery_statements',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    agentUserId: uuid('agent_user_id')
      .notNull()
      .references(() => deliveryAgents.userId, { onDelete: 'restrict' }),
    orqspaceId: uuid('orqspace_id')
      .notNull()
      .references(() => orqspaces.id, { onDelete: 'restrict' }),
    periodMonth: date('period_month').notNull(),
    status: deliveryStatementStatusEnum('status').notNull().default('DRAFT'),
    totals: jsonb('totals').$type<StatementTotals>().notNull(),
    generatedAt: ts('generated_at').notNull().defaultNow(),
    finalizedAt: ts('finalized_at'),
  },
  (t) => [
    uniqueIndex('delivery_statements_period_uq').on(t.agentUserId, t.orqspaceId, t.periodMonth),
    index('delivery_statements_orqspace_idx').on(t.orqspaceId, t.periodMonth),
  ],
);

// ── Audit ─────────────────────────────────────────────────────────────────
/** Audit trail for sensitive changes across the Orders & Delivery modules. */
export const deliveryAuditLogs = pgTable(
  'delivery_audit_logs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    entityType: varchar('entity_type', { length: 60 }).notNull(),
    entityId: varchar('entity_id', { length: 64 }).notNull(),
    action: varchar('action', { length: 80 }).notNull(),
    actorUserId: uuid('actor_user_id').references(() => orqUsers.id, { onDelete: 'set null' }),
    actorRole: actorRoleEnum('actor_role').notNull(),
    reason: text('reason'),
    before: jsonb('before').$type<Record<string, unknown>>(),
    after: jsonb('after').$type<Record<string, unknown>>(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('delivery_audit_logs_entity_idx').on(t.entityType, t.entityId, t.createdAt)],
);
