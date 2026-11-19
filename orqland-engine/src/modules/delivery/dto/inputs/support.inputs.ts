import { Field, ID, InputType, Int } from '@nestjs/graphql';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import type { DeliveryAgentStatus, SupportTicketCategory, SupportTicketPriority, SupportTicketStatus } from '@/infrastructure/database/schema';
import {
  DeliveryAgentStatusGql,
  SupportTicketCategoryGql,
  SupportTicketPriorityGql,
  SupportTicketStatusGql,
} from '../enums/delivery.enums';
import { PeriodMatches } from './settings.inputs';

@InputType()
export class CreateSupportTicketInput {
  @Field(() => SupportTicketCategoryGql) @IsIn(Object.keys(SupportTicketCategoryGql)) category: SupportTicketCategory;
  @Field() @IsString() @IsNotEmpty() @MaxLength(160) subject: string;
  @Field() @IsString() @IsNotEmpty() @MaxLength(4000) description: string;
  @Field(() => ID, { nullable: true }) @IsOptional() @IsUUID() relatedTaskId?: string;
  @Field(() => ID, { nullable: true }) @IsOptional() @IsUUID() relatedEarningId?: string;
  @Field(() => ID, { nullable: true }) @IsOptional() @IsUUID() relatedConnectionId?: string;
  @Field({ nullable: true }) @IsOptional() @PeriodMatches() relatedPeriodMonth?: string;
  @Field(() => [String], { nullable: true })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(5)
  @IsUrl({}, { each: true })
  attachmentUrls?: string[];
  /** Files uploaded through POST /delivery/files?purpose=SUPPORT_ATTACHMENT. */
  @Field(() => [ID], { nullable: true })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(5)
  @IsUUID('all', { each: true })
  attachmentFileIds?: string[];
}

@InputType()
export class ReplySupportTicketInput {
  @Field(() => ID) @IsUUID() ticketId: string;
  @Field() @IsString() @IsNotEmpty() @MaxLength(4000) body: string;
  @Field(() => [String], { nullable: true })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(5)
  @IsUrl({}, { each: true })
  attachmentUrls?: string[];
  /** Files uploaded through POST /delivery/files?purpose=SUPPORT_ATTACHMENT. */
  @Field(() => [ID], { nullable: true })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(5)
  @IsUUID('all', { each: true })
  attachmentFileIds?: string[];
  /** Support only: note visible to staff, not to the agent. */
  @Field({ nullable: true }) @IsOptional() @IsBoolean() internal?: boolean;
}

@InputType()
export class UpdateSupportTicketInput {
  @Field(() => ID) @IsUUID() ticketId: string;
  @Field(() => SupportTicketStatusGql, { nullable: true }) @IsOptional() @IsIn(Object.keys(SupportTicketStatusGql)) status?: SupportTicketStatus;
  @Field(() => SupportTicketPriorityGql, { nullable: true })
  @IsOptional()
  @IsIn(Object.keys(SupportTicketPriorityGql))
  priority?: SupportTicketPriority;
  @Field({ nullable: true }) @IsOptional() @IsString() @MaxLength(60) assignedTeam?: string;
}

@InputType()
export class SupportTicketsFilterInput {
  @Field(() => [SupportTicketStatusGql], { nullable: true })
  @IsOptional()
  @IsArray()
  @IsIn(Object.keys(SupportTicketStatusGql), { each: true })
  statuses?: SupportTicketStatus[];
  @Field(() => [SupportTicketCategoryGql], { nullable: true })
  @IsOptional()
  @IsArray()
  @IsIn(Object.keys(SupportTicketCategoryGql), { each: true })
  categories?: SupportTicketCategory[];
  @Field({ nullable: true }) @IsOptional() @IsString() @MaxLength(60) search?: string;
  @Field(() => Int, { defaultValue: 1 }) @IsInt() @Min(1) page: number = 1;
  @Field(() => Int, { defaultValue: 25 }) @IsInt() @Min(1) @Max(100) pageSize: number = 25;
}

@InputType()
export class PlatformAgentsFilterInput {
  @Field(() => [DeliveryAgentStatusGql], { nullable: true })
  @IsOptional()
  @IsArray()
  @IsIn(Object.keys(DeliveryAgentStatusGql), { each: true })
  statuses?: DeliveryAgentStatus[];
  /** Orq ID or name. */
  @Field({ nullable: true }) @IsOptional() @IsString() @MaxLength(60) search?: string;
  @Field(() => Int, { defaultValue: 1 }) @IsInt() @Min(1) page: number = 1;
  @Field(() => Int, { defaultValue: 25 }) @IsInt() @Min(1) @Max(100) pageSize: number = 25;
}
