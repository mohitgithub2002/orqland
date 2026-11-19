import { graphqlClient } from '@/lib/graphqlClient';
import * as Q from '../graphql/delivery.graphql';
import type {
  AgentConnection,
  AgentSearchResult,
  CodRecord,
  CodSummary,
  ConnectionStatus,
  CostReport,
  DeliveryEarning,
  DeliveryOperations,
  DeliveryStatement,
  DeliverySettings,
  DeliveryTask,
  EarningStatus,
  TaskStatus,
} from '../types/delivery.types';

type Input = Record<string, unknown>;
const run = async <T>(doc: string, key: string, variables: Input): Promise<T> => (await graphqlClient.request<Record<string, T>>(doc, variables))[key];

export const deliveryService = {
  settings: (orqspaceId: string) => run<DeliverySettings>(Q.DELIVERY_SETTINGS_QUERY, 'orqspaceDeliverySettings', { orqspaceId }),
  updateSettings: (input: Input) => run<DeliverySettings>(Q.UPDATE_DELIVERY_SETTINGS, 'updateOrqspaceDeliverySettings', { input }),

  agents: (orqspaceId: string, statuses?: ConnectionStatus[]) =>
    run<AgentConnection[]>(Q.DELIVERY_AGENTS_QUERY, 'orqspaceDeliveryAgents', { filter: { orqspaceId, statuses } }),
  searchAgent: (orqspaceId: string, orqUserId: string) => run<AgentSearchResult>(Q.SEARCH_AGENT_QUERY, 'searchDeliveryAgent', { input: { orqspaceId, orqUserId } }),
  inviteAgent: (input: Input) => run<AgentConnection>(Q.INVITE_AGENT, 'inviteDeliveryAgent', { input }),
  cancelInvite: (input: Input) => run(Q.CANCEL_INVITE, 'cancelDeliveryAgentInvite', { input }),
  updateRate: (input: Input) => run(Q.UPDATE_RATE, 'updateDeliveryAgentRate', { input }),
  disconnect: (input: Input) => run(Q.DISCONNECT_AGENT, 'disconnectDeliveryAgent', { input }),
  withdrawDisconnect: (input: Input) => run(Q.WITHDRAW_DISCONNECT, 'withdrawDeliveryAgentDisconnectRequest', input),
  operations: (orqspaceId: string) => run<DeliveryOperations>(Q.OPERATIONS_QUERY, 'orqspaceDeliveryOperations', { orqspaceId }),
  statements: (orqspaceId: string, periodMonth: string) => run<DeliveryStatement[]>(Q.STATEMENTS_QUERY, 'orqspaceDeliveryStatements', { orqspaceId, periodMonth }),

  live: (orqspaceId: string) => run<DeliveryTask[]>(Q.LIVE_DELIVERIES_QUERY, 'orqspaceLiveDeliveries', { orqspaceId }),
  tasks: (filter: { orqspaceId: string; statuses?: TaskStatus[]; search?: string; page: number; pageSize: number }) =>
    run<{ items: DeliveryTask[]; total: number; page: number; pageSize: number }>(Q.DELIVERY_TASKS_QUERY, 'orqspaceDeliveryTasks', { filter }),
  task: (taskId: string) => run<DeliveryTask>(Q.DELIVERY_TASK_QUERY, 'orqspaceDeliveryTask', { taskId }),
  trace: (taskId: string) => run<{ lat: number; lng: number; recordedAt: string }[]>(Q.TASK_TRACE_QUERY, 'deliveryTaskTrace', { taskId }),

  dispatch: (input: Input) => run<DeliveryTask>(Q.DISPATCH_ORDER, 'dispatchOrder', { input }),
  reassign: (input: Input) => run<DeliveryTask>(Q.REASSIGN_TASK, 'reassignDeliveryTask', { input }),
  cancelTask: (input: Input) => run<DeliveryTask>(Q.CANCEL_TASK, 'cancelDeliveryTask', { input }),
  overrideDelivered: (input: Input) => run<DeliveryTask>(Q.OVERRIDE_DELIVERED, 'overrideDeliveryAsDelivered', { input }),
  selfUpdate: (input: Input) => run<DeliveryTask>(Q.SELF_DELIVERY_UPDATE, 'updateSelfDelivery', { input }),

  codRecords: (orqspaceId: string, statuses?: string[]) => run<CodRecord[]>(Q.COD_RECORDS_QUERY, 'orqspaceCodRecords', { filter: { orqspaceId, statuses } }),
  codSummary: (orqspaceId: string) => run<CodSummary>(Q.COD_SUMMARY_QUERY, 'orqspaceCodSummary', { orqspaceId }),
  recordSettlement: (input: Input) => run<CodRecord>(Q.RECORD_COD_SETTLEMENT, 'recordCodSettlement', { input }),
  resolveCod: (input: Input) => run<CodRecord>(Q.RESOLVE_COD, 'resolveCodRecord', { input }),

  earnings: (orqspaceId: string, periodMonth: string, statuses?: EarningStatus[]) =>
    run<DeliveryEarning[]>(Q.EARNINGS_QUERY, 'orqspaceDeliveryEarnings', { filter: { orqspaceId, periodMonth, statuses } }),
  costReport: (orqspaceId: string, periodMonth: string) => run<CostReport>(Q.COST_REPORT_QUERY, 'orqspaceDeliveryCostReport', { input: { orqspaceId, periodMonth } }),
  approveEarning: (input: Input) => run<DeliveryEarning>(Q.APPROVE_EARNING, 'approveDeliveryEarning', { input }),
  adjustEarning: (input: Input) => run<DeliveryEarning>(Q.ADJUST_EARNING, 'adjustDeliveryEarning', { input }),
  markPaid: (input: Input) => run(Q.MARK_EARNINGS_PAID, 'markDeliveryEarningsPaid', { input }),
};
