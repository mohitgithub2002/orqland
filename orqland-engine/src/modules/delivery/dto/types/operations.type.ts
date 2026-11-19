import { Field, Float, ID, Int, ObjectType } from '@nestjs/graphql';
import type { DeliveryAgentAvailability } from '@/infrastructure/database/schema';
import { DeliveryAgentAvailabilityGql } from '../enums/delivery.enums';

@ObjectType('OperationsQueue')
export class OperationsQueueType {
  @Field(() => Int) newOrders: number;
  @Field(() => Int) preparing: number;
  @Field(() => Int) readyForFulfilment: number;
  @Field(() => Int) awaitingPickup: number;
  @Field(() => Int) outForDelivery: number;
  @Field(() => Int) deliveryFailed: number;
}

@ObjectType('OperationsDeliveries')
export class OperationsDeliveriesType {
  @Field(() => Int) unassigned: number;
  @Field(() => Int) offered: number;
  @Field(() => Int) toPickup: number;
  @Field(() => Int) inTransit: number;
  @Field(() => Int) needsAttention: number;
  @Field(() => Int) openOffers: number;
  @Field(() => Int) deliveredToday: number;
  @Field(() => Int) failedToday: number;
}

@ObjectType('OperationsSlaTargets')
export class OperationsSlaTargetsType {
  @Field(() => Int) orderAcceptMinutes: number;
  @Field(() => Int) assignMinutes: number;
  @Field(() => Int) pickupMinutes: number;
  @Field(() => Int) deliverMinutes: number;
}

/** Medians and SLA attainment over the trailing window (MTTA/MTTR-style operational timings). */
@ObjectType('OperationsTimings')
export class OperationsTimingsType {
  @Field(() => Int) windowDays: number;
  @Field(() => Float, { nullable: true }) medianOrderAcceptMinutes: number | null;
  @Field(() => Float, { nullable: true }) medianAssignMinutes: number | null;
  @Field(() => Float, { nullable: true }) medianPickupMinutes: number | null;
  @Field(() => Float, { nullable: true }) medianDeliverMinutes: number | null;
  @Field(() => Float, { nullable: true }) medianEndToEndMinutes: number | null;
  @Field(() => Float, { nullable: true }) orderAcceptSlaPercent: number | null;
  @Field(() => Float, { nullable: true }) deliverySlaPercent: number | null;
  @Field(() => Float, { nullable: true }) successRatePercent: number | null;
  @Field(() => String, { nullable: true }) averageDistanceKm: string | null;
  @Field(() => OperationsSlaTargetsType) slaTargets: OperationsSlaTargetsType;
}

@ObjectType('AgentWorkload')
export class AgentWorkloadType {
  @Field(() => ID) agentUserId: string;
  @Field() displayName: string;
  @Field() orqUserId: string;
  @Field(() => DeliveryAgentAvailabilityGql) availability: DeliveryAgentAvailability;
  @Field(() => Int) activeTasks: number;
  @Field(() => Int) deliveredToday: number;
  @Field(() => Int) maxConcurrentTasks: number;
  @Field() ratePerKm: string;
  @Field(() => Date, { nullable: true }) lastLocationAt: Date | null;
  @Field() locationStale: boolean;
  @Field() disconnectPending: boolean;
}

@ObjectType('OperationsAgents')
export class OperationsAgentsType {
  @Field(() => Int) connected: number;
  @Field(() => Int) connectionLimit: number;
  @Field(() => Int) online: number;
  @Field(() => Int) busy: number;
  @Field(() => Int) offline: number;
  @Field(() => Int) staleLocation: number;
  @Field(() => [AgentWorkloadType]) workload: AgentWorkloadType[];
}

@ObjectType('OperationsCod')
export class OperationsCodType {
  /** Cash collected by agents and not yet handed over. */
  @Field() outstanding: string;
  @Field() expectedOpen: string;
  @Field(() => Int) discrepancies: number;
}

@ObjectType('SlaBreach')
export class SlaBreachType {
  /** ORDER_ACCEPT | DELIVERY */
  @Field() kind: string;
  @Field(() => ID) orderId: string;
  @Field(() => ID, { nullable: true }) taskId: string | null;
  @Field() reference: string;
  @Field() stage: string;
  @Field(() => Float) minutesOver: number;
  @Field(() => Int) targetMinutes: number;
}

@ObjectType('OperationsTrendPoint')
export class OperationsTrendPointType {
  @Field() day: string;
  @Field(() => Int) delivered: number;
  @Field(() => Int) failed: number;
}

@ObjectType('DeliveryOperations')
export class DeliveryOperationsType {
  @Field(() => ID) orqspaceId: string;
  @Field() generatedAt: Date;
  @Field() timezone: string;
  @Field(() => OperationsQueueType) queue: OperationsQueueType;
  @Field(() => OperationsDeliveriesType) deliveries: OperationsDeliveriesType;
  @Field(() => OperationsTimingsType) timings: OperationsTimingsType;
  @Field(() => OperationsAgentsType) agents: OperationsAgentsType;
  @Field(() => OperationsCodType) cod: OperationsCodType;
  @Field(() => [SlaBreachType]) breaches: SlaBreachType[];
  @Field(() => [OperationsTrendPointType]) trend: OperationsTrendPointType[];
}
