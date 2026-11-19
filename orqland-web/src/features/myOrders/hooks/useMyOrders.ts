'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { myOrdersService } from '../services/my-orders.service';

export const myOrderKeys = {
  all: ['my-orders'] as const,
  list: (page: number) => ['my-orders', 'list', page] as const,
  detail: (id: string) => ['my-orders', 'detail', id] as const,
  addresses: ['my-orders', 'addresses'] as const,
};

export const useMyOrders = (page: number) => useQuery({ queryKey: myOrderKeys.list(page), queryFn: () => myOrdersService.list(page), refetchInterval: 30_000 });
export const useMyOrder = (orderId: string | null) =>
  useQuery({ queryKey: myOrderKeys.detail(orderId ?? ''), queryFn: () => myOrdersService.detail(orderId!), enabled: !!orderId, refetchInterval: 15_000 });
export const useCheckoutAddresses = (enabled: boolean) => useQuery({ queryKey: myOrderKeys.addresses, queryFn: myOrdersService.addresses, enabled });

export function useMyOrderAction<A extends 'place' | 'cancel' | 'requestReturn'>(action: A) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: Record<string, unknown>) => myOrdersService[action](input) as Promise<Awaited<ReturnType<(typeof myOrdersService)[A]>>>,
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: myOrderKeys.all }),
  });
}
