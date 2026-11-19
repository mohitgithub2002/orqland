// [HOST SHIM] Exists in the main codebase — do not copy.
import { boolean, pgTable, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import { orqspaceTypeEnum } from './enums';
import { orqUsers } from './users.schema';

export const orqspaces = pgTable('orqspaces', {
  id: uuid('id').primaryKey().defaultRandom(),
  orqspaceId: varchar('orqspace_id', { length: 32 }).notNull().unique(),
  ownerId: uuid('owner_id').notNull().references(() => orqUsers.id),
  name: varchar('name', { length: 150 }).notNull(),
  type: orqspaceTypeEnum('type').notNull(),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
