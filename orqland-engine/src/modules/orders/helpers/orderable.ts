/**
 * Listing rules for the first Order & Delivery release (SCHEMA_DESIGN.md Q-2, Q-13).
 * Adjust ORDERABLE_LISTING_STATUSES to the status values your listings module uses for published listings.
 */
export const ORDERABLE_LISTING_TYPES = ['PRODUCT'] as const;
export const ORDERABLE_LISTING_STATUSES = ['PUBLISHED', 'ACTIVE', 'APPROVED'];
export const MAX_ITEMS_PER_CHECKOUT = 50;
export const MAX_QUANTITY_PER_LINE = 100;
