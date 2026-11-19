import { UseGuards } from '@nestjs/common';
import { Args, ID, Mutation, Query, Resolver } from '@nestjs/graphql';
import { CurrentUser, type AuthUser } from '@/core/decorators/current-user.decorator';
import { GqlAuthGuard } from '@/core/guards/gql-auth.guard';
import {
  ConnectionReasonInput,
  InviteDeliveryAgentInput,
  SearchDeliveryAgentInput,
  UpdateConnectionRateInput,
  WorkspaceConnectionsFilterInput,
} from '../dto/inputs/connection.inputs';
import { UpdateDeliverySettingsInput } from '../dto/inputs/settings.inputs';
import {
  DispatchOrderInput,
  ReassignTaskInput,
  SelfDeliveryUpdateInput,
  TaskReasonInput,
  WorkspaceTasksFilterInput,
} from '../dto/inputs/task.inputs';
import { AgentConnectionType, AgentSearchResultType } from '../dto/types/connection.type';
import { DeliveryTaskPageType, DeliveryTaskType, LocationPointType } from '../dto/types/delivery-task.type';
import { DeliverySettingsType } from '../dto/types/settings.type';
import { ConnectionsService } from '../services/connections/connections.service';
import { DeliverySettingsService } from '../services/settings/delivery-settings.service';
import { DispatchService } from '../services/tasks/dispatch.service';
import { TaskQueryService } from '../services/tasks/task-query.service';
import { DeliveryOperationsService } from '../services/operations/delivery-operations.service';
import { DeliveryOperationsType } from '../dto/types/operations.type';
import { TrackingService } from '../services/tracking/tracking.service';

/** Delivery Management page (workspace dashboard): settings, agents, dispatch and live operations. */
@Resolver()
@UseGuards(GqlAuthGuard)
export class WorkspaceDeliveryResolver {
  constructor(
    private readonly settings: DeliverySettingsService,
    private readonly connections: ConnectionsService,
    private readonly dispatch: DispatchService,
    private readonly tasks: TaskQueryService,
    private readonly operations: DeliveryOperationsService,
    private readonly tracking: TrackingService,
  ) {}

  // settings
  /** Operations console header: queue, timings/SLA, agent workload, COD outstanding, breaches and trend. */
  @Query(() => DeliveryOperationsType)
  orqspaceDeliveryOperations(@CurrentUser() user: AuthUser, @Args('orqspaceId', { type: () => ID }) orqspaceId: string) {
    return this.operations.overview(user, orqspaceId);
  }

  @Query(() => DeliverySettingsType)
  orqspaceDeliverySettings(@CurrentUser() user: AuthUser, @Args('orqspaceId', { type: () => ID }) orqspaceId: string) {
    return this.settings.get(user, orqspaceId);
  }

  @Mutation(() => DeliverySettingsType)
  updateOrqspaceDeliverySettings(@CurrentUser() user: AuthUser, @Args('input') input: UpdateDeliverySettingsInput) {
    return this.settings.update(user, input);
  }

  // agents & connections
  @Query(() => AgentSearchResultType)
  searchDeliveryAgent(@CurrentUser() user: AuthUser, @Args('input') input: SearchDeliveryAgentInput) {
    return this.connections.searchAgent(user, input);
  }

  @Query(() => [AgentConnectionType])
  orqspaceDeliveryAgents(@CurrentUser() user: AuthUser, @Args('filter') filter: WorkspaceConnectionsFilterInput) {
    return this.connections.listForWorkspace(user, filter);
  }

  @Mutation(() => AgentConnectionType)
  inviteDeliveryAgent(@CurrentUser() user: AuthUser, @Args('input') input: InviteDeliveryAgentInput) {
    return this.connections.invite(user, input);
  }

  @Mutation(() => AgentConnectionType)
  cancelDeliveryAgentInvite(@CurrentUser() user: AuthUser, @Args('input') input: ConnectionReasonInput) {
    return this.connections.cancelInvite(user, input);
  }

  @Mutation(() => AgentConnectionType)
  updateDeliveryAgentRate(@CurrentUser() user: AuthUser, @Args('input') input: UpdateConnectionRateInput) {
    return this.connections.updateRate(user, input);
  }

  @Mutation(() => AgentConnectionType)
  disconnectDeliveryAgent(@CurrentUser() user: AuthUser, @Args('input') input: ConnectionReasonInput) {
    return this.connections.disconnectByWorkspace(user, input);
  }

  @Mutation(() => AgentConnectionType)
  withdrawDeliveryAgentDisconnectRequest(@CurrentUser() user: AuthUser, @Args('connectionId', { type: () => ID }) connectionId: string) {
    return this.connections.withdrawDisconnectRequest(user, connectionId);
  }

  // tasks
  @Query(() => DeliveryTaskPageType)
  orqspaceDeliveryTasks(@CurrentUser() user: AuthUser, @Args('filter') filter: WorkspaceTasksFilterInput) {
    return this.tasks.listForWorkspace(user, filter);
  }

  @Query(() => [DeliveryTaskType])
  orqspaceLiveDeliveries(@CurrentUser() user: AuthUser, @Args('orqspaceId', { type: () => ID }) orqspaceId: string) {
    return this.tasks.liveForWorkspace(user, orqspaceId);
  }

  @Query(() => DeliveryTaskType)
  orqspaceDeliveryTask(@CurrentUser() user: AuthUser, @Args('taskId', { type: () => ID }) taskId: string) {
    return this.tasks.getForWorkspace(user, taskId);
  }

  @Query(() => [LocationPointType])
  deliveryTaskTrace(@CurrentUser() user: AuthUser, @Args('taskId', { type: () => ID }) taskId: string) {
    return this.tracking.taskTrace(user, taskId);
  }

  @Mutation(() => DeliveryTaskType)
  dispatchOrder(@CurrentUser() user: AuthUser, @Args('input') input: DispatchOrderInput) {
    return this.dispatch.dispatch(user, input);
  }

  @Mutation(() => DeliveryTaskType)
  reassignDeliveryTask(@CurrentUser() user: AuthUser, @Args('input') input: ReassignTaskInput) {
    return this.dispatch.reassign(user, input);
  }

  @Mutation(() => DeliveryTaskType)
  cancelDeliveryTask(@CurrentUser() user: AuthUser, @Args('input') input: TaskReasonInput) {
    return this.dispatch.cancelTask(user, input);
  }

  @Mutation(() => DeliveryTaskType)
  overrideDeliveryAsDelivered(@CurrentUser() user: AuthUser, @Args('input') input: TaskReasonInput) {
    return this.dispatch.overrideDelivered(user, input);
  }

  @Mutation(() => DeliveryTaskType)
  updateSelfDelivery(@CurrentUser() user: AuthUser, @Args('input') input: SelfDeliveryUpdateInput) {
    return this.dispatch.selfDeliveryUpdate(user, input);
  }
}
