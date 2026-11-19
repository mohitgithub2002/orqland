import { graphqlClient } from '@/lib/graphqlClient';
import {
  ATTACH_ORDER_INVOICE,
  ORDER_ACTION_MUTATIONS,
  ORQSPACE_ORDER_COUNTS_QUERY,
  ORQSPACE_ORDER_QUERY,
  ORQSPACE_ORDER_SUMMARY_QUERY,
  ORQSPACE_ORDERS_QUERY,
  type OrderActionName,
} from '../graphql/orders.graphql';
import type { Order, OrderPage, OrdersFilter, OrderStatus, OrderSummary } from '../types/order.types';

export const ordersService = {
  async list(filter: OrdersFilter): Promise<OrderPage> {
    return (await graphqlClient.request<{ orqspaceOrders: OrderPage }>(ORQSPACE_ORDERS_QUERY, { filter })).orqspaceOrders;
  },

  async summary(orqspaceId: string): Promise<OrderSummary> {
    return (await graphqlClient.request<{ orqspaceOrderSummary: OrderSummary }>(ORQSPACE_ORDER_SUMMARY_QUERY, { orqspaceId })).orqspaceOrderSummary;
  },

  async counts(orqspaceId: string): Promise<Record<OrderStatus, number>> {
    const data = await graphqlClient.request<{ orqspaceOrderCounts: { status: OrderStatus; count: number }[] }>(ORQSPACE_ORDER_COUNTS_QUERY, { orqspaceId });
    return Object.fromEntries(data.orqspaceOrderCounts.map((c) => [c.status, c.count])) as Record<OrderStatus, number>;
  },

  async detail(orderId: string): Promise<Order> {
    return (await graphqlClient.request<{ orqspaceOrder: Order }>(ORQSPACE_ORDER_QUERY, { orderId })).orqspaceOrder;
  },

  async action(name: OrderActionName, input: Record<string, unknown>): Promise<Order> {
    return (await graphqlClient.request<Record<string, Order>>(ORDER_ACTION_MUTATIONS[name], { input }))[name];
  },

  attachInvoice: (orderId: string, fileId: string) => graphqlClient.request(ATTACH_ORDER_INVOICE, { orderId, fileId }),
};
