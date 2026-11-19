import { graphqlClient } from '@/lib/graphqlClient';
import * as Q from '../graphql/run.graphql';
import type { AgentConnection, DeliveryTask } from '@/features/dashboard/delivery/types/delivery.types';
import type { AgentProfile, AgentStatement, EarningsOverview, FullAgentProfile, NotificationPreference, RunHome, RunNotification, SupportTicket } from '../types/run.types';

type Input = Record<string, unknown>;

export const runService = {
  async myProfile(): Promise<AgentProfile | null> {
    return (await graphqlClient.request<{ myDeliveryAgentProfile: AgentProfile | null }>(Q.MY_AGENT_PROFILE)).myDeliveryAgentProfile;
  },
  async register(input: Input): Promise<AgentProfile> {
    return (await graphqlClient.request<{ registerAsDeliveryAgent: AgentProfile }>(Q.REGISTER_AGENT, { input })).registerAsDeliveryAgent;
  },
  async reverify(checks: string[]): Promise<AgentProfile> {
    return (await graphqlClient.request<{ reverifyMyDeliveryKyc: AgentProfile }>(Q.REVERIFY_KYC, { input: { checks } })).reverifyMyDeliveryKyc;
  },
  async home(): Promise<RunHome> {
    return (await graphqlClient.request<{ runHome: RunHome }>(Q.RUN_HOME)).runHome;
  },
  setAvailability: (availability: 'ONLINE' | 'OFFLINE') => graphqlClient.request(Q.SET_AVAILABILITY, { availability }),
  respondInvitation: (input: Input) => graphqlClient.request(Q.RESPOND_INVITATION, { input }),
  disconnect: (input: Input) => graphqlClient.request(Q.DISCONNECT_WORKSPACE, { input }),
  withdrawDisconnect: (connectionId: string) => graphqlClient.request(Q.WITHDRAW_DISCONNECT, { connectionId }),
  async statements(): Promise<AgentStatement[]> {
    return (await graphqlClient.request<{ myDeliveryStatements: AgentStatement[] }>(Q.MY_STATEMENTS)).myDeliveryStatements;
  },
  async preferences(): Promise<NotificationPreference[]> {
    return (await graphqlClient.request<{ myNotificationPreferences: NotificationPreference[] }>(Q.MY_NOTIFICATION_PREFERENCES)).myNotificationPreferences;
  },
  setPreference: (input: { type: string; enabled: boolean }) => graphqlClient.request(Q.SET_NOTIFICATION_PREFERENCE, input),
  acceptOffer: (input: Input) => graphqlClient.request(Q.ACCEPT_OFFER, { input }),
  declineOffer: (input: Input) => graphqlClient.request(Q.DECLINE_OFFER, { input }),
  markArriving: (input: Input) => graphqlClient.request(Q.MARK_ARRIVING, { input }),
  confirmPickup: (input: Input) => graphqlClient.request(Q.CONFIRM_PICKUP, { input }),
  startTransit: (input: Input) => graphqlClient.request(Q.START_TRANSIT, { input }),
  complete: (input: Input) => graphqlClient.request(Q.COMPLETE_DELIVERY, { input }),
  fail: (input: Input) => graphqlClient.request(Q.FAIL_DELIVERY, { input }),
  returnToOrigin: (input: Input) => graphqlClient.request(Q.RETURN_TO_ORIGIN, { input }),
  async history(): Promise<DeliveryTask[]> {
    return (await graphqlClient.request<{ myDeliveryHistory: DeliveryTask[] }>(Q.MY_DELIVERY_HISTORY)).myDeliveryHistory;
  },
  async task(taskId: string): Promise<DeliveryTask> {
    return (await graphqlClient.request<{ myDeliveryTask: DeliveryTask }>(Q.MY_DELIVERY_TASK, { taskId })).myDeliveryTask;
  },
  earnings: (periodMonth: string) => graphqlClient.request<EarningsOverview>(Q.MY_EARNINGS_OVERVIEW, { periodMonth }),
  async connections(): Promise<AgentConnection[]> {
    return (await graphqlClient.request<{ myDeliveryConnections: AgentConnection[] }>(Q.MY_CONNECTIONS)).myDeliveryConnections;
  },
  async fullProfile(): Promise<FullAgentProfile | null> {
    return (await graphqlClient.request<{ myDeliveryAgentProfile: FullAgentProfile | null }>(Q.MY_FULL_PROFILE)).myDeliveryAgentProfile;
  },
  changeVehicle: (input: Input) => graphqlClient.request(Q.CHANGE_VEHICLE, { input }),
  async notifications(unreadOnly = false): Promise<{ unreadCount: number; items: RunNotification[] }> {
    return (await graphqlClient.request<{ myDeliveryNotifications: { unreadCount: number; items: RunNotification[] } }>(Q.MY_NOTIFICATIONS, { unreadOnly }))
      .myDeliveryNotifications;
  },
  markNotificationsRead: (ids: string[]) => graphqlClient.request(Q.MARK_NOTIFICATIONS_READ, { ids }),
  async tickets(): Promise<SupportTicket[]> {
    return (await graphqlClient.request<{ mySupportTickets: SupportTicket[] }>(Q.MY_TICKETS)).mySupportTickets;
  },
  async ticket(ticketId: string): Promise<SupportTicket> {
    return (await graphqlClient.request<{ mySupportTicket: SupportTicket }>(Q.MY_TICKET, { ticketId })).mySupportTicket;
  },
  async createTicket(input: Input): Promise<SupportTicket> {
    return (await graphqlClient.request<{ createSupportTicket: SupportTicket }>(Q.CREATE_TICKET, { input })).createSupportTicket;
  },
  replyTicket: (input: Input) => graphqlClient.request(Q.REPLY_TICKET, { input }),
  closeTicket: (ticketId: string) => graphqlClient.request(Q.CLOSE_TICKET, { ticketId }),
  async trace(taskId: string): Promise<{ lat: number; lng: number; recordedAt: string }[]> {
    return (await graphqlClient.request<{ deliveryTaskTrace: { lat: number; lng: number; recordedAt: string }[] }>(Q.MY_TASK_TRACE, { taskId })).deliveryTaskTrace;
  },
  recordLocation: (input: Input) => graphqlClient.request<{ recordMyLocation: { accepted: boolean; trackingActive: boolean } }>(Q.RECORD_LOCATION, { input }),
};
