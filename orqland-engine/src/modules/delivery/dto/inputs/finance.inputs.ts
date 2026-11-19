import { Field, ID, InputType } from '@nestjs/graphql';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
} from 'class-validator';
import type { CodCollectionMethod, CodStatus, EarningStatus } from '@/infrastructure/database/schema';
import {
  CodCollectionMethodGql,
  CodResolutionGql,
  CodStatusGql,
  EarningStatusGql,
  type CodResolution,
} from '../enums/delivery.enums';
import { PeriodMatches } from './settings.inputs';

const AMOUNT = /^\d{1,10}(\.\d{1,2})?$/;
const SIGNED_AMOUNT = /^-?\d{1,10}(\.\d{1,2})?$/;
const KM = /^\d{1,5}(\.\d{1,2})?$/;

@InputType()
export class CodFilterInput {
  @Field(() => ID) @IsUUID() orqspaceId: string;
  @Field(() => [CodStatusGql], { nullable: true })
  @IsOptional()
  @IsArray()
  @IsIn(Object.keys(CodStatusGql), { each: true })
  statuses?: CodStatus[];
}

@InputType()
export class RecordCodSettlementInput {
  @Field(() => ID) @IsUUID() codRecordId: string;
  @Field() @Matches(AMOUNT) amount: string;
  @Field(() => CodCollectionMethodGql) @IsIn(Object.keys(CodCollectionMethodGql)) method: CodCollectionMethod;
  @Field({ nullable: true }) @IsOptional() @IsString() @MaxLength(500) note?: string;
}

@InputType()
export class ResolveCodInput {
  @Field(() => ID) @IsUUID() codRecordId: string;
  @Field(() => CodResolutionGql) @IsIn(Object.keys(CodResolutionGql)) resolution: CodResolution;
  @Field() @IsString() @IsNotEmpty() @MaxLength(500) reason: string;
}

@InputType()
export class EarningsFilterInput {
  @Field(() => ID) @IsUUID() orqspaceId: string;
  @Field({ nullable: true }) @IsOptional() @PeriodMatches() periodMonth?: string;
  @Field(() => [EarningStatusGql], { nullable: true })
  @IsOptional()
  @IsArray()
  @IsIn(Object.keys(EarningStatusGql), { each: true })
  statuses?: EarningStatus[];
  @Field(() => ID, { nullable: true }) @IsOptional() @IsUUID() agentUserId?: string;
}

@InputType()
export class ApproveEarningInput {
  @Field(() => ID) @IsUUID() earningId: string;
  /** Override the default billable km (requires a reason). */
  @Field({ nullable: true }) @IsOptional() @Matches(KM) approvedBillableKm?: string;
  @Field({ nullable: true }) @IsOptional() @IsString() @MaxLength(500) reason?: string;
}

@InputType()
export class AdjustEarningInput {
  @Field(() => ID) @IsUUID() earningId: string;
  @Field() @Matches(SIGNED_AMOUNT) amount: string;
  @Field() @IsString() @IsNotEmpty() @MaxLength(500) reason: string;
}

@InputType()
export class MarkEarningsPaidInput {
  @Field(() => ID) @IsUUID() orqspaceId: string;
  @Field(() => [ID]) @IsArray() @ArrayMinSize(1) @ArrayMaxSize(200) @IsUUID('all', { each: true }) earningIds: string[];
  @Field() @IsString() @IsNotEmpty() @MaxLength(120) payoutReference: string;
}

@InputType()
export class CostReportInput {
  @Field(() => ID) @IsUUID() orqspaceId: string;
  @Field() @PeriodMatches() periodMonth: string;
}
