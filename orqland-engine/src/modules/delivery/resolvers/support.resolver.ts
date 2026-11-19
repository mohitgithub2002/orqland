import { UseGuards } from '@nestjs/common';
import { Args, Context, ID, Int, Mutation, Parent, Query, ResolveField, Resolver } from '@nestjs/graphql';
import { CurrentUser, type AuthUser } from '@/core/decorators/current-user.decorator';
import { Roles } from '@/core/decorators/roles.decorator';
import { GqlAuthGuard } from '@/core/guards/gql-auth.guard';
import { RolesGuard } from '@/core/guards/roles.guard';
import { PLATFORM_ADMIN_ROLE } from '@/modules/orders/services/shared/orqspace-access.service';
import {
  CreateSupportTicketInput,
  PlatformAgentsFilterInput,
  ReplySupportTicketInput,
  SupportTicketsFilterInput,
  UpdateSupportTicketInput,
} from '../dto/inputs/support.inputs';
import { PlatformDeliveryAgentPageType, PlatformDeliveryAgentType } from '../dto/types/agent.type';
import {
  DeliveryNotificationPageType,
  NotificationPreferenceType,
  SupportMessageType,
  SupportTicketPageType,
  SupportTicketType,
} from '../dto/types/support.type';
import { AgentAdminService } from '../services/kyc/agent-admin.service';
import { NotificationPreferencesService } from '../services/notifications/notification-preferences.service';
import { NotificationsQueryService } from '../services/notifications/notifications-query.service';
import { SupportService } from '../services/support/support.service';

/** In-app notification history for any signed-in user (agents and workspace admins). */
@Resolver()
@UseGuards(GqlAuthGuard)
export class DeliveryNotificationsResolver {
  constructor(
    private readonly notifications: NotificationsQueryService,
    private readonly preferences: NotificationPreferencesService,
  ) {}

  @Query(() => DeliveryNotificationPageType)
  myDeliveryNotifications(
    @CurrentUser() user: AuthUser,
    @Args('unreadOnly', { defaultValue: false }) unreadOnly: boolean,
    @Args('limit', { type: () => Int, defaultValue: 30 }) limit: number,
  ) {
    return this.notifications.list(user, unreadOnly, limit);
  }

  /** Marks the given notifications read, or all of them when `ids` is empty. Returns the unread count. */
  @Mutation(() => Int)
  markDeliveryNotificationsRead(@CurrentUser() user: AuthUser, @Args('ids', { type: () => [ID], defaultValue: [] }) ids: string[]) {
    return this.notifications.markRead(user, ids);
  }

  @Query(() => [NotificationPreferenceType])
  myNotificationPreferences(@CurrentUser() user: AuthUser) {
    return this.preferences.list(user);
  }

  @Mutation(() => [NotificationPreferenceType])
  setNotificationPreference(@CurrentUser() user: AuthUser, @Args('type') type: string, @Args('enabled') enabled: boolean) {
    return this.preferences.set(user, type, enabled);
  }
}

/** Orqland Run support: tickets raised by the agent. */
@Resolver(() => SupportTicketType)
@UseGuards(GqlAuthGuard)
export class AgentSupportResolver {
  constructor(private readonly support: SupportService) {}

  @Query(() => [SupportTicketType])
  mySupportTickets(@CurrentUser() user: AuthUser) {
    return this.support.listMine(user);
  }

  @Query(() => SupportTicketType)
  mySupportTicket(@CurrentUser() user: AuthUser, @Args('ticketId', { type: () => ID }) ticketId: string) {
    return this.support.getMine(user, ticketId);
  }

  @Mutation(() => SupportTicketType)
  createSupportTicket(@CurrentUser() user: AuthUser, @Args('input') input: CreateSupportTicketInput) {
    return this.support.create(user, input);
  }

  @Mutation(() => SupportMessageType)
  replyToSupportTicket(@CurrentUser() user: AuthUser, @Args('input') input: ReplySupportTicketInput) {
    return this.support.replyAsAgent(user, { ...input, internal: false });
  }

  @Mutation(() => SupportTicketType)
  closeSupportTicket(@CurrentUser() user: AuthUser, @Args('ticketId', { type: () => ID }) ticketId: string) {
    return this.support.closeMine(user, ticketId);
  }

  /** Internal support notes are only included for platform admins. */
  @ResolveField(() => [SupportMessageType])
  messages(@Parent() ticket: SupportTicketType, @Context() ctx: { req: { user?: AuthUser } }) {
    return this.support.messages(ticket.id, !!ctx.req.user?.roles.includes(PLATFORM_ADMIN_ROLE));
  }
}

/** Admin portal: agent KYC review/directory and the support queue. */
@Resolver()
@UseGuards(GqlAuthGuard, RolesGuard)
@Roles(PLATFORM_ADMIN_ROLE)
export class PlatformDeliveryAdminResolver {
  constructor(
    private readonly agents: AgentAdminService,
    private readonly support: SupportService,
  ) {}

  @Query(() => PlatformDeliveryAgentPageType)
  platformDeliveryAgents(@Args('filter') filter: PlatformAgentsFilterInput) {
    return this.agents.list(filter);
  }

  @Query(() => PlatformDeliveryAgentType)
  platformDeliveryAgent(@Args('userId', { type: () => ID }) userId: string) {
    return this.agents.get(userId);
  }

  @Query(() => SupportTicketPageType)
  platformSupportTickets(@Args('filter') filter: SupportTicketsFilterInput) {
    return this.support.list(filter);
  }

  @Query(() => SupportTicketType)
  platformSupportTicket(@Args('ticketId', { type: () => ID }) ticketId: string) {
    return this.support.get(ticketId);
  }

  @Mutation(() => SupportMessageType)
  replyToSupportTicketAsSupport(@CurrentUser() user: AuthUser, @Args('input') input: ReplySupportTicketInput) {
    return this.support.replyAsSupport(user, input);
  }

  @Mutation(() => SupportTicketType)
  updateSupportTicket(@CurrentUser() user: AuthUser, @Args('input') input: UpdateSupportTicketInput) {
    return this.support.update(user, input);
  }
}
