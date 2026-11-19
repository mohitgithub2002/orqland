import { Field, ID, InputType, Int } from '@nestjs/graphql';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsLatitude,
  IsLongitude,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import type { AssignmentStrategy } from '@/infrastructure/database/schema';
import { AssignmentStrategyGql } from '../enums/delivery.enums';

@InputType()
export class PickupAddressInput {
  @Field({ nullable: true }) @IsOptional() @IsString() @MaxLength(150) recipientName?: string;
  @Field({ nullable: true }) @IsOptional() @IsString() @MaxLength(20) recipientPhone?: string;
  @Field({ nullable: true }) @IsOptional() @IsString() @MaxLength(50) doorNo?: string;
  @Field({ nullable: true }) @IsOptional() @IsString() @MaxLength(255) street?: string;
  @Field({ nullable: true }) @IsOptional() @IsString() @MaxLength(255) landmark?: string;
  @Field({ nullable: true }) @IsOptional() @IsString() @MaxLength(100) city?: string;
  @Field({ nullable: true }) @IsOptional() @IsString() @MaxLength(100) district?: string;
  @Field({ nullable: true }) @IsOptional() @IsString() @MaxLength(100) state?: string;
  @Field({ nullable: true }) @IsOptional() @IsString() @MaxLength(100) country?: string;
  @Field({ nullable: true }) @IsOptional() @IsString() @MaxLength(12) pincode?: string;
}

@InputType()
export class UpdateDeliverySettingsInput {
  @Field(() => ID) @IsUUID() orqspaceId: string;
  @Field({ nullable: true }) @IsOptional() @IsString() @MaxLength(64) timezone?: string;
  @Field(() => PickupAddressInput, { nullable: true })
  @IsOptional()
  @ValidateNested()
  @Type(() => PickupAddressInput)
  pickupAddress?: PickupAddressInput;
  @Field({ nullable: true }) @IsOptional() @IsLatitude() pickupLat?: number;
  @Field({ nullable: true }) @IsOptional() @IsLongitude() pickupLng?: number;
  @Field({ nullable: true }) @IsOptional() @IsBoolean() autoAssignEnabled?: boolean;
  @Field(() => AssignmentStrategyGql, { nullable: true })
  @IsOptional()
  @IsIn(Object.keys(AssignmentStrategyGql))
  assignmentStrategy?: AssignmentStrategy;
  @Field(() => Int, { nullable: true }) @IsOptional() @IsInt() @Min(15) @Max(900) offerTimeoutSeconds?: number;
  @Field(() => Int, { nullable: true }) @IsOptional() @IsInt() @Min(1) @Max(20) maxOfferAttempts?: number;
  @Field({ nullable: true }) @IsOptional() @IsNumber() @Min(1) @Max(200) maxPickupRadiusKm?: number;
  @Field({ nullable: true }) @IsOptional() @IsNumber() @Min(1) @Max(3) roadDistanceFactor?: number;
  @Field({ nullable: true }) @IsOptional() @IsBoolean() requireDeliveryOtp?: boolean;
}

export const PERIOD_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;
export const PeriodMatches = () => Matches(PERIOD_PATTERN, { message: 'Period must be YYYY-MM' });
