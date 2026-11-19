import { UseGuards } from '@nestjs/common';
import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import { CurrentUser, type AuthUser } from '@/core/decorators/current-user.decorator';
import { Roles } from '@/core/decorators/roles.decorator';
import { GqlAuthGuard } from '@/core/guards/gql-auth.guard';
import { RolesGuard } from '@/core/guards/roles.guard';
import {
  AdminAgentActionInput,
  AdminReviewDecisionInput,
  ChangeVehicleInput,
  RegisterDeliveryAgentInput,
  ReverifyKycInput,
} from '../dto/inputs/agent-registration.inputs';
import { DeliveryAgentProfileType } from '../dto/types/agent.type';
import { AgentAdminService } from '../services/kyc/agent-admin.service';
import { AgentRegistrationService } from '../services/kyc/agent-registration.service';

/** "Become a Delivery Agent" — registration, KYC and re-verification for the signed-in Orqland user. */
@Resolver(() => DeliveryAgentProfileType)
@UseGuards(GqlAuthGuard)
export class AgentRegistrationResolver {
  constructor(private readonly registration: AgentRegistrationService) {}

  @Query(() => DeliveryAgentProfileType, { nullable: true })
  myDeliveryAgentProfile(@CurrentUser() user: AuthUser) {
    return this.registration.getMyProfile(user);
  }

  @Mutation(() => DeliveryAgentProfileType)
  registerAsDeliveryAgent(@CurrentUser() user: AuthUser, @Args('input') input: RegisterDeliveryAgentInput) {
    return this.registration.register(user, input);
  }

  @Mutation(() => DeliveryAgentProfileType)
  reverifyMyDeliveryKyc(@CurrentUser() user: AuthUser, @Args('input') input: ReverifyKycInput) {
    return this.registration.reverify(user, input.checks);
  }

  @Mutation(() => DeliveryAgentProfileType)
  changeMyDeliveryVehicle(@CurrentUser() user: AuthUser, @Args('input') input: ChangeVehicleInput) {
    return this.registration.changeVehicle(user, input);
  }
}

/** Platform-admin controls (exposed for the admin portal). */
@Resolver(() => DeliveryAgentProfileType)
@UseGuards(GqlAuthGuard, RolesGuard)
@Roles('PLATFORM_ADMIN')
export class AgentAdminResolver {
  constructor(
    private readonly admin: AgentAdminService,
    private readonly registration: AgentRegistrationService,
  ) {}

  @Mutation(() => DeliveryAgentProfileType)
  suspendDeliveryAgent(@CurrentUser() user: AuthUser, @Args('input') input: AdminAgentActionInput) {
    return this.admin.suspend(user, input.userId, input.reason);
  }

  @Mutation(() => DeliveryAgentProfileType)
  reinstateDeliveryAgent(@CurrentUser() user: AuthUser, @Args('input') input: AdminAgentActionInput) {
    return this.admin.reinstate(user, input.userId, input.reason);
  }

  @Mutation(() => DeliveryAgentProfileType)
  decideDeliveryAgentReview(@CurrentUser() user: AuthUser, @Args('input') input: AdminReviewDecisionInput) {
    return this.registration.reviewDecision(user, input.userId, input.approve, input.reason);
  }
}
