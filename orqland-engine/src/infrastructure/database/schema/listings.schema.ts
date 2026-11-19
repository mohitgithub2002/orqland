// [HOST SHIM] Exists in the main codebase — do not copy.
import { boolean, integer, jsonb, numeric, pgTable, text, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import { inventoryModeEnum, listingTypeEnum, variantStatusEnum } from './enums';
import { orqspaces } from './orqspaces.schema';
import { orqUsers } from './users.schema';

export const orqListings = pgTable('orq_listings', {
  id: uuid('id').primaryKey().defaultRandom(),
  ownerId: uuid('owner_id').notNull().references(() => orqUsers.id),
  orqspaceId: uuid('orqspace_id').notNull().references(() => orqspaces.id),
  listingType: listingTypeEnum('listing_type').notNull(),
  title: varchar('title', { length: 255 }).notNull(),
  description: text('description'),
  images: text('images').array().notNull().default([]),
  basePrice: numeric('base_price', { precision: 12, scale: 2 }).notNull(),
  gstPercentage: numeric('gst_percentage', { precision: 5, scale: 2 }).notNull().default('0'),
  totalPrice: numeric('total_price', { precision: 12, scale: 2 }).notNull(),
  hasVariants: boolean('has_variants').notNull().default(false),
  metadata: jsonb('metadata'),
  status: varchar('status', { length: 30 }).notNull().default('PUBLISHED'),
  isPublic: boolean('is_public').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const orqListingVariants = pgTable('orq_listing_variants', {
  id: uuid('id').primaryKey().defaultRandom(),
  listingId: uuid('listing_id').notNull().references(() => orqListings.id, { onDelete: 'cascade' }),
  type: varchar('type', { length: 100 }),
  sku: varchar('sku', { length: 100 }),
  cost: numeric('cost', { precision: 12, scale: 2 }),
  basePrice: numeric('base_price', { precision: 12, scale: 2 }).notNull(),
  gstPercentage: numeric('gst_percentage', { precision: 5, scale: 2 }).notNull().default('0'),
  totalPrice: numeric('total_price', { precision: 12, scale: 2 }).notNull(),
  inventoryMode: inventoryModeEnum('inventory_mode').notNull().default('NO_LIMIT'),
  totalCapacity: integer('total_capacity'),
  remainingQuantity: integer('remaining_quantity'),
  variantStatus: variantStatusEnum('variant_status').notNull().default('ACTIVE'),
});
