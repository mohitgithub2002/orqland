import { graphqlClient } from '@/lib/graphqlClient';
import * as Q from '../graphql/my-orders.graphql';
import type { CheckoutAddress, MyOrderDetail, MyOrderListItem } from '../types/my-orders.types';

export const myOrdersService = {
  async list(page: number): Promise<{ items: MyOrderListItem[]; total: number }> {
    return (await graphqlClient.request<{ myOrders: { items: MyOrderListItem[]; total: number } }>(Q.MY_ORDERS, { filter: { page, pageSize: 20 } })).myOrders;
  },
  async detail(orderId: string): Promise<MyOrderDetail> {
    return (await graphqlClient.request<{ myOrder: MyOrderDetail }>(Q.MY_ORDER, { orderId })).myOrder;
  },
  async addresses(): Promise<CheckoutAddress[]> {
    return (await graphqlClient.request<{ myCheckoutAddresses: CheckoutAddress[] }>(Q.CHECKOUT_ADDRESSES)).myCheckoutAddresses;
  },
  async place(input: Record<string, unknown>) {
    return (
      await graphqlClient.request<{ placeOrder: { checkoutId: string; replayed: boolean; orders: { id: string; orderNumber: string; orqspaceName: string; totalAmount: string }[] } }>(
        Q.PLACE_ORDER,
        { input },
      )
    ).placeOrder;
  },
  cancel: (input: Record<string, unknown>) => graphqlClient.request(Q.CANCEL_MY_ORDER, { input }),
  requestReturn: (input: Record<string, unknown>) => graphqlClient.request(Q.REQUEST_RETURN, { input }),
};
