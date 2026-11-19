import { Field, ID, InputType } from '@nestjs/graphql';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
} from 'class-validator';
import type { AgentConnectionStatus } from '@/infrastructure/database/schema';
import { AgentConnectionStatusGql } from '../enums/delivery.enums';

const RATE = /^\d{1,5}(\.\d{1,2})?$/;

@InputType()
export class SearchDeliveryAgentInput {
  @Field(() => ID) @IsUUID() orqspaceId: string;
  /** Orq ID only — no search by phone, licence or vehicle number. */
  @Field() @IsString() @Matches(/^[A-Za-z0-9]{4,14}$/) orqUserId: string;
}

@InputType()
export class InviteDeliveryAgentInput {
  @Field(() => ID) @IsUUID() orqspaceId: string;
  @Field() @IsString() @Matches(/^[A-Za-z0-9]{4,14}$/) orqUserId: string;
  @Field() @Matches(RATE, { message: 'Rate must be a positive amount with up to 2 decimals' }) ratePerKm: string;
  @Field({ nullable: true }) @IsOptional() @IsString() @MaxLength(280) message?: string;
}

@InputType()
export class RespondToInvitationInput {
  @Field(() => ID) @IsUUID() connectionId: string;
  @Field() @IsBoolean() accept: boolean;
}

@InputType()
export class UpdateConnectionRateInput {
  @Field(() => ID) @IsUUID() connectionId: string;
  @Field() @Matches(RATE) ratePerKm: string;
  @Field() @IsString() @IsNotEmpty() @MaxLength(280) reason: string;
}

@InputType()
export class ConnectionReasonInput {
  @Field(() => ID) @IsUUID() connectionId: string;
  @Field() @IsString() @IsNotEmpty() @MaxLength(500) reason: string;
  /**
   * Disconnect only: when the agent still has active deliveries for the workspace, record a disconnect
   * request instead of refusing. New offers stop immediately; the connection closes automatically once
   * the last active delivery is finished (guide §Workspaces: "request disconnection and track pending requests").
   */
  @Field({ nullable: true, defaultValue: false }) @IsOptional() @IsBoolean() afterActiveDeliveries?: boolean;
}

@InputType()
export class WorkspaceConnectionsFilterInput {
  @Field(() => ID) @IsUUID() orqspaceId: string;
  @Field(() => [AgentConnectionStatusGql], { nullable: true })
  @IsOptional()
  @IsArray()
  @IsIn(Object.keys(AgentConnectionStatusGql), { each: true })
  statuses?: AgentConnectionStatus[];
}
