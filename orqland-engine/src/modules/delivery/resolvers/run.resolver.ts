import { BadRequestException, UseGuards } from '@nestjs/common';
import { Args, ID, Int, Mutation, Query, Resolver } from '@nestjs/graphql';
import { CurrentUser, type AuthUser } from '@/core/decorators/current-user.decorator';
import { GqlAuthGuard } from '@/core/guards/gql-auth.guard';
import { ConnectionReasonInput, RespondToInvitationInput } from '../dto/inputs/connection.inputs';
import { PERIOD_PATTERN } from '../dto/inputs/settings.inputs';
import {
  CompleteDeliveryInput,
  FailDeliveryInput,
  LocationPingInput,
  OfferResponseInput,
  TaskActionInput,
} from '../dto/inputs/task.inputs';
import { AgentAvailabilityChoiceGql, type AgentAvailabilityChoice } from '../dto/enums/delivery.enums';
import { DeliveryAgentProfileType } from '../dto/types/agent.type';
import { AgentConnectionType } from '../dto/types/connection.type';
import { DeliveryTaskType, LocationPingResultType } from '../dto/types/delivery-task.type';
import {
  AgentEarningsSummaryType,
  AgentEarningsTrendPointType,
  AgentPerformanceType,
  AgentStatementType,
  DeliveryStatementType,
} from '../dto/types/finance.type';
import { RunHomeType } from '../dto/types/run.type';
import { AgentAvailabilityService } from '../services/agents/agent-availability.service';
import { ConnectionsService } from '../services/connections/connections.service';
import { EarningsService } from '../services/earnings/earnings.service';
import { StatementsService } from '../services/earnings/statements.service';
import { AgentRegistrationService } from '../services/kyc/agent-registration.service';
import { AgentTaskActionsService } from '../services/tasks/agent-task-actions.service';
import { TaskQueryService } from '../services/tasks/task-query.service';
import { RunHomeService } from '../services/run/run-home.service';
import { TrackingService } from '../services/tracking/tracking.service';

/** Orqland Run — the delivery agent's workspace. */
@Resolver()
@UseGuards(GqlAuthGuard)
export class RunResolver {
  constructor(
    private readonly registration: AgentRegistrationService,
    private readonly availability: AgentAvailabilityService,
    private readonly connections: ConnectionsService,
    private readonly actions: AgentTaskActionsService,
    private readonly tasks: TaskQueryService,
    private readonly tracking: TrackingService,
    private readonly earnings: EarningsService,
    private readonly runHomeService: RunHomeService,
    private readonly statements: StatementsService,
  ) {}

  @Query(() => RunHomeType)
  runHome(@CurrentUser() user: AuthUser): Promise<RunHomeType> {
    return this.runHomeService.home(user);
  }

  @Mutation(() => DeliveryAgentProfileType)
  async setMyAvailability(
    @CurrentUser() user: AuthUser,
    @Args('availability', { type: () => AgentAvailabilityChoiceGql }) availability: AgentAvailabilityChoice,
  ) {
    const row = await this.availability.setAvailability(user, availability);
    return this.registration.toProfileType(row);
  }

  @Query(() => [AgentConnectionType])
  myDeliveryConnections(@CurrentUser() user: AuthUser) {
    return this.connections.listForAgent(user.id, ['PENDING', 'ACTIVE', 'DISCONNECTED', 'DECLINED', 'EXPIRED', 'CANCELLED']);
  }

  @Mutation(() => AgentConnectionType)
  respondToDeliveryInvitation(@CurrentUser() user: AuthUser, @Args('input') input: RespondToInvitationInput) {
    return this.connections.respond(user, input);
  }

  @Mutation(() => AgentConnectionType)
  disconnectFromWorkspace(@CurrentUser() user: AuthUser, @Args('input') input: ConnectionReasonInput) {
    return this.connections.disconnectByAgent(user, input);
  }

  @Mutation(() => AgentConnectionType)
  withdrawWorkspaceDisconnectRequest(@CurrentUser() user: AuthUser, @Args('connectionId', { type: () => ID }) connectionId: string) {
    return this.connections.withdrawDisconnectRequest(user, connectionId);
  }

  @Query(() => DeliveryTaskType)
  myDeliveryTask(@CurrentUser() user: AuthUser, @Args('taskId', { type: () => ID }) taskId: string) {
    return this.tasks.getForAgent(user.id, taskId);
  }

  @Query(() => [DeliveryTaskType])
  myDeliveryHistory(@CurrentUser() user: AuthUser) {
    return this.tasks.agentHistory(user.id);
  }

  @Query(() => AgentEarningsSummaryType)
  myDeliveryEarnings(@CurrentUser() user: AuthUser, @Args('periodMonth', { nullable: true }) periodMonth?: string) {
    if (periodMonth && !PERIOD_PATTERN.test(periodMonth)) throw new BadRequestException('Period must be YYYY-MM');
    return this.earnings.agentSummary(user.id, periodMonth);
  }

  @Query(() => AgentStatementType)
  async myDeliveryStatement(@CurrentUser() user: AuthUser, @Args('periodMonth') periodMonth: string) {
    if (!PERIOD_PATTERN.test(periodMonth)) throw new BadRequestException('Period must be YYYY-MM');
    const statement = await this.earnings.agentStatement(user.id, periodMonth);
    return { ...statement, status: await this.statements.statusFor(user.id, periodMonth) };
  }

  /** Stored monthly statements (one per workspace and month), latest first. */
  @Query(() => [DeliveryStatementType])
  myDeliveryStatements(@CurrentUser() user: AuthUser, @Args('limit', { type: () => Int, defaultValue: 24 }) limit: number) {
    return this.statements.listForAgent(user, limit);
  }

  @Query(() => AgentPerformanceType)
  myDeliveryPerformance(@CurrentUser() user: AuthUser, @Args('periodMonth') periodMonth: string) {
    if (!PERIOD_PATTERN.test(periodMonth)) throw new BadRequestException('Period must be YYYY-MM');
    return this.earnings.agentPerformance(user.id, periodMonth);
  }

  @Query(() => [AgentEarningsTrendPointType])
  myDeliveryEarningsTrend(@CurrentUser() user: AuthUser, @Args('months', { type: () => Int, defaultValue: 6 }) months: number) {
    return this.earnings.agentTrend(user.id, Math.min(Math.max(months, 1), 24));
  }

  @Mutation(() => DeliveryTaskType)
  acceptDeliveryOffer(@CurrentUser() user: AuthUser, @Args('input') input: OfferResponseInput) {
    return this.actions.acceptOffer(user, input);
  }

  @Mutation(() => Boolean)
  declineDeliveryOffer(@CurrentUser() user: AuthUser, @Args('input') input: OfferResponseInput) {
    return this.actions.declineOffer(user, input);
  }

  @Mutation(() => DeliveryTaskType)
  markArrivingAtPickup(@CurrentUser() user: AuthUser, @Args('input') input: TaskActionInput) {
    return this.actions.markArriving(user, input);
  }

  @Mutation(() => DeliveryTaskType)
  confirmDeliveryPickup(@CurrentUser() user: AuthUser, @Args('input') input: TaskActionInput) {
    return this.actions.confirmPickup(user, input);
  }

  @Mutation(() => DeliveryTaskType)
  startDeliveryTransit(@CurrentUser() user: AuthUser, @Args('input') input: TaskActionInput) {
    return this.actions.startTransit(user, input);
  }

  @Mutation(() => DeliveryTaskType)
  completeDelivery(@CurrentUser() user: AuthUser, @Args('input') input: CompleteDeliveryInput) {
    return this.actions.completeDelivery(user, input);
  }

  @Mutation(() => DeliveryTaskType)
  failDelivery(@CurrentUser() user: AuthUser, @Args('input') input: FailDeliveryInput) {
    return this.actions.failDelivery(user, input);
  }

  @Mutation(() => DeliveryTaskType)
  returnDeliveryToOrigin(@CurrentUser() user: AuthUser, @Args('input') input: TaskActionInput) {
    return this.actions.returnToOrigin(user, input);
  }

  @Mutation(() => LocationPingResultType)
  recordMyLocation(@CurrentUser() user: AuthUser, @Args('input') input: LocationPingInput) {
    return this.tracking.recordPing(user, input);
  }
}

