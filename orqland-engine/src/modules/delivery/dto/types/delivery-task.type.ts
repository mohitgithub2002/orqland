import { Field, ID, Int, ObjectType } from '@nestjs/graphql';
import type {
  ActorRole,
  AssignmentType,
  DeliveryMode,
  DeliveryOfferStatus,
  DeliveryTaskStatus,
  ProofOfDeliveryType,
} from '@/infrastructure/database/schema';
import { ActorRoleGql } from '@/modules/orders/dto/enums/order.enums';
import { AddressSnapshotType } from '@/modules/orders/dto/types/order.type';
import {
  AssignmentTypeGql,
  DeliveryModeGql,
  DeliveryOfferStatusGql,
  DeliveryTaskStatusGql,
  ProofOfDeliveryTypeGql,
} from '../enums/delivery.enums';
import { DeliveryAgentSummaryType } from './agent.type';

@ObjectType('DeliveryOffer')
export class DeliveryOfferType {
  @Field(() => ID) id: string;
  @Field(() => ID) taskId: string;
  @Field(() => ID) agentUserId: string;
  @Field(() => String, { nullable: true }) agentName: string | null;
  @Field(() => AssignmentTypeGql) assignmentType: AssignmentType;
  @Field(() => DeliveryOfferStatusGql) status: DeliveryOfferStatus;
  @Field() ratePerKmOffered: string;
  @Field(() => String, { nullable: true }) distanceToPickupKm: string | null;
  @Field() offeredAt: Date;
  @Field() expiresAt: Date;
  @Field(() => Date, { nullable: true }) respondedAt: Date | null;
  @Field(() => String, { nullable: true }) declineReason: string | null;
}

@ObjectType('DeliveryStatusEvent')
export class DeliveryStatusEventType {
  @Field(() => ID) id: string;
  @Field(() => DeliveryTaskStatusGql, { nullable: true }) fromStatus: DeliveryTaskStatus | null;
  @Field(() => DeliveryTaskStatusGql) toStatus: DeliveryTaskStatus;
  @Field(() => ActorRoleGql) actorRole: ActorRole;
  @Field(() => String, { nullable: true }) actorName: string | null;
  @Field(() => String, { nullable: true }) reason: string | null;
  @Field() isOverride: boolean;
  @Field() createdAt: Date;
}

@ObjectType('DeliveryTask')
export class DeliveryTaskType {
  @Field(() => ID) id: string;
  @Field() taskNumber: string;
  @Field(() => ID) orderId: string;
  @Field() orderNumber: string;
  @Field(() => ID) orqspaceId: string;
  @Field() orqspaceName: string;
  @Field(() => DeliveryModeGql) mode: DeliveryMode;
  @Field(() => AssignmentTypeGql, { nullable: true }) assignmentType: AssignmentType | null;
  @Field(() => DeliveryTaskStatusGql) status: DeliveryTaskStatus;
  @Field() needsAttention: boolean;
  @Field(() => String, { nullable: true }) attentionReason: string | null;
  @Field(() => ID, { nullable: true }) agentUserId: string | null;
  @Field(() => DeliveryAgentSummaryType, { nullable: true }) agent: DeliveryAgentSummaryType | null;
  @Field(() => String, { nullable: true }) ratePerKmSnapshot: string | null;
  @Field(() => String, { nullable: true }) selfStaffName: string | null;
  @Field(() => String, { nullable: true }) selfStaffPhone: string | null;
  @Field(() => AddressSnapshotType, { nullable: true }) pickupSnapshot: AddressSnapshotType | null;
  /** Full drop-off address. For agents it is only populated once the task is accepted. */
  @Field(() => AddressSnapshotType, { nullable: true }) dropoffSnapshot: AddressSnapshotType | null;
  @Field(() => String, { nullable: true }) dropoffArea: string | null;
  @Field(() => Number, { nullable: true }) pickupLat: number | null;
  @Field(() => Number, { nullable: true }) pickupLng: number | null;
  @Field(() => Number, { nullable: true }) dropoffLat: number | null;
  @Field(() => Number, { nullable: true }) dropoffLng: number | null;
  @Field(() => String, { nullable: true }) estimatedDistanceKm: string | null;
  @Field(() => String, { nullable: true }) measuredDistanceKm: string | null;
  /** Rate × estimated km. Always an estimate — final earnings depend on approved km. */
  @Field(() => String, { nullable: true }) estimatedEarnings: string | null;
  @Field() codAmount: string;
  @Field() requiresOtp: boolean;
  @Field(() => ProofOfDeliveryTypeGql, { nullable: true }) podType: ProofOfDeliveryType | null;
  @Field(() => String, { nullable: true }) podRecipientName: string | null;
  /** Proof-of-delivery photo; bytes via GET /delivery/files/:id. */
  @Field(() => ID, { nullable: true }) podFileId: string | null;
  @Field(() => Date, { nullable: true }) acceptedAt: Date | null;
  @Field(() => Date, { nullable: true }) pickedUpAt: Date | null;
  @Field(() => Date, { nullable: true }) deliveredAt: Date | null;
  @Field(() => Date, { nullable: true }) failedAt: Date | null;
  @Field(() => Date, { nullable: true }) cancelledAt: Date | null;
  @Field(() => String, { nullable: true }) failureReason: string | null;
  @Field(() => String, { nullable: true }) cancellationReason: string | null;
  @Field(() => Int) attemptNo: number;
  @Field(() => DeliveryOfferType, { nullable: true }) currentOffer: DeliveryOfferType | null;
  @Field() createdAt: Date;
  @Field() updatedAt: Date;
}

@ObjectType('DeliveryTaskPage')
export class DeliveryTaskPageType {
  @Field(() => [DeliveryTaskType]) items: DeliveryTaskType[];
  @Field(() => Int) total: number;
  @Field(() => Int) page: number;
  @Field(() => Int) pageSize: number;
}

@ObjectType('LocationPoint')
export class LocationPointType {
  @Field() lat: number;
  @Field() lng: number;
  @Field() recordedAt: Date;
  @Field(() => Number, { nullable: true }) accuracyM: number | null;
}

/** An open offer as the agent sees it — enough to decide, without exposing the full customer address. */
@ObjectType('AgentOffer')
export class AgentOfferType {
  @Field(() => DeliveryOfferType) offer: DeliveryOfferType;
  @Field(() => DeliveryTaskType) task: DeliveryTaskType;
}

@ObjectType('LocationPingResult')
export class LocationPingResultType {
  @Field() accepted: boolean;
  @Field() trackingActive: boolean;
  @Field(() => String, { nullable: true }) reason: string | null;
}
