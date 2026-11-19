// [HOST SHIM] Exists in the main codebase — do not copy.
import { pgTable, primaryKey, text, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import { orqspaces } from './orqspaces.schema';
import { orqUsers } from './users.schema';

export const deliveryAgents = pgTable('delivery_agents', {
  userId: uuid('user_id').primaryKey().references(() => orqUsers.id),
  vehicleNumber: varchar('vehicle_number', { length: 20 }),
  drivingLicenseImageUrl: text('driving_license_image_url'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const deliveryAgentAssignments = pgTable(
  'delivery_agent_assignments',
  {
    deliveryAgentUserId: uuid('delivery_agent_user_id').notNull().references(() => deliveryAgents.userId),
    orqspaceId: uuid('orqspace_id').notNull().references(() => orqspaces.id),
    assignedAt: timestamp('assigned_at', { withTimezone: true }).notNull().defaultNow(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
  },
  (t) => [primaryKey({ columns: [t.deliveryAgentUserId, t.orqspaceId] })],
);
