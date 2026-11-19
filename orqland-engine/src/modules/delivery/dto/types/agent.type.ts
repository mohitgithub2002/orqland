import { Field, ID, Int, ObjectType } from '@nestjs/graphql';
import type {
  DeliveryAgentAvailability,
  DeliveryAgentStatus,
  KycAttemptStatus,
  KycCheckStatus,
  KycCheckType,
  KycTrigger,
  VehicleCategory,
} from '@/infrastructure/database/schema';
import {
  DeliveryAgentAvailabilityGql,
  DeliveryAgentStatusGql,
  KycAttemptStatusGql,
  KycCheckStatusGql,
  KycCheckTypeGql,
  KycTriggerGql,
  VehicleCategoryGql,
} from '../enums/delivery.enums';

@ObjectType('KycVerificationAttempt')
export class KycVerificationAttemptType {
  @Field(() => ID) id: string;
  @Field(() => KycCheckTypeGql) checkType: KycCheckType;
  @Field(() => KycTriggerGql) trigger: KycTrigger;
  @Field(() => KycAttemptStatusGql) status: KycAttemptStatus;
  @Field(() => [String]) mismatchFields: string[];
  @Field() requestedAt: Date;
  @Field(() => Date, { nullable: true }) completedAt: Date | null;
}

/** The agent's own profile. Never exposes raw document numbers. */
@ObjectType('DeliveryAgentProfile')
export class DeliveryAgentProfileType {
  @Field(() => ID) userId: string;
  @Field() orqUserId: string;
  @Field() displayName: string;
  @Field(() => DeliveryAgentStatusGql) agentStatus: DeliveryAgentStatus;
  @Field(() => DeliveryAgentAvailabilityGql) availability: DeliveryAgentAvailability;
  @Field(() => Int) maxConcurrentTasks: number;
  @Field() licenceNumberLast4: string;
  @Field(() => KycCheckStatusGql) licenceStatus: KycCheckStatus;
  @Field(() => String, { nullable: true }) licenceValidTo: string | null;
  @Field(() => Date, { nullable: true }) licenceVerifiedAt: Date | null;
  @Field(() => Date, { nullable: true }) licenceNextDueAt: Date | null;
  @Field() vehicleNumberMasked: string;
  @Field(() => VehicleCategoryGql) vehicleCategory: VehicleCategory;
  @Field(() => KycCheckStatusGql) vehicleStatus: KycCheckStatus;
  @Field(() => String, { nullable: true }) vehicleRcValidTo: string | null;
  @Field(() => Date, { nullable: true }) vehicleVerifiedAt: Date | null;
  @Field(() => Date, { nullable: true }) vehicleNextDueAt: Date | null;
  @Field(() => String, { nullable: true }) lastFailureReason: string | null;
  /** Document references; bytes are fetched from GET /delivery/files/:id (owner and KYC reviewers only). */
  @Field(() => ID, { nullable: true }) licenceFrontFileId: string | null;
  @Field(() => ID, { nullable: true }) licenceBackFileId: string | null;
  @Field(() => ID, { nullable: true }) vehicleRcFileId: string | null;
  @Field(() => String, { nullable: true }) suspendedReason: string | null;
  @Field(() => Date, { nullable: true }) activatedAt: Date | null;
  /** True when the agent may receive new delivery offers right now (status + KYC validity). */
  @Field() eligibleForAssignments: boolean;
  @Field(() => [String]) kycAlerts: string[];
  @Field(() => [KycVerificationAttemptType]) verifications: KycVerificationAttemptType[];
}

/** What a workspace sees about an agent. Location/phone only for connected agents. */
@ObjectType('DeliveryAgentSummary')
export class DeliveryAgentSummaryType {
  @Field(() => ID) userId: string;
  @Field() orqUserId: string;
  @Field() displayName: string;
  @Field(() => String, { nullable: true }) avatar: string | null;
  @Field(() => String, { nullable: true }) phone: string | null;
  @Field(() => DeliveryAgentStatusGql) agentStatus: DeliveryAgentStatus;
  @Field(() => DeliveryAgentAvailabilityGql) availability: DeliveryAgentAvailability;
  @Field(() => VehicleCategoryGql) vehicleCategory: VehicleCategory;
  @Field() vehicleNumberMasked: string;
  @Field() kycValid: boolean;
  @Field(() => Int) activeTaskCount: number;
  @Field(() => Number, { nullable: true }) lastLat: number | null;
  @Field(() => Number, { nullable: true }) lastLng: number | null;
  @Field(() => Date, { nullable: true }) lastLocationAt: Date | null;
}

/** Platform-admin view of an agent (KYC review, suspension). Still never exposes raw document numbers. */
@ObjectType('PlatformDeliveryAgent')
export class PlatformDeliveryAgentType {
  @Field(() => DeliveryAgentProfileType) profile: DeliveryAgentProfileType;
  @Field(() => String, { nullable: true }) phone: string | null;
  @Field(() => String, { nullable: true }) email: string | null;
  @Field(() => Int) activeConnections: number;
  @Field(() => Int) completedDeliveries: number;
  @Field() createdAt: Date;
}

@ObjectType('PlatformDeliveryAgentPage')
export class PlatformDeliveryAgentPageType {
  @Field(() => [PlatformDeliveryAgentType]) items: PlatformDeliveryAgentType[];
  @Field(() => Int) total: number;
  @Field(() => Int) page: number;
  @Field(() => Int) pageSize: number;
}
