import { Field, ID, Int, ObjectType } from '@nestjs/graphql';
import type { ActorRole, AgentConnectionStatus } from '@/infrastructure/database/schema';
import { ActorRoleGql } from '@/modules/orders/dto/enums/order.enums';
import { AgentConnectionStatusGql } from '../enums/delivery.enums';
import { DeliveryAgentSummaryType } from './agent.type';

@ObjectType('AgentRateHistoryEntry')
export class AgentRateHistoryType {
  @Field(() => ID) id: string;
  @Field() ratePerKm: string;
  @Field() effectiveFrom: Date;
  @Field(() => String, { nullable: true }) reason: string | null;
}

@ObjectType('AgentConnection')
export class AgentConnectionType {
  @Field(() => ID) id: string;
  @Field(() => ID) orqspaceId: string;
  @Field() orqspaceName: string;
  @Field(() => ID) agentUserId: string;
  @Field(() => DeliveryAgentSummaryType) agent: DeliveryAgentSummaryType;
  @Field(() => AgentConnectionStatusGql) status: AgentConnectionStatus;
  @Field() currentRatePerKm: string;
  @Field(() => String, { nullable: true }) inviteMessage: string | null;
  @Field() invitedAt: Date;
  @Field() inviteExpiresAt: Date;
  @Field(() => Date, { nullable: true }) respondedAt: Date | null;
  @Field(() => Date, { nullable: true }) activatedAt: Date | null;
  @Field(() => Date, { nullable: true }) disconnectedAt: Date | null;
  @Field(() => String, { nullable: true }) disconnectReason: string | null;
  /** Pending disconnection (REQUESTED) — no new offers; closes when active deliveries reach zero. */
  @Field(() => String, { nullable: true }) disconnectRequestStatus: string | null;
  @Field(() => Date, { nullable: true }) disconnectRequestedAt: Date | null;
  @Field(() => ActorRoleGql, { nullable: true }) disconnectRequestedByRole: ActorRole | null;
  @Field(() => String, { nullable: true }) disconnectRequestReason: string | null;
  @Field(() => Int) activeTaskCount: number;
}

@ObjectType('AgentSearchResult')
export class AgentSearchResultType {
  @Field(() => DeliveryAgentSummaryType, { nullable: true }) agent: DeliveryAgentSummaryType | null;
  @Field() canInvite: boolean;
  /** Why the agent cannot be invited (not an agent, KYC invalid, limits reached, already connected…). */
  @Field(() => String, { nullable: true }) reason: string | null;
  @Field(() => AgentConnectionType, { nullable: true }) existingConnection: AgentConnectionType | null;
  @Field(() => Int) workspaceActiveConnections: number;
  @Field(() => Int) workspaceConnectionLimit: number;
}
