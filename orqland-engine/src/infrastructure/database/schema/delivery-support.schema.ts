import { sql } from 'drizzle-orm';
import { boolean, index, jsonb, pgEnum, pgTable, primaryKey, text, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
// Existing ORQLAND tables (read-only references — never altered by this module).
import { orqUsers } from './users.schema';
import { deliveryEarnings, deliveryTasks, orqspaceAgentConnections } from './delivery-management.schema';
import { actorRoleEnum } from './orders.schema';

/**
 * Delivery support — tables 20–22 of the approved proposal:
 * delivery_notifications, delivery_support_tickets, delivery_support_messages.
 */

// ── Enums ──────────────────────────────────────────────────────────────────
export const supportTicketCategoryEnum = pgEnum('support_ticket_category', [
  'DELIVERY',
  'EARNINGS_PAYMENT',
  'KYC',
  'WORKSPACE',
  'TECHNICAL',
  'ACCOUNT_SECURITY',
  'EMERGENCY',
]);
export const supportTicketStatusEnum = pgEnum('support_ticket_status', ['OPEN', 'IN_PROGRESS', 'WAITING_ON_AGENT', 'RESOLVED', 'CLOSED']);
export const supportTicketPriorityEnum = pgEnum('support_ticket_priority', ['LOW', 'NORMAL', 'HIGH', 'URGENT']);

export type SupportTicketCategory = (typeof supportTicketCategoryEnum.enumValues)[number];
export type SupportTicketStatus = (typeof supportTicketStatusEnum.enumValues)[number];
export type SupportTicketPriority = (typeof supportTicketPriorityEnum.enumValues)[number];

// ── Tables ─────────────────────────────────────────────────────────────────
const ts = (name: string) => timestamp(name, { withTimezone: true });

/** In-app notification history (read/unread) for agents and workspace admins. */
export const deliveryNotifications = pgTable(
  'delivery_notifications',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => orqUsers.id, { onDelete: 'cascade' }),
    type: varchar('type', { length: 60 }).notNull(),
    title: varchar('title', { length: 200 }).notNull(),
    body: text('body').notNull(),
    data: jsonb('data').$type<Record<string, string>>(),
    readAt: ts('read_at'),
    createdAt: ts('created_at')
      .notNull()
      .default(sql`clock_timestamp()`),
  },
  (t) => [
    index('delivery_notifications_user_idx').on(t.userId, t.createdAt.desc()),
    index('delivery_notifications_unread_idx')
      .on(t.userId)
      .where(sql`${t.readAt} IS NULL`),
  ],
);

/**
 * Proposed addition (SCHEMA_DESIGN.md §11): per-user notification preferences.
 * One row per muted/enabled type and channel; a missing row means "enabled". Safety and
 * account-critical types (offers, cancellations, suspensions, KYC due) cannot be muted.
 */
export const deliveryNotificationPreferences = pgTable(
  'delivery_notification_preferences',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => orqUsers.id, { onDelete: 'cascade' }),
    type: varchar('type', { length: 60 }).notNull(),
    channel: varchar('channel', { length: 20 }).notNull().default('PUSH'),
    enabled: boolean('enabled').notNull().default(true),
    updatedAt: ts('updated_at')
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [primaryKey({ columns: [t.userId, t.type, t.channel] })],
);

/** Support tickets raised from Orqland Run (delivery, earnings disputes, KYC, workspace, technical, safety). */
export const deliverySupportTickets = pgTable(
  'delivery_support_tickets',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ticketNumber: varchar('ticket_number', { length: 24 }).notNull().unique(),
    raisedByUserId: uuid('raised_by_user_id')
      .notNull()
      .references(() => orqUsers.id, { onDelete: 'restrict' }),
    category: supportTicketCategoryEnum('category').notNull(),
    subject: varchar('subject', { length: 160 }).notNull(),
    description: text('description').notNull(),
    priority: supportTicketPriorityEnum('priority').notNull().default('NORMAL'),
    status: supportTicketStatusEnum('status').notNull().default('OPEN'),
    assignedTeam: varchar('assigned_team', { length: 60 }),
    assignedToUserId: uuid('assigned_to_user_id').references(() => orqUsers.id, { onDelete: 'set null' }),
    relatedTaskId: uuid('related_task_id').references(() => deliveryTasks.id, { onDelete: 'set null' }),
    relatedEarningId: uuid('related_earning_id').references(() => deliveryEarnings.id, { onDelete: 'set null' }),
    relatedConnectionId: uuid('related_connection_id').references(() => orqspaceAgentConnections.id, { onDelete: 'set null' }),
    relatedPeriodMonth: varchar('related_period_month', { length: 7 }),
    resolvedAt: ts('resolved_at'),
    createdAt: ts('created_at').notNull().defaultNow(),
    updatedAt: ts('updated_at')
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    index('delivery_support_tickets_user_idx').on(t.raisedByUserId, t.createdAt.desc()),
    index('delivery_support_tickets_queue_idx').on(t.status, t.priority, t.createdAt),
  ],
);

export const deliverySupportMessages = pgTable(
  'delivery_support_messages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ticketId: uuid('ticket_id')
      .notNull()
      .references(() => deliverySupportTickets.id, { onDelete: 'cascade' }),
    authorUserId: uuid('author_user_id').references(() => orqUsers.id, { onDelete: 'set null' }),
    authorRole: actorRoleEnum('author_role').notNull(),
    body: text('body').notNull(),
    /** URLs from your existing file-upload flow (GCP storage). */
    attachmentUrls: text('attachment_urls')
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    /** delivery_files ids uploaded through the engine (preferred over raw URLs). */
    attachmentFileIds: uuid('attachment_file_ids')
      .array()
      .notNull()
      .default(sql`'{}'::uuid[]`),
    isInternal: boolean('is_internal').notNull().default(false),
    createdAt: ts('created_at')
      .notNull()
      .default(sql`clock_timestamp()`),
  },
  (t) => [index('delivery_support_messages_ticket_idx').on(t.ticketId, t.createdAt)],
);
