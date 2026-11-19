'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { runService } from '../services/run.service';

export const runKeys = {
  profile: ['run', 'profile'] as const,
  home: ['run', 'home'] as const,
  history: ['run', 'history'] as const,
  task: (id: string) => ['run', 'task', id] as const,
  earnings: (period: string) => ['run', 'earnings', period] as const,
  connections: ['run', 'connections'] as const,
  fullProfile: ['run', 'full-profile'] as const,
  notifications: ['run', 'notifications'] as const,
  tickets: ['run', 'tickets'] as const,
  ticket: (id: string) => ['run', 'ticket', id] as const,
  statements: ['run', 'statements'] as const,
  preferences: ['run', 'preferences'] as const,
};

export const useMyAgentProfile = () => useQuery({ queryKey: runKeys.profile, queryFn: runService.myProfile });

export const useRunHome = (enabled: boolean) => useQuery({ queryKey: runKeys.home, queryFn: runService.home, enabled, refetchInterval: 10_000 });

export const useRunHistory = () => useQuery({ queryKey: runKeys.history, queryFn: runService.history });
export const useRunTask = (taskId: string | null) =>
  useQuery({ queryKey: runKeys.task(taskId ?? ''), queryFn: () => runService.task(taskId!), enabled: !!taskId });
export const useRunEarnings = (period: string) => useQuery({ queryKey: runKeys.earnings(period), queryFn: () => runService.earnings(period) });
export const useRunConnections = () => useQuery({ queryKey: runKeys.connections, queryFn: runService.connections });
export const useFullAgentProfile = () => useQuery({ queryKey: runKeys.fullProfile, queryFn: runService.fullProfile });
export const useRunNotifications = () =>
  useQuery({ queryKey: runKeys.notifications, queryFn: () => runService.notifications(false), refetchInterval: 30_000 });
export const useSupportTickets = () => useQuery({ queryKey: runKeys.tickets, queryFn: runService.tickets });
export const useSupportTicket = (ticketId: string | null) =>
  useQuery({ queryKey: runKeys.ticket(ticketId ?? ''), queryFn: () => runService.ticket(ticketId!), enabled: !!ticketId, refetchInterval: 20_000 });

export const useRunTrace = (taskId: string | null) =>
  useQuery({ queryKey: ['run', 'trace', taskId ?? ''], queryFn: () => runService.trace(taskId!), enabled: !!taskId, refetchInterval: 20_000 });
export const useRunStatements = () => useQuery({ queryKey: runKeys.statements, queryFn: runService.statements });
export const useNotificationPreferences = () => useQuery({ queryKey: runKeys.preferences, queryFn: runService.preferences });

type RunAction = Exclude<
  keyof typeof runService,
  | 'myProfile'
  | 'home'
  | 'recordLocation'
  | 'history'
  | 'task'
  | 'earnings'
  | 'connections'
  | 'fullProfile'
  | 'notifications'
  | 'tickets'
  | 'ticket'
  | 'statements'
  | 'preferences'
  | 'trace'
>;

/** Any Run mutation; refreshes the profile and home screen afterwards. */
export function useRunAction<A extends RunAction>(action: A) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (arg: Parameters<(typeof runService)[A]>[0]) => (runService[action] as (a: typeof arg) => Promise<unknown>)(arg),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['run'] });
    },
  });
}
