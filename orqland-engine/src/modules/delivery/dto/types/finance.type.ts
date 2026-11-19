import { Field, ID, Int, ObjectType } from '@nestjs/graphql';
import type { CodCollectionMethod, CodStatus, DistanceSource, EarningStatus } from '@/infrastructure/database/schema';
import { CodCollectionMethodGql, CodStatusGql, DistanceSourceGql, EarningStatusGql } from '../enums/delivery.enums';

@ObjectType('CodSettlement')
export class CodSettlementType {
  @Field(() => ID) id: string;
  @Field() amount: string;
  @Field(() => CodCollectionMethodGql) method: CodCollectionMethod;
  @Field(() => String, { nullable: true }) note: string | null;
  @Field(() => String, { nullable: true }) recordedByName: string | null;
  @Field() createdAt: Date;
}

@ObjectType('CodRecord')
export class CodRecordType {
  @Field(() => ID) id: string;
  @Field(() => ID) taskId: string;
  @Field() taskNumber: string;
  @Field(() => ID) orderId: string;
  @Field() orderNumber: string;
  @Field(() => ID, { nullable: true }) agentUserId: string | null;
  @Field(() => String, { nullable: true }) agentName: string | null;
  @Field() expectedAmount: string;
  @Field(() => String, { nullable: true }) collectedAmount: string | null;
  @Field(() => CodCollectionMethodGql, { nullable: true }) collectionMethod: CodCollectionMethod | null;
  @Field(() => Date, { nullable: true }) collectedAt: Date | null;
  /** Payment-proof photo; bytes via GET /delivery/files/:id (workspace and agent only). */
  @Field(() => ID, { nullable: true }) collectionProofFileId: string | null;
  @Field() settledAmount: string;
  @Field() outstandingAmount: string;
  @Field(() => CodStatusGql) status: CodStatus;
  @Field(() => String, { nullable: true }) discrepancyReason: string | null;
  @Field(() => Date, { nullable: true }) resolvedAt: Date | null;
  @Field() createdAt: Date;
  @Field(() => [CodSettlementType]) settlements: CodSettlementType[];
}

@ObjectType('CodSummary')
export class CodSummaryType {
  @Field() expected: string;
  @Field() collected: string;
  @Field() settled: string;
  @Field() outstanding: string;
  @Field(() => Int) openRecords: number;
  @Field(() => Int) discrepancies: number;
}

@ObjectType('DeliveryEarning')
export class DeliveryEarningType {
  @Field(() => ID) id: string;
  @Field(() => ID) taskId: string;
  @Field() taskNumber: string;
  @Field() orderNumber: string;
  @Field(() => ID) orqspaceId: string;
  @Field() orqspaceName: string;
  @Field(() => ID) agentUserId: string;
  @Field() agentName: string;
  @Field(() => DistanceSourceGql) distanceSource: DistanceSource;
  @Field(() => String, { nullable: true }) estimatedDistanceKm: string | null;
  @Field(() => String, { nullable: true }) measuredDistanceKm: string | null;
  @Field() approvedBillableKm: string;
  @Field() ratePerKm: string;
  @Field() baseAmount: string;
  @Field() adjustmentTotal: string;
  @Field() finalAmount: string;
  @Field(() => EarningStatusGql) status: EarningStatus;
  @Field() periodMonth: string;
  @Field(() => Date, { nullable: true }) deliveredAt: Date | null;
  @Field(() => Date, { nullable: true }) approvedAt: Date | null;
  @Field(() => Date, { nullable: true }) paidAt: Date | null;
  @Field(() => String, { nullable: true }) payoutReference: string | null;
}

@ObjectType('DeliveryCostByAgent')
export class DeliveryCostByAgentType {
  @Field(() => ID) agentUserId: string;
  @Field() agentName: string;
  @Field(() => Int) deliveries: number;
  @Field() billableKm: string;
  @Field() amount: string;
  @Field() pendingAmount: string;
  @Field() approvedAmount: string;
  @Field() paidAmount: string;
}

@ObjectType('DeliveryCostReport')
export class DeliveryCostReportType {
  @Field() periodMonth: string;
  @Field(() => Int) deliveries: number;
  @Field() billableKm: string;
  @Field() totalAmount: string;
  @Field() pendingAmount: string;
  @Field() approvedAmount: string;
  @Field() paidAmount: string;
  @Field(() => Int) selfDeliveries: number;
  @Field(() => Int) failedDeliveries: number;
  @Field(() => [DeliveryCostByAgentType]) byAgent: DeliveryCostByAgentType[];
}

@ObjectType('AgentEarningsWindow')
export class AgentEarningsWindowType {
  @Field(() => Int) deliveries: number;
  @Field() billableKm: string;
  @Field() estimated: string;
  @Field() approved: string;
  @Field() paid: string;
}

@ObjectType('AgentEarningsSummary')
export class AgentEarningsSummaryType {
  @Field() periodMonth: string;
  @Field(() => AgentEarningsWindowType) today: AgentEarningsWindowType;
  @Field(() => AgentEarningsWindowType) month: AgentEarningsWindowType;
  @Field(() => [DeliveryEarningType]) recent: DeliveryEarningType[];
}

@ObjectType('AgentStatementWorkspaceLine')
export class AgentStatementWorkspaceLineType {
  @Field(() => ID) orqspaceId: string;
  @Field() orqspaceName: string;
  @Field(() => Int) deliveries: number;
  @Field() billableKm: string;
  @Field() amount: string;
}

/** Calendar-month statement (1st → last day) for one agent across all workspaces. */
@ObjectType('AgentStatement')
export class AgentStatementType {
  @Field() periodMonth: string;
  @Field() periodStart: string;
  @Field() periodEnd: string;
  @Field() isClosed: boolean;
  /** DRAFT while the month is open, FINAL once the month-end job has frozen it; null when nothing was earned. */
  @Field(() => String, { nullable: true }) status?: string | null;
  @Field(() => AgentEarningsWindowType) totals: AgentEarningsWindowType;
  @Field() adjustmentTotal: string;
  @Field() grandTotal: string;
  @Field(() => [AgentStatementWorkspaceLineType]) byWorkspace: AgentStatementWorkspaceLineType[];
  @Field(() => [DeliveryEarningType]) lines: DeliveryEarningType[];
  /** Ready-to-download CSV of the statement lines. */
  @Field() csv: string;
}

/** Stored monthly statement for one agent × workspace (DRAFT during the month, FINAL after close). */
@ObjectType('DeliveryStatement')
export class DeliveryStatementType {
  @Field(() => ID) id: string;
  @Field(() => ID) agentUserId: string;
  @Field() agentName: string;
  @Field() agentOrqUserId: string;
  @Field(() => ID) orqspaceId: string;
  @Field() orqspaceName: string;
  @Field() periodMonth: string;
  @Field() periodStart: string;
  @Field() periodEnd: string;
  /** DRAFT | FINAL */
  @Field() status: string;
  @Field(() => Int) deliveries: number;
  @Field() approvedKm: string;
  @Field() baseAmount: string;
  @Field() adjustments: string;
  @Field() finalAmount: string;
  @Field() paidAmount: string;
  @Field() outstandingAmount: string;
  @Field() codCollected: string;
  @Field() codSettled: string;
  @Field() generatedAt: Date;
  @Field(() => Date, { nullable: true }) finalizedAt: Date | null;
}

@ObjectType('AgentPerformance')
export class AgentPerformanceType {
  @Field() periodMonth: string;
  @Field(() => Int) offered: number;
  @Field(() => Int) accepted: number;
  @Field(() => Int) declined: number;
  @Field(() => Int) expired: number;
  @Field(() => Int) completed: number;
  @Field(() => Int) failed: number;
  @Field() trackedKm: string;
  @Field() billableKm: string;
  @Field() averageDistanceKm: string;
  @Field() averageEarningPerDelivery: string;
}

@ObjectType('AgentEarningsTrendPoint')
export class AgentEarningsTrendPointType {
  @Field() periodMonth: string;
  @Field(() => Int) deliveries: number;
  @Field() billableKm: string;
  @Field() amount: string;
}
