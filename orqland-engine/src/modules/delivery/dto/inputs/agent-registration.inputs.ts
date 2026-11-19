import { Field, ID, InputType } from '@nestjs/graphql';
import {
  ArrayMinSize,
  Equals,
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';
import type { KycCheckType, VehicleCategory } from '@/infrastructure/database/schema';
import { KycCheckTypeGql, VehicleCategoryGql } from '../enums/delivery.enums';

const REGISTRABLE_CATEGORIES = Object.keys(VehicleCategoryGql).filter((c) => c !== 'BICYCLE');

@InputType()
export class RegisterDeliveryAgentInput {
  @Field() @IsString() @MinLength(10) @MaxLength(24) licenceNumber: string;
  /** Required by the driving-licence verification API. YYYY-MM-DD. */
  @Field() @IsDateString({ strict: true }) dateOfBirth: string;
  @Field() @IsString() @MinLength(6) @MaxLength(16) vehicleNumber: string;
  @Field(() => VehicleCategoryGql) @IsIn(REGISTRABLE_CATEGORIES) vehicleCategory: VehicleCategory;
  /** Licence images uploaded first through POST /delivery/files?purpose=LICENCE_FRONT / LICENCE_BACK. */
  @Field(() => ID) @IsUUID() licenceFrontFileId: string;
  @Field(() => ID) @IsUUID() licenceBackFileId: string;
  /** Optional photo/PDF of the vehicle RC (purpose=VEHICLE_RC). */
  @Field(() => ID, { nullable: true }) @IsOptional() @IsUUID() vehicleRcFileId?: string;
  /** Explicit consent for identity/document checks and data handling. Must be true. */
  @Field() @IsBoolean() @Equals(true, { message: 'Consent is required' }) consent: boolean;
}

@InputType()
export class ReverifyKycInput {
  @Field(() => [KycCheckTypeGql])
  @IsArray()
  @ArrayMinSize(1)
  @IsIn(Object.keys(KycCheckTypeGql), { each: true })
  checks: KycCheckType[];
}

@InputType()
export class ChangeVehicleInput {
  @Field() @IsString() @MinLength(6) @MaxLength(16) vehicleNumber: string;
  @Field(() => VehicleCategoryGql) @IsIn(REGISTRABLE_CATEGORIES) vehicleCategory: VehicleCategory;
  @Field(() => ID, { nullable: true }) @IsOptional() @IsUUID() vehicleRcFileId?: string;
}

@InputType()
export class AdminAgentActionInput {
  @Field(() => ID) @IsUUID() userId: string;
  @Field() @IsString() @IsNotEmpty() @MaxLength(500) reason: string;
}

@InputType()
export class AdminReviewDecisionInput {
  @Field(() => ID) @IsUUID() userId: string;
  @Field() @IsBoolean() approve: boolean;
  @Field() @IsString() @IsNotEmpty() @MaxLength(500) reason: string;
}
