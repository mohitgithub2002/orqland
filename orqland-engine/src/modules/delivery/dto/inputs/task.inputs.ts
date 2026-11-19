import { Field, ID, InputType, Int } from '@nestjs/graphql';
import {
  IsArray,
  IsBoolean,
  IsDate,
  IsIn,
  IsInt,
  IsLatitude,
  IsLongitude,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import type {
  AssignmentType,
  CodCollectionMethod,
  DeliveryMode,
  DeliveryTaskStatus,
} from '@/infrastructure/database/schema';
import {
  AssignmentTypeGql,
  CodCollectionMethodGql,
  DeliveryModeGql,
  DeliveryTaskStatusGql,
} from '../enums/delivery.enums';

@InputType()
export class DispatchOrderInput {
  @Field(() => ID) @IsUUID() orderId: string;
  @Field(() => DeliveryModeGql) @IsIn(Object.keys(DeliveryModeGql)) mode: DeliveryMode;
  /** AGENT mode only. */
  @Field(() => AssignmentTypeGql, { nullable: true })
  @IsOptional()
  @IsIn(Object.keys(AssignmentTypeGql))
  assignmentType?: AssignmentType;
  /** AGENT + MANUAL: the connected agent to offer the task to. */
  @Field(() => ID, { nullable: true }) @IsOptional() @IsUUID() agentUserId?: string;
  /** SELF mode: staff member handling the delivery. */
  @Field({ nullable: true }) @IsOptional() @IsString() @MaxLength(150) selfStaffName?: string;
  @Field({ nullable: true }) @IsOptional() @IsString() @MaxLength(20) selfStaffPhone?: string;
}

@InputType()
export class ReassignTaskInput {
  @Field(() => ID) @IsUUID() taskId: string;
  @Field(() => AssignmentTypeGql) @IsIn(Object.keys(AssignmentTypeGql)) assignmentType: AssignmentType;
  @Field(() => ID, { nullable: true }) @IsOptional() @IsUUID() agentUserId?: string;
  @Field() @IsString() @IsNotEmpty() @MaxLength(500) reason: string;
}

@InputType()
export class TaskReasonInput {
  @Field(() => ID) @IsUUID() taskId: string;
  @Field() @IsString() @IsNotEmpty() @MaxLength(500) reason: string;
}

@InputType()
export class TaskActionInput {
  @Field(() => ID) @IsUUID() taskId: string;
  @Field({ nullable: true }) @IsOptional() @IsLatitude() lat?: number;
  @Field({ nullable: true }) @IsOptional() @IsLongitude() lng?: number;
  /** Reported GPS accuracy in metres (used by the pickup geofence). */
  @Field({ nullable: true }) @IsOptional() @IsNumber() @Min(0) @Max(100000) accuracyM?: number;
}

@InputType()
export class CompleteDeliveryInput {
  @Field(() => ID) @IsUUID() taskId: string;
  @Field({ nullable: true }) @IsOptional() @Matches(/^\d{4}$/) otp?: string;
  @Field({ nullable: true }) @IsOptional() @IsString() @MaxLength(150) recipientName?: string;
  @Field({ nullable: true }) @IsOptional() @IsUrl() @MaxLength(1000) photoUrl?: string;
  /** Proof-of-delivery photo uploaded through POST /delivery/files?purpose=PROOF_OF_DELIVERY. */
  @Field(() => ID, { nullable: true }) @IsOptional() @IsUUID() photoFileId?: string;
  /** Photo of the UPI/other payment confirmation (purpose=COD_PROOF). */
  @Field(() => ID, { nullable: true }) @IsOptional() @IsUUID() codProofFileId?: string;
  /** Required for COD tasks — the cash actually collected. */
  @Field({ nullable: true }) @IsOptional() @Matches(/^\d{1,10}(\.\d{1,2})?$/) codCollectedAmount?: string;
  @Field(() => CodCollectionMethodGql, { nullable: true })
  @IsOptional()
  @IsIn(Object.keys(CodCollectionMethodGql))
  codMethod?: CodCollectionMethod;
  @Field({ nullable: true }) @IsOptional() @IsLatitude() lat?: number;
  @Field({ nullable: true }) @IsOptional() @IsLongitude() lng?: number;
}

@InputType()
export class FailDeliveryInput {
  @Field(() => ID) @IsUUID() taskId: string;
  @Field() @IsString() @IsNotEmpty() @MaxLength(500) reason: string;
  @Field({ nullable: true }) @IsOptional() @IsLatitude() lat?: number;
  @Field({ nullable: true }) @IsOptional() @IsLongitude() lng?: number;
}

@InputType()
export class OfferResponseInput {
  @Field(() => ID) @IsUUID() offerId: string;
  @Field({ nullable: true }) @IsOptional() @IsString() @MaxLength(280) reason?: string;
}

@InputType()
export class WorkspaceTasksFilterInput {
  @Field(() => ID) @IsUUID() orqspaceId: string;
  @Field(() => [DeliveryTaskStatusGql], { nullable: true })
  @IsOptional()
  @IsArray()
  @IsIn(Object.keys(DeliveryTaskStatusGql), { each: true })
  statuses?: DeliveryTaskStatus[];
  @Field({ nullable: true }) @IsOptional() @IsBoolean() needsAttention?: boolean;
  @Field({ nullable: true }) @IsOptional() @IsString() @MaxLength(40) search?: string;
  @Field(() => Int, { defaultValue: 1 }) @IsInt() @Min(1) page: number = 1;
  @Field(() => Int, { defaultValue: 25 }) @IsInt() @Min(1) @Max(100) pageSize: number = 25;
}

@InputType()
export class LocationPingInput {
  @Field() @IsLatitude() lat: number;
  @Field() @IsLongitude() lng: number;
  @Field({ nullable: true }) @IsOptional() @IsNumber() @Min(0) accuracyM?: number;
  @Field({ nullable: true }) @IsOptional() @IsNumber() @Min(0) speedMps?: number;
  @Field({ nullable: true }) @IsOptional() @IsNumber() @Min(0) @Max(360) heading?: number;
  @Field() @IsDate() recordedAt: Date;
}

@InputType()
export class SelfDeliveryUpdateInput {
  @Field(() => ID) @IsUUID() taskId: string;
  /** PICKED_UP · IN_TRANSIT · DELIVERED · FAILED · RETURNED_TO_ORIGIN */
  @Field(() => DeliveryTaskStatusGql)
  @IsIn(['PICKED_UP', 'IN_TRANSIT', 'DELIVERED', 'FAILED', 'RETURNED_TO_ORIGIN'])
  step: 'PICKED_UP' | 'IN_TRANSIT' | 'DELIVERED' | 'FAILED' | 'RETURNED_TO_ORIGIN';
  @Field({ nullable: true }) @IsOptional() @IsString() @MaxLength(500) reason?: string;
  @Field({ nullable: true }) @IsOptional() @Matches(/^\d{4}$/) otp?: string;
  @Field({ nullable: true }) @IsOptional() @IsString() @MaxLength(150) recipientName?: string;
  @Field({ nullable: true }) @IsOptional() @Matches(/^\d{1,10}(\.\d{1,2})?$/) codCollectedAmount?: string;
  @Field(() => CodCollectionMethodGql, { nullable: true })
  @IsOptional()
  @IsIn(Object.keys(CodCollectionMethodGql))
  codMethod?: CodCollectionMethod;
}
