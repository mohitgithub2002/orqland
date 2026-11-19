import { Field, ID, Int, ObjectType } from '@nestjs/graphql';
import type { AssignmentStrategy } from '@/infrastructure/database/schema';
import { AddressSnapshotType } from '@/modules/orders/dto/types/order.type';
import { AssignmentStrategyGql } from '../enums/delivery.enums';

@ObjectType('OrqspaceDeliverySettings')
export class DeliverySettingsType {
  @Field(() => ID) orqspaceId: string;
  @Field() timezone: string;
  @Field(() => AddressSnapshotType, { nullable: true }) pickupAddress: AddressSnapshotType | null;
  @Field(() => Number, { nullable: true }) pickupLat: number | null;
  @Field(() => Number, { nullable: true }) pickupLng: number | null;
  @Field() autoAssignEnabled: boolean;
  @Field(() => AssignmentStrategyGql) assignmentStrategy: AssignmentStrategy;
  @Field(() => Int) offerTimeoutSeconds: number;
  @Field(() => Int) maxOfferAttempts: number;
  @Field() maxPickupRadiusKm: string;
  @Field() roadDistanceFactor: string;
  @Field() requireDeliveryOtp: boolean;
  @Field(() => Int) activeAgentCount: number;
  @Field(() => Int) agentLimit: number;
  /** Agent dispatch needs a pickup location. */
  @Field() readyForAgentDispatch: boolean;
}
