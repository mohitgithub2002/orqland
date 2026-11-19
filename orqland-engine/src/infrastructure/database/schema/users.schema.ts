// [HOST SHIM] Exists in the main codebase — do not copy.
// Reproduces only the key fields listed in the reference guide.
import { boolean, numeric, pgTable, text, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import { accountStatusEnum, addressTypeEnum, userRoleEnum } from './enums';

export const orqUsers = pgTable('orq_users', {
  id: uuid('id').primaryKey().defaultRandom(),
  firebaseUid: varchar('firebase_uid', { length: 128 }).notNull().unique(),
  orqUserId: varchar('orq_user_id', { length: 14 }).notNull().unique(),
  orqUsername: varchar('orq_username', { length: 30 }).unique(),
  fname: varchar('fname', { length: 100 }),
  lname: varchar('lname', { length: 100 }),
  displayName: varchar('display_name', { length: 150 }),
  email: varchar('email', { length: 255 }).unique(),
  phone: varchar('phone', { length: 20 }).unique(),
  avatar: text('avatar'),
  bio: text('bio'),
  roles: userRoleEnum('roles').array().notNull().default(['WEB_USER']),
  accountStatus: accountStatusEnum('account_status').notNull().default('ACTIVE'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const orqUserAddresses = pgTable('orq_user_addresses', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => orqUsers.id, { onDelete: 'cascade' }),
  recipientName: varchar('recipient_name', { length: 150 }),
  recipientPhone: varchar('recipient_phone', { length: 20 }),
  doorNo: varchar('door_no', { length: 50 }),
  street: varchar('street', { length: 255 }),
  landmark: varchar('landmark', { length: 255 }),
  city: varchar('city', { length: 100 }),
  district: varchar('district', { length: 100 }),
  state: varchar('state', { length: 100 }),
  country: varchar('country', { length: 100 }),
  pincode: varchar('pincode', { length: 12 }),
  latitude: numeric('latitude', { precision: 9, scale: 6 }),
  longitude: numeric('longitude', { precision: 9, scale: 6 }),
  isPrimary: boolean('is_primary').notNull().default(false),
  addressType: addressTypeEnum('address_type').notNull().default('HOME'),
});
