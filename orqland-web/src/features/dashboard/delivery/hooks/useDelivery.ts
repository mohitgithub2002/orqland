'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { deliveryService } from '../services/delivery.service';
import type { ConnectionStatus, TaskStatus } from '../types/delivery.types';

export const deliveryKeys = {
  all: ['delivery'] as const,
  settings: (id: string) => ['delivery', 'settings', id] as const,
  agents: (id: string, statuses?: ConnectionStatus[]) => ['delivery', 'agents', id, statuses ?? 'live'] as const,
  live: (id: string) => ['delivery', 'live', id] as const,
  tasks: (id: string, statuses: TaskStatus[] | undefined, search: string, page: number) => ['delivery', 'tasks', id, statuses, search, page] as const,
  task: (taskId: string) => ['delivery', 'task', taskId] as const,
  trace: (taskId: string) => ['delivery', 'trace', taskId] as const,
  cod: (id: string, statuses?: string[]) => ['delivery', 'cod', id, statuses] as const,
  codSummary: (id: string) => ['delivery', 'cod-summary', id] as const,
  earnings: (id: string, period: string) => ['delivery', 'earnings', id, period] as const,
  costReport: (id: string, period: string) => ['delivery', 'cost-report', id, period] as const,
  operations: (id: string) => ['delivery', 'operations', id] as const,
  statements: (id: string, period: string) => ['delivery', 'statements', id, period] as const,
};

const on = (id: string | null) => ({ enabled: !!id });

export const useDeliverySettings = (orqspaceId: string | null) =>
  useQuery({ queryKey: deliveryKeys.settings(orqspaceId ?? ''), queryFn: () => deliveryService.settings(orqspaceId!), ...on(orqspaceId) });

export const useDeliveryAgents = (orqspaceId: string | null, statuses?: ConnectionStatus[]) =>
  useQuery({ queryKey: deliveryKeys.agents(orqspaceId ?? '', statuses), queryFn: () => deliveryService.agents(orqspaceId!, statuses), ...on(orqspaceId), refetchInterval: 20_000 });

export const useLiveDeliveries = (orqspaceId: string | null) =>
  useQuery({ queryKey: deliveryKeys.live(orqspaceId ?? ''), queryFn: () => deliveryService.live(orqspaceId!), ...on(orqspaceId), refetchInterval: 10_000 });

export const useDeliveryTasks = (orqspaceId: string | null, statuses: TaskStatus[] | undefined, search: string, page: number) =>
  useQuery({
    queryKey: deliveryKeys.tasks(orqspaceId ?? '', statuses, search, page),
    queryFn: () => deliveryService.tasks({ orqspaceId: orqspaceId!, statuses, search: search || undefined, page, pageSize: 25 }),
    ...on(orqspaceId),
  });

export const useDeliveryTask = (taskId: string | null) =>
  useQuery({ queryKey: deliveryKeys.task(taskId ?? ''), queryFn: () => deliveryService.task(taskId!), ...on(taskId), refetchInterval: 10_000 });

export const useTaskTrace = (taskId: string | null) =>
  useQuery({ queryKey: deliveryKeys.trace(taskId ?? ''), queryFn: () => deliveryService.trace(taskId!), ...on(taskId), refetchInterval: 15_000 });

export const useCodRecords = (orqspaceId: string | null, statuses?: string[]) =>
  useQuery({ queryKey: deliveryKeys.cod(orqspaceId ?? '', statuses), queryFn: () => deliveryService.codRecords(orqspaceId!, statuses), ...on(orqspaceId) });

export const useCodSummary = (orqspaceId: string | null) =>
  useQuery({ queryKey: deliveryKeys.codSummary(orqspaceId ?? ''), queryFn: () => deliveryService.codSummary(orqspaceId!), ...on(orqspaceId) });

export const useDeliveryEarnings = (orqspaceId: string | null, period: string) =>
  useQuery({ queryKey: deliveryKeys.earnings(orqspaceId ?? '', period), queryFn: () => deliveryService.earnings(orqspaceId!, period), ...on(orqspaceId) });

export const useCostReport = (orqspaceId: string | null, period: string) =>
  useQuery({ queryKey: deliveryKeys.costReport(orqspaceId ?? '', period), queryFn: () => deliveryService.costReport(orqspaceId!, period), ...on(orqspaceId) });

/** Orq ID lookup (on demand). */
export const useAgentSearch = (orqspaceId: string) =>
  useMutation({ mutationFn: (orqUserId: string) => deliveryService.searchAgent(orqspaceId, orqUserId) });

export const useDeliveryOperations = (orqspaceId: string | null) =>
  useQuery({ queryKey: deliveryKeys.operations(orqspaceId ?? ''), queryFn: () => deliveryService.operations(orqspaceId!), ...on(orqspaceId), refetchInterval: 15_000 });

export const useDeliveryStatements = (orqspaceId: string | null, period: string) =>
  useQuery({ queryKey: deliveryKeys.statements(orqspaceId ?? '', period), queryFn: () => deliveryService.statements(orqspaceId!, period), ...on(orqspaceId) });

type Action = keyof Pick<
  typeof deliveryService,
  | 'updateSettings'
  | 'inviteAgent'
  | 'cancelInvite'
  | 'updateRate'
  | 'disconnect'
  | 'withdrawDisconnect'
  | 'dispatch'
  | 'reassign'
  | 'cancelTask'
  | 'overrideDelivered'
  | 'selfUpdate'
  | 'recordSettlement'
  | 'resolveCod'
  | 'approveEarning'
  | 'adjustEarning'
  | 'markPaid'
>;

/** Generic mutation for every Delivery Management action; refreshes delivery and order data afterwards. */
export function useDeliveryAction<A extends Action>(action: A) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: Record<string, unknown>) => deliveryService[action](input) as Promise<unknown>,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: deliveryKeys.all });
      void queryClient.invalidateQueries({ queryKey: ['orders'] });
    },
  });
}
