import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, eq, inArray } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import type { AuthUser } from '@/core/decorators/current-user.decorator';
import { DRIZZLE, type DrizzleDB } from '@/infrastructure/database/drizzle.module';
import {
  orderItems,
  orders,
  orderStatusHistory,
  orqListings,
  orqListingVariants,
  orqUserAddresses,
  orqUsers,
  type AddressSnapshot,
} from '@/infrastructure/database/schema';
import { generateOrderNumber } from '@/core/utils/public-codes';
import { isUniqueViolation } from '@/core/utils/db-executor';
import { fromPaise, toPaise } from '@/core/utils/money';
import { ordersConfig } from '@/config/orders.config';
import { ORDERABLE_LISTING_STATUSES, ORDERABLE_LISTING_TYPES } from '../../helpers/orderable';
import type { PlaceOrderInput } from '../../dto/inputs/place-order.input';
import { OrderInventoryService, type ReservationRequest } from './order-inventory.service';
import type { OrderRow } from './order-lifecycle.service';

interface PricedLine {
  orqspaceId: string;
  listingId: string;
  variantId: string;
  listingType: string;
  title: string;
  variantLabel: string | null;
  sku: string | null;
  imageUrl: string | null;
  inventoryMode: string;
  quantity: number;
  unitBase: number;
  gstPercentage: string;
  unitGst: number;
  unitTotal: number;
}

export interface PlaceOrderResult {
  checkoutId: string;
  orders: OrderRow[];
  replayed: boolean;
}

/**
 * Creates one order per orqspace for a checkout, with immutable price/item/address snapshots
 * and atomic stock reservation — all in one transaction.
 */
@Injectable()
export class OrderPlacementService {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    private readonly inventory: OrderInventoryService,
  ) {}

  async placeOrder(user: AuthUser, input: PlaceOrderInput): Promise<PlaceOrderResult> {
    const existing = await this.findByIdempotencyKey(user.id, input.idempotencyKey);
    if (existing.length) return { checkoutId: existing[0].checkoutId, orders: existing, replayed: true };

    if (input.requestedFulfilment === 'DELIVERY' && !input.addressId) {
      throw new BadRequestException('A delivery address is required');
    }
    const scheduledFor = input.scheduledFor ? new Date(input.scheduledFor) : null;
    if (scheduledFor) {
      const minutesAhead = (scheduledFor.getTime() - Date.now()) / 60_000;
      if (minutesAhead < 30) throw new BadRequestException('Choose a time at least 30 minutes from now, or order for as soon as possible');
      if (minutesAhead > ordersConfig.maxScheduleDays * 24 * 60) throw new BadRequestException(`Orders can be scheduled up to ${ordersConfig.maxScheduleDays} days ahead`);
    }

    const [buyer] = await this.db.select().from(orqUsers).where(eq(orqUsers.id, user.id));
    if (!buyer) throw new NotFoundException('User not found');
    const address = input.requestedFulfilment === 'DELIVERY' ? await this.loadAddress(user.id, input.addressId!) : null;
    const lines = await this.priceLines(user.id, input);

    const byOrqspace = new Map<string, PricedLine[]>();
    for (const line of lines) byOrqspace.set(line.orqspaceId, [...(byOrqspace.get(line.orqspaceId) ?? []), line]);

    const checkoutId = randomUUID();
    // ONLINE orders hold stock only until the payment window closes (OrderPaymentHoldJob cancels them).
    const holdExpiresAt =
      input.paymentMethod === 'ONLINE' ? new Date(Date.now() + ordersConfig.paymentHoldMinutes * 60_000) : null;
    const buyerName = buyer.displayName ?? [buyer.fname, buyer.lname].filter(Boolean).join(' ') ?? buyer.orqUserId;

    try {
      const created = await this.db.transaction(async (tx) => {
        const result: OrderRow[] = [];
        for (const [orqspaceId, group] of byOrqspace) {
          const subtotal = group.reduce((sum, l) => sum + l.unitBase * l.quantity, 0);
          const gst = group.reduce((sum, l) => sum + l.unitGst * l.quantity, 0);
          const deliveryFee = 0; // Delivery-fee policy is a pending business decision (SCHEMA_DESIGN.md Q-10).

          const [order] = await tx
            .insert(orders)
            .values({
              orderNumber: generateOrderNumber(),
              checkoutId,
              customerId: user.id,
              orqspaceId,
              paymentMethod: input.paymentMethod,
              requestedFulfilment: input.requestedFulfilment,
              subtotalBase: fromPaise(subtotal),
              totalGst: fromPaise(gst),
              deliveryFee: fromPaise(deliveryFee),
              discountTotal: '0.00',
              totalAmount: fromPaise(subtotal + gst + deliveryFee),
              buyerSnapshot: {
                name: buyerName || buyer.orqUserId,
                phone: buyer.phone,
                email: buyer.email,
                orqUserId: buyer.orqUserId,
              },
              deliveryAddressSnapshot: address?.snapshot ?? null,
              sourceAddressId: address?.id ?? null,
              customerNote: input.customerNote ?? null,
              scheduledFor,
              idempotencyKey: input.idempotencyKey,
            })
            .returning();

          const insertedItems = await tx
            .insert(orderItems)
            .values(
              group.map((l) => ({
                orderId: order.id,
                listingId: l.listingId,
                variantId: l.variantId,
                listingType: l.listingType,
                title: l.title,
                variantLabel: l.variantLabel,
                sku: l.sku,
                imageUrl: l.imageUrl,
                inventoryMode: l.inventoryMode,
                quantity: l.quantity,
                unitBasePrice: fromPaise(l.unitBase),
                gstPercentage: l.gstPercentage,
                unitGst: fromPaise(l.unitGst),
                unitTotalPrice: fromPaise(l.unitTotal),
                lineTotal: fromPaise(l.unitTotal * l.quantity),
              })),
            )
            .returning({ id: orderItems.id });

          const reservations: ReservationRequest[] = group
            .map((l, i) => ({ line: l, orderItemId: insertedItems[i].id }))
            .filter(({ line }) => line.inventoryMode === 'LIMITED')
            .map(({ line, orderItemId }) => ({
              orderItemId,
              variantId: line.variantId,
              quantity: line.quantity,
              title: line.title,
            }));
          await this.inventory.reserve(tx, order.id, reservations, holdExpiresAt);

          await tx.insert(orderStatusHistory).values({
            orderId: order.id,
            fromStatus: null,
            toStatus: 'PLACED',
            actorUserId: user.id,
            actorRole: 'CUSTOMER',
          });
          result.push(order);
        }
        return result;
      });
      return { checkoutId, orders: created, replayed: false };
    } catch (error) {
      // A concurrent retry with the same key won the race — return its orders.
      if (isUniqueViolation(error, 'orders_customer_idempotency_uq')) {
        const replay = await this.findByIdempotencyKey(user.id, input.idempotencyKey);
        return { checkoutId: replay[0].checkoutId, orders: replay, replayed: true };
      }
      throw error;
    }
  }

  private findByIdempotencyKey(customerId: string, key: string) {
    return this.db
      .select()
      .from(orders)
      .where(and(eq(orders.customerId, customerId), eq(orders.idempotencyKey, key)));
  }

  private async loadAddress(userId: string, addressId: string): Promise<{ id: string; snapshot: AddressSnapshot }> {
    const [address] = await this.db
      .select()
      .from(orqUserAddresses)
      .where(and(eq(orqUserAddresses.id, addressId), eq(orqUserAddresses.userId, userId)));
    if (!address) throw new NotFoundException('Address not found');
    return {
      id: address.id,
      snapshot: {
        recipientName: address.recipientName,
        recipientPhone: address.recipientPhone,
        doorNo: address.doorNo,
        street: address.street,
        landmark: address.landmark,
        city: address.city,
        district: address.district,
        state: address.state,
        country: address.country,
        pincode: address.pincode,
        latitude: address.latitude === null ? null : Number(address.latitude),
        longitude: address.longitude === null ? null : Number(address.longitude),
      },
    };
  }

  /**
   * Prices every line from its variant. Every product listing — including single products with
   * has_variants = false — has at least one orq_listing_variants row (the engine creates a default one),
   * so order_items.variant_id is always set and stock reservation works the same for both (review §2.1, Q-13).
   */
  private async priceLines(customerId: string, input: PlaceOrderInput): Promise<PricedLine[]> {
    const listingIds = [...new Set(input.items.map((i) => i.listingId))];
    const listings = await this.db.select().from(orqListings).where(inArray(orqListings.id, listingIds));
    const variants = await this.db.select().from(orqListingVariants).where(inArray(orqListingVariants.listingId, listingIds));
    const listingById = new Map(listings.map((l) => [l.id, l]));
    const variantsByListing = new Map<string, (typeof variants)[number][]>();
    for (const v of variants) variantsByListing.set(v.listingId, [...(variantsByListing.get(v.listingId) ?? []), v]);

    const seen = new Set<string>();
    return input.items.map((item) => {
      const listing = listingById.get(item.listingId);
      if (!listing || !listing.isPublic || !ORDERABLE_LISTING_STATUSES.includes(listing.status)) {
        throw new BadRequestException(`Listing ${item.listingId} is not available`);
      }
      if (!(ORDERABLE_LISTING_TYPES as readonly string[]).includes(listing.listingType)) {
        throw new BadRequestException(`${listing.listingType} listings are booked, not ordered for delivery`);
      }
      if (listing.ownerId === customerId) throw new BadRequestException('You cannot order your own listing');

      const variant = this.resolveVariant(listing, variantsByListing.get(listing.id) ?? [], item.variantId);
      const key = `${listing.id}:${variant.id}`;
      if (seen.has(key)) throw new BadRequestException('Each listing/variant may appear only once per checkout');
      seen.add(key);

      if (variant.variantStatus !== 'ACTIVE') throw new BadRequestException(`"${listing.title}" is currently unavailable`);
      if (variant.inventoryMode === 'TIME_BASED') {
        throw new BadRequestException(`"${listing.title}" is booked by time slot, not ordered`);
      }
      const unitBase = toPaise(variant.basePrice);
      const unitTotal = toPaise(variant.totalPrice);
      return {
        orqspaceId: listing.orqspaceId,
        listingId: listing.id,
        listingType: listing.listingType,
        title: listing.title,
        imageUrl: listing.images?.[0] ?? null,
        quantity: item.quantity,
        variantId: variant.id,
        variantLabel: listing.hasVariants ? variant.type : null,
        sku: variant.sku,
        inventoryMode: variant.inventoryMode,
        unitBase,
        gstPercentage: variant.gstPercentage,
        unitGst: Math.max(unitTotal - unitBase, 0),
        unitTotal: Math.max(unitTotal, unitBase),
      };
    });
  }

  /** Multi-variant listings need an explicit choice; single products use their default variant. */
  private resolveVariant<V extends { id: string; variantStatus: string }>(
    listing: { title: string; hasVariants: boolean },
    variants: V[],
    variantId: string | undefined,
  ): V {
    if (variantId) {
      const chosen = variants.find((v) => v.id === variantId);
      if (!chosen) throw new BadRequestException(`Choose a valid option for "${listing.title}"`);
      return chosen;
    }
    if (listing.hasVariants) throw new BadRequestException(`Choose an option for "${listing.title}"`);
    const fallback = variants.find((v) => v.variantStatus === 'ACTIVE') ?? variants[0];
    if (!fallback) throw new BadRequestException(`"${listing.title}" has no inventory record and cannot be ordered`);
    return fallback;
  }
}
