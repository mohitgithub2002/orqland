import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, count, desc, eq, ilike, inArray, or, sql, type SQL } from 'drizzle-orm';
import type { AuthUser } from '@/core/decorators/current-user.decorator';
import { DRIZZLE, type DrizzleDB } from '@/infrastructure/database/drizzle.module';
import {
  orderItems,
  orderPayments,
  orders,
  orderStatusHistory,
  orqListingVariants,
  orqspaces,
  orqUserAddresses,
  orqUsers,
  type ActorRole,
} from '@/infrastructure/database/schema';
import type { MyOrdersFilterInput, OrqspaceOrdersFilterInput } from '../dto/inputs/orqspace-orders-filter.input';
import type {
  CheckoutAddressType,
  OrderItemType,
  OrderPageType,
  OrderPaymentType,
  OrderStatusCountType,
  OrderStatusHistoryType,
  OrderSummaryType,
  OrderType,
} from '../dto/types/order.type';
import { fromPaise, toPaise } from '@/core/utils/money';
import { ordersConfig } from '@/config/orders.config';
import { ORDER_QUEUES, queueCondition, type OrderQueue } from '../helpers/order-queues';
import { allowedNextStatuses } from '../helpers/order-state-machine';
import type { OrderRow } from './lifecycle/order-lifecycle.service';
import { OrqspaceAccessService } from './shared/orqspace-access.service';

@Injectable()
export class OrdersQueryService {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    private readonly access: OrqspaceAccessService,
  ) {}

  async listForOrqspace(user: AuthUser, filter: OrqspaceOrdersFilterInput): Promise<OrderPageType> {
    const actor = await this.access.assertCanManage(user, filter.orqspaceId);
    const conditions: SQL[] = [eq(orders.orqspaceId, filter.orqspaceId)];
    if (filter.statuses?.length) conditions.push(inArray(orders.orderStatus, filter.statuses));
    const queueSql = filter.queue ? queueCondition(filter.queue) : undefined;
    if (queueSql) conditions.push(queueSql);
    if (filter.paymentMethod) conditions.push(eq(orders.paymentMethod, filter.paymentMethod));
    if (filter.search?.trim()) {
      const term = `%${filter.search.trim()}%`;
      conditions.push(
        or(
          ilike(orders.orderNumber, term),
          sql`${orders.buyerSnapshot}->>'name' ILIKE ${term}`,
          sql`${orders.buyerSnapshot}->>'phone' ILIKE ${term}`,
        )!,
      );
    }
    const where = and(...conditions);

    const [{ total }] = await this.db.select({ total: count() }).from(orders).where(where);
    const rows = await this.db
      .select()
      .from(orders)
      .where(where)
      .orderBy(...queueOrder(filter.queue))
      .limit(filter.pageSize)
      .offset((filter.page - 1) * filter.pageSize);

    return {
      items: await this.toOrderTypes(rows, actor.role),
      total,
      page: filter.page,
      pageSize: filter.pageSize,
    };
  }

  /** Top-of-page cards (this month vs last month) and the count on every tab. */
  async summary(user: AuthUser, orqspaceId: string): Promise<OrderSummaryType> {
    await this.access.assertCanManage(user, orqspaceId);
    const tz = 'Asia/Kolkata';
    const monthStart = sql`(date_trunc('month', now() AT TIME ZONE ${tz}) AT TIME ZONE ${tz})`;
    const prevStart = sql`(date_trunc('month', (now() AT TIME ZONE ${tz}) - interval '1 month') AT TIME ZONE ${tz})`;
    const todayStart = sql`(date_trunc('day', now() AT TIME ZONE ${tz}) AT TIME ZONE ${tz})`;
    const live = sql`${orders.orderStatus} NOT IN ('CANCELLED', 'REJECTED')`;
    const done = sql`${orders.orderStatus} IN ('DELIVERED', 'PICKED_UP')`;
    const [row] = await this.db
      .select({
        salesThisMonth: sql<string>`coalesce(sum(${orders.totalAmount}) FILTER (WHERE ${live} AND ${orders.createdAt} >= ${monthStart}), 0)`,
        salesLastMonth: sql<string>`coalesce(sum(${orders.totalAmount}) FILTER (WHERE ${live} AND ${orders.createdAt} >= ${prevStart} AND ${orders.createdAt} < ${monthStart}), 0)`,
        completedThisMonth: sql<number>`count(*) FILTER (WHERE ${done} AND ${orders.completedAt} >= ${monthStart})::int`,
        completedLastMonth: sql<number>`count(*) FILTER (WHERE ${done} AND ${orders.completedAt} >= ${prevStart} AND ${orders.completedAt} < ${monthStart})::int`,
        ongoing: sql<number>`count(*) FILTER (WHERE ${orders.orderStatus} IN ('PLACED', 'ACCEPTED', 'PREPARING', 'READY_FOR_FULFILMENT', 'AWAITING_CUSTOMER_PICKUP', 'OUT_FOR_DELIVERY'))::int`,
        newToday: sql<number>`count(*) FILTER (WHERE ${orders.createdAt} >= ${todayStart})::int`,
      })
      .from(orders)
      .where(eq(orders.orqspaceId, orqspaceId));

    const tabs = await Promise.all(
      ORDER_QUEUES.map(async (queue) => {
        const c = queueCondition(queue);
        const [{ n }] = await this.db.select({ n: count() }).from(orders).where(c ? and(eq(orders.orqspaceId, orqspaceId), c) : eq(orders.orqspaceId, orqspaceId));
        return { queue, count: n };
      }),
    );
    const change = (now: number, before: number) => (before > 0 ? Math.round(((now - before) / before) * 1000) / 10 : null);
    return {
      totalSales: fromPaise(toPaise(row.salesThisMonth)),
      totalSalesChangePercent: change(Number(row.salesThisMonth), Number(row.salesLastMonth)),
      ongoingOrders: row.ongoing,
      newOrdersToday: row.newToday,
      completedOrders: row.completedThisMonth,
      completedChangePercent: change(row.completedThisMonth, row.completedLastMonth),
      tabs,
    };
  }

  async statusCounts(user: AuthUser, orqspaceId: string): Promise<OrderStatusCountType[]> {
    await this.access.assertCanManage(user, orqspaceId);
    const rows = await this.db
      .select({ status: orders.orderStatus, count: count() })
      .from(orders)
      .where(eq(orders.orqspaceId, orqspaceId))
      .groupBy(orders.orderStatus);
    return rows.map((r) => ({ status: r.status, count: r.count }));
  }

  async getForWorkspace(user: AuthUser, orderId: string): Promise<OrderType> {
    const order = await this.findOrder(orderId);
    const actor = await this.access.assertCanManage(user, order.orqspaceId);
    return (await this.toOrderTypes([order], actor.role))[0];
  }

  async listForCustomer(user: AuthUser, filter: MyOrdersFilterInput): Promise<OrderPageType> {
    const where = eq(orders.customerId, user.id);
    const [{ total }] = await this.db.select({ total: count() }).from(orders).where(where);
    const rows = await this.db
      .select()
      .from(orders)
      .where(where)
      .orderBy(desc(orders.createdAt))
      .limit(filter.pageSize)
      .offset((filter.page - 1) * filter.pageSize);
    return { items: await this.toOrderTypes(rows, 'CUSTOMER'), total, page: filter.page, pageSize: filter.pageSize };
  }

  async getForCustomer(user: AuthUser, orderId: string): Promise<OrderType> {
    const order = await this.findOrder(orderId);
    if (order.customerId !== user.id) throw new NotFoundException('Order not found');
    return (await this.toOrderTypes([order], 'CUSTOMER'))[0];
  }

  /** The customer's saved addresses for checkout (snapshotted into the order when placed). */
  async checkoutAddresses(user: AuthUser): Promise<CheckoutAddressType[]> {
    const rows = await this.db
      .select()
      .from(orqUserAddresses)
      .where(eq(orqUserAddresses.userId, user.id))
      .orderBy(desc(orqUserAddresses.isPrimary));
    return rows.map((a) => ({
      ...a,
      latitude: a.latitude === null ? null : Number(a.latitude),
      longitude: a.longitude === null ? null : Number(a.longitude),
    }));
  }

  async history(orderId: string): Promise<OrderStatusHistoryType[]> {
    return this.db
      .select({
        id: orderStatusHistory.id,
        fromStatus: orderStatusHistory.fromStatus,
        toStatus: orderStatusHistory.toStatus,
        actorRole: orderStatusHistory.actorRole,
        actorName: sql<string | null>`coalesce(${orqUsers.displayName}, ${orqUsers.fname})`,
        reason: orderStatusHistory.reason,
        createdAt: orderStatusHistory.createdAt,
      })
      .from(orderStatusHistory)
      .leftJoin(orqUsers, eq(orqUsers.id, orderStatusHistory.actorUserId))
      .where(eq(orderStatusHistory.orderId, orderId))
      .orderBy(asc(orderStatusHistory.createdAt));
  }

  async payments(orderId: string): Promise<OrderPaymentType[]> {
    return this.db
      .select({
        id: orderPayments.id,
        kind: orderPayments.kind,
        method: orderPayments.method,
        status: orderPayments.status,
        amount: orderPayments.amount,
        provider: orderPayments.provider,
        providerReference: orderPayments.providerReference,
        failureReason: orderPayments.failureReason,
        occurredAt: orderPayments.occurredAt,
      })
      .from(orderPayments)
      .where(eq(orderPayments.orderId, orderId))
      .orderBy(asc(orderPayments.occurredAt));
  }

  async orqspaceName(orqspaceId: string): Promise<string> {
    const [row] = await this.db.select({ name: orqspaces.name }).from(orqspaces).where(eq(orqspaces.id, orqspaceId));
    return row?.name ?? 'Workspace';
  }

  async findOrder(orderId: string): Promise<OrderRow> {
    const [order] = await this.db.select().from(orders).where(eq(orders.id, orderId));
    if (!order) throw new NotFoundException('Order not found');
    return order;
  }

  /** Maps rows to the GraphQL type, loading all items for the page in a single query. */
  async toOrderTypes(rows: OrderRow[], viewerRole: ActorRole): Promise<OrderType[]> {
    if (!rows.length) return [];
    const items = await this.db
      .select()
      .from(orderItems)
      .where(
        inArray(
          orderItems.orderId,
          rows.map((r) => r.id),
        ),
      )
      .orderBy(asc(orderItems.createdAt));
    const variantIds = [...new Set(items.map((i) => i.variantId).filter((id): id is string => !!id))];
    const stock = variantIds.length
      ? await this.db
          .select({ id: orqListingVariants.id, mode: orqListingVariants.inventoryMode, remaining: orqListingVariants.remainingQuantity })
          .from(orqListingVariants)
          .where(inArray(orqListingVariants.id, variantIds))
      : [];
    const remaining = new Map(stock.filter((v) => v.mode === 'LIMITED').map((v) => [v.id, v.remaining]));
    const paidRows = await this.db
      .select({
        orderId: orderPayments.orderId,
        net: sql<string>`coalesce(sum(CASE WHEN ${orderPayments.kind} = 'PAYMENT' THEN ${orderPayments.amount} ELSE -${orderPayments.amount} END) FILTER (WHERE ${orderPayments.status} = 'SUCCEEDED'), 0)`,
      })
      .from(orderPayments)
      .where(
        inArray(
          orderPayments.orderId,
          rows.map((r) => r.id),
        ),
      )
      .groupBy(orderPayments.orderId);
    const paid = new Map(paidRows.map((p) => [p.orderId, fromPaise(Math.max(0, toPaise(p.net)))]));
    const byOrder = new Map<string, OrderItemType[]>();
    for (const item of items) {
      const withStock = { ...item, stockRemaining: item.variantId ? (remaining.get(item.variantId) ?? null) : null };
      byOrder.set(item.orderId, [...(byOrder.get(item.orderId) ?? []), withStock]);
    }

    return rows.map((row) => {
      const orderItemsForRow = byOrder.get(row.id) ?? [];
      const completedAt = row.completedAt ?? row.deliveredAt;
      return {
        ...row,
        items: orderItemsForRow,
        itemCount: orderItemsForRow.reduce((sum, i) => sum + i.quantity, 0),
        allowedNextStatuses: allowedNextStatuses(row.orderStatus, viewerRole),
        amountPaid: paid.get(row.id) ?? '0.00',
        returnWindowEndsAt:
          completedAt && ordersConfig.returnWindowHours > 0 && ['DELIVERED', 'PICKED_UP'].includes(row.orderStatus)
            ? new Date(completedAt.getTime() + ordersConfig.returnWindowHours * 3_600_000)
            : null,
      };
    });
  }
}

/** Most urgent first: running preparation timers by deadline, upcoming by scheduled time, everything else newest first. */
function queueOrder(queue: OrderQueue | undefined) {
  if (queue === 'PROCESSING') return [asc(orders.preparationDueAt), asc(orders.createdAt)];
  if (queue === 'UPCOMING' || queue === 'NEW') return [asc(sql`coalesce(${orders.scheduledFor}, ${orders.createdAt})`)];
  if (queue === 'CANCEL_REQUESTS') return [asc(orders.cancelRequestedAt)];
  return [desc(orders.createdAt)];
}
