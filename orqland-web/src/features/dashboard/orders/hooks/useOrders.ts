'use client';

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { OrderActionName } from '../graphql/orders.graphql';
import { ordersService } from '../services/orders.service';
import type { OrdersFilter } from '../types/order.types';

export const orderKeys = {
  all: ['orders'] as const,
  list: (filter: OrdersFilter) => ['orders', 'list', filter] as const,
  counts: (orqspaceId: string) => ['orders', 'counts', orqspaceId] as const,
  summary: (orqspaceId: string) => ['orders', 'summary', orqspaceId] as const,
  detail: (orderId: string) => ['orders', 'detail', orderId] as const,
};

export function useOrqspaceOrders(filter: OrdersFilter | null) {
  return useQuery({
    queryKey: filter ? orderKeys.list(filter) : ['orders', 'list', 'none'],
    queryFn: () => ordersService.list(filter!),
    enabled: !!filter,
    placeholderData: keepPreviousData,
    refetchInterval: 15_000,
  });
}

export function useOrderCounts(orqspaceId: string | null) {
  return useQuery({
    queryKey: orderKeys.counts(orqspaceId ?? 'none'),
    queryFn: () => ordersService.counts(orqspaceId!),
    enabled: !!orqspaceId,
    refetchInterval: 20_000,
  });
}

export function useOrderSummary(orqspaceId: string | null) {
  return useQuery({ queryKey: orderKeys.summary(orqspaceId ?? 'none'), queryFn: () => ordersService.summary(orqspaceId!), enabled: !!orqspaceId, refetchInterval: 20_000 });
}

/** Upload (REST) + attach an invoice to a completed order. */
export function useAttachInvoice() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ orderId, fileId }: { orderId: string; fileId: string }) => ordersService.attachInvoice(orderId, fileId),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: orderKeys.all }),
  });
}

export function useOrderDetail(orderId: string | null) {
  return useQuery({
    queryKey: orderKeys.detail(orderId ?? 'none'),
    queryFn: () => ordersService.detail(orderId!),
    enabled: !!orderId,
    refetchInterval: 15_000,
  });
}

/** One mutation hook for every workspace order action; refreshes lists, counts and the detail view. */
export function useOrderAction() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ name, input }: { name: OrderActionName; input: Record<string, unknown> }) => ordersService.action(name, input),
    onSuccess: (order) => {
      queryClient.setQueryData(orderKeys.detail(order.id), order);
      void queryClient.invalidateQueries({ queryKey: orderKeys.all });
      void queryClient.invalidateQueries({ queryKey: ['delivery'] });
    },
  });
}
