import { sql } from 'drizzle-orm';
import {
  char,
  check,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
// Existing ORQLAND tables (read-only references — never altered by this module).
import { orqListings, orqListingVariants } from './listings.schema';
import { orqspaces } from './orqspaces.schema';
import { orqUserAddresses, orqUsers } from './users.schema';

/**
 * Order Management — tables 1–5 of the approved proposal:
 * orders, order_items, order_status_history, order_inventory_reservations, order_payments.
 */

// ── Enums ──────────────────────────────────────────────────────────────────
export const actorRoleEnum = pgEnum('actor_role', ['CUSTOMER', 'WORKSPACE', 'AGENT', 'PLATFORM_ADMIN', 'SYSTEM']);

export const orderStatusEnum = pgEnum('order_status', [
  'PLACED',
  'ACCEPTED',
  'REJECTED',
  'PREPARING',
  'READY_FOR_FULFILMENT',
  'AWAITING_CUSTOMER_PICKUP',
  'OUT_FOR_DELIVERY',
  'DELIVERY_FAILED',
  'DELIVERED',
  'PICKED_UP',
  'CANCELLED',
  'RETURN_REQUESTED',
  'RETURNED',
]);

export const orderPaymentMethodEnum = pgEnum('order_payment_method', ['ONLINE', 'COD']);

export const orderPaymentStatusEnum = pgEnum('order_payment_status', [
  'PENDING',
  'PAID',
  'FAILED',
  'REFUND_PENDING',
  'PARTIALLY_REFUNDED',
  'REFUNDED',
]);

export const orderRequestedFulfilmentEnum = pgEnum('order_requested_fulfilment', ['DELIVERY', 'PICKUP']);

export const orderFulfilmentMethodEnum = pgEnum('order_fulfilment_method', ['SELF_DELIVERY', 'AGENT_DELIVERY', 'PICKUP']);

export const inventoryReservationStatusEnum = pgEnum('inventory_reservation_status', [
  'RESERVED',
  'COMMITTED',
  'RELEASED',
  'RESTORED',
]);

export const orderPaymentKindEnum = pgEnum('order_payment_kind', ['PAYMENT', 'REFUND']);

export const orderPaymentRecordStatusEnum = pgEnum('order_payment_record_status', [
  'INITIATED',
  'SUCCEEDED',
  'FAILED',
  'CANCELLED',
]);

export type ActorRole = (typeof actorRoleEnum.enumValues)[number];
export type OrderStatus = (typeof orderStatusEnum.enumValues)[number];
export type OrderPaymentMethod = (typeof orderPaymentMethodEnum.enumValues)[number];
export type OrderPaymentStatus = (typeof orderPaymentStatusEnum.enumValues)[number];
export type OrderRequestedFulfilment = (typeof orderRequestedFulfilmentEnum.enumValues)[number];
export type OrderFulfilmentMethod = (typeof orderFulfilmentMethodEnum.enumValues)[number];
export type InventoryReservationStatus = (typeof inventoryReservationStatusEnum.enumValues)[number];
export type OrderPaymentKind = (typeof orderPaymentKindEnum.enumValues)[number];
export type OrderPaymentRecordStatus = (typeof orderPaymentRecordStatusEnum.enumValues)[number];

// ── Tables ─────────────────────────────────────────────────────────────────
const money = (name: string) => numeric(name, { precision: 12, scale: 2 });
const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();
const updatedAt = () =>
  timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());

export type BuyerSnapshot = { name: string; phone: string | null; email: string | null; orqUserId: string };

export type AddressSnapshot = {
  recipientName: string | null;
  recipientPhone: string | null;
  doorNo: string | null;
  street: string | null;
  landmark: string | null;
  city: string | null;
  district: string | null;
  state: string | null;
  country: string | null;
  pincode: string | null;
  latitude: number | null;
  longitude: number | null;
};

export type CancelRequestStatus = 'REQUESTED' | 'APPROVED' | 'DECLINED';

export const orders = pgTable(
  'orders',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orderNumber: varchar('order_number', { length: 24 }).notNull().unique(),
    checkoutId: uuid('checkout_id').notNull(),
    customerId: uuid('customer_id')
      .notNull()
      .references(() => orqUsers.id, { onDelete: 'restrict' }),
    orqspaceId: uuid('orqspace_id')
      .notNull()
      .references(() => orqspaces.id, { onDelete: 'restrict' }),
    orderStatus: orderStatusEnum('order_status').notNull().default('PLACED'),
    paymentMethod: orderPaymentMethodEnum('payment_method').notNull(),
    paymentStatus: orderPaymentStatusEnum('payment_status').notNull().default('PENDING'),
    requestedFulfilment: orderRequestedFulfilmentEnum('requested_fulfilment').notNull(),
    fulfilmentMethod: orderFulfilmentMethodEnum('fulfilment_method'),
    currency: char('currency', { length: 3 }).notNull().default('INR'),
    subtotalBase: money('subtotal_base').notNull(),
    totalGst: money('total_gst').notNull(),
    deliveryFee: money('delivery_fee').notNull().default('0'),
    discountTotal: money('discount_total').notNull().default('0'),
    totalAmount: money('total_amount').notNull(),
    buyerSnapshot: jsonb('buyer_snapshot').$type<BuyerSnapshot>().notNull(),
    deliveryAddressSnapshot: jsonb('delivery_address_snapshot').$type<AddressSnapshot>(),
    sourceAddressId: uuid('source_address_id').references(() => orqUserAddresses.id, { onDelete: 'set null' }),
    customerNote: text('customer_note'),
    /** Customer-requested delivery / pickup time ("Delivery scheduled", "Pickup scheduled"); null = as soon as possible. */
    scheduledFor: timestamp('scheduled_for', { withTimezone: true }),
    /** Preparation timer set by the workspace when preparation starts (minutes) and its deadline (+2 min extensions move it). */
    preparationMinutes: smallint('preparation_minutes'),
    preparationDueAt: timestamp('preparation_due_at', { withTimezone: true }),
    /** Customer cancellation request after acceptance: REQUESTED → APPROVED (order cancelled) | DECLINED. */
    cancelRequestStatus: varchar('cancel_request_status', { length: 12 }).$type<CancelRequestStatus>(),
    cancelRequestedAt: timestamp('cancel_requested_at', { withTimezone: true }),
    cancelRequestReason: text('cancel_request_reason'),
    cancelRequestResolution: text('cancel_request_resolution'),
    /** Pickup date agreed for a requested return. */
    returnPickupDate: date('return_pickup_date'),
    idempotencyKey: varchar('idempotency_key', { length: 64 }).notNull(),
    rejectionReason: text('rejection_reason'),
    cancellationReason: text('cancellation_reason'),
    cancelledByRole: actorRoleEnum('cancelled_by_role'),
    acceptedAt: timestamp('accepted_at', { withTimezone: true }),
    preparingAt: timestamp('preparing_at', { withTimezone: true }),
    readyAt: timestamp('ready_at', { withTimezone: true }),
    dispatchedAt: timestamp('dispatched_at', { withTimezone: true }),
    deliveredAt: timestamp('delivered_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
    version: integer('version').notNull().default(1),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex('orders_customer_idempotency_uq').on(t.customerId, t.idempotencyKey, t.orqspaceId),
    index('orders_orqspace_status_created_idx').on(t.orqspaceId, t.orderStatus, t.createdAt.desc()),
    index('orders_customer_created_idx').on(t.customerId, t.createdAt.desc()),
    index('orders_checkout_idx').on(t.checkoutId),
    check(
      'orders_total_consistency_chk',
      sql`${t.totalAmount} = ${t.subtotalBase} + ${t.totalGst} + ${t.deliveryFee} - ${t.discountTotal}`,
    ),
    check('orders_cancel_request_status_chk', sql`${t.cancelRequestStatus} IS NULL OR ${t.cancelRequestStatus} IN ('REQUESTED', 'APPROVED', 'DECLINED')`),
    check('orders_preparation_minutes_chk', sql`${t.preparationMinutes} IS NULL OR ${t.preparationMinutes} BETWEEN 1 AND 480`),
    check('orders_amounts_non_negative_chk', sql`${t.totalAmount} >= 0 AND ${t.deliveryFee} >= 0`),
    check(
      'orders_delivery_address_chk',
      sql`${t.requestedFulfilment} = 'PICKUP' OR ${t.deliveryAddressSnapshot} IS NOT NULL`,
    ),
  ],
);

export const orderItems = pgTable(
  'order_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    listingId: uuid('listing_id').references(() => orqListings.id, { onDelete: 'set null' }),
    variantId: uuid('variant_id').references(() => orqListingVariants.id, { onDelete: 'set null' }),
    listingType: varchar('listing_type', { length: 20 }).notNull(),
    title: varchar('title', { length: 255 }).notNull(),
    variantLabel: varchar('variant_label', { length: 255 }),
    sku: varchar('sku', { length: 100 }),
    imageUrl: text('image_url'),
    inventoryMode: varchar('inventory_mode', { length: 20 }).notNull(),
    quantity: integer('quantity').notNull(),
    unitBasePrice: money('unit_base_price').notNull(),
    gstPercentage: numeric('gst_percentage', { precision: 5, scale: 2 }).notNull(),
    unitGst: money('unit_gst').notNull(),
    unitTotalPrice: money('unit_total_price').notNull(),
    lineTotal: money('line_total').notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    index('order_items_order_idx').on(t.orderId),
    index('order_items_variant_idx').on(t.variantId),
    check('order_items_quantity_chk', sql`${t.quantity} > 0`),
    check('order_items_line_total_chk', sql`${t.lineTotal} = ${t.unitTotalPrice} * ${t.quantity}`),
  ],
);

export const orderStatusHistory = pgTable(
  'order_status_history',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    fromStatus: orderStatusEnum('from_status'),
    toStatus: orderStatusEnum('to_status').notNull(),
    actorUserId: uuid('actor_user_id').references(() => orqUsers.id, { onDelete: 'set null' }),
    actorRole: actorRoleEnum('actor_role').notNull(),
    reason: text('reason'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),
    // clock_timestamp(): several transitions can happen in one transaction and must keep their order.
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .default(sql`clock_timestamp()`),
  },
  (t) => [index('order_status_history_order_idx').on(t.orderId, t.createdAt)],
);

export const orderInventoryReservations = pgTable(
  'order_inventory_reservations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    orderItemId: uuid('order_item_id')
      .notNull()
      .unique()
      .references(() => orderItems.id, { onDelete: 'cascade' }),
    variantId: uuid('variant_id')
      .notNull()
      .references(() => orqListingVariants.id, { onDelete: 'restrict' }),
    quantity: integer('quantity').notNull(),
    status: inventoryReservationStatusEnum('status').notNull().default('RESERVED'),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    committedAt: timestamp('committed_at', { withTimezone: true }),
    releasedAt: timestamp('released_at', { withTimezone: true }),
    restoredAt: timestamp('restored_at', { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('order_inventory_reservations_order_idx').on(t.orderId),
    index('order_inventory_reservations_expiry_idx')
      .on(t.expiresAt)
      .where(sql`${t.status} = 'RESERVED'`),
    check('order_inventory_reservations_quantity_chk', sql`${t.quantity} > 0`),
  ],
);

export const orderPayments = pgTable(
  'order_payments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    kind: orderPaymentKindEnum('kind').notNull(),
    method: orderPaymentMethodEnum('method').notNull(),
    status: orderPaymentRecordStatusEnum('status').notNull().default('INITIATED'),
    amount: money('amount').notNull(),
    provider: varchar('provider', { length: 40 }),
    providerReference: varchar('provider_reference', { length: 120 }),
    failureReason: text('failure_reason'),
    recordedByUserId: uuid('recorded_by_user_id').references(() => orqUsers.id, { onDelete: 'set null' }),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('order_payments_order_idx').on(t.orderId),
    uniqueIndex('order_payments_provider_ref_uq')
      .on(t.provider, t.providerReference)
      .where(sql`${t.providerReference} IS NOT NULL`),
    check('order_payments_amount_chk', sql`${t.amount} > 0`),
  ],
);
