// [HOST SHIM] Exists in the main codebase — do not copy.
// Only the existing enums the new modules reference are reproduced here.
import { pgEnum } from 'drizzle-orm/pg-core';

export const userRoleEnum = pgEnum('user_role', ['WEB_USER', 'DELIVERY_AGENT', 'ORG_ADMIN', 'PLATFORM_ADMIN']);
export const accountStatusEnum = pgEnum('account_status', ['ACTIVE', 'SUSPENDED', 'DELETED', 'BLOCKED', 'PENDING_VERIFICATION']);
export const addressTypeEnum = pgEnum('address_type', ['HOME', 'WORK', 'OTHER']);
export const orqspaceTypeEnum = pgEnum('orqspace_type', ['AIR', 'STREET']);
export const listingTypeEnum = pgEnum('listing_type', ['PRODUCT', 'SERVICE', 'RENTAL', 'STAY', 'EXPERIENCE']);
export const inventoryModeEnum = pgEnum('inventory_mode', ['LIMITED', 'NO_LIMIT', 'TIME_BASED']);
export const variantStatusEnum = pgEnum('variant_status', ['ACTIVE', 'PAUSED', 'EXPIRED', 'DRAFT']);
