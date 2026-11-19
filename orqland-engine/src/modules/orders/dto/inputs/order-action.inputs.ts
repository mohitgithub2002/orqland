import { Field, ID, InputType, Int } from '@nestjs/graphql';
import { IsBoolean, IsDateString, IsIn, IsInt, IsNotEmpty, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min } from 'class-validator';
import type { OrderPaymentKind, OrderPaymentMethod, OrderPaymentRecordStatus } from '@/infrastructure/database/schema';
import { OrderPaymentKindGql, OrderPaymentMethodGql, OrderPaymentRecordStatusGql } from '../enums/order.enums';

@InputType()
export class OrderActionInput {
  @Field(() => ID) @IsUUID() orderId: string;
  @Field({ nullable: true }) @IsOptional() @IsString() @MaxLength(500) note?: string;
}

@InputType()
export class OrderReasonInput {
  @Field(() => ID) @IsUUID() orderId: string;
  @Field() @IsString() @IsNotEmpty() @MaxLength(500) reason: string;
}

@InputType()
export class MarkOrderReturnedInput {
  @Field(() => ID) @IsUUID() orderId: string;
  @Field() @IsString() @IsNotEmpty() @MaxLength(500) reason: string;
  /** Put returned stock back into LIMITED inventory. */
  @Field() @IsBoolean() restock: boolean;
}

@InputType()
export class RecordOrderPaymentInput {
  @Field(() => ID) @IsUUID() orderId: string;
  @Field(() => OrderPaymentKindGql) @IsIn(Object.keys(OrderPaymentKindGql)) kind: OrderPaymentKind;
  @Field(() => OrderPaymentMethodGql) @IsIn(Object.keys(OrderPaymentMethodGql)) method: OrderPaymentMethod;
  @Field(() => OrderPaymentRecordStatusGql, { defaultValue: 'SUCCEEDED' })
  @IsIn(['SUCCEEDED', 'FAILED'])
  status: OrderPaymentRecordStatus = 'SUCCEEDED';
  @Field() @Matches(/^\d{1,10}(\.\d{1,2})?$/) amount: string;
  @Field({ nullable: true }) @IsOptional() @IsString() @MaxLength(40) provider?: string;
  @Field({ nullable: true }) @IsOptional() @IsString() @MaxLength(120) providerReference?: string;
  @Field({ nullable: true }) @IsOptional() @IsString() @MaxLength(500) failureReason?: string;
}

@InputType()
export class AcceptOrderInput {
  @Field(() => ID) @IsUUID() orderId: string;
  @Field({ nullable: true }) @IsOptional() @IsString() @MaxLength(500) note?: string;
  /** "Accept & Start Prep": accept and start the preparation timer in one step. */
  @Field({ nullable: true, defaultValue: false }) @IsOptional() @IsBoolean() startPreparation?: boolean;
  @Field(() => Int, { nullable: true }) @IsOptional() @IsInt() @Min(1) @Max(480) preparationMinutes?: number;
}

@InputType()
export class StartPreparationInput {
  @Field(() => ID) @IsUUID() orderId: string;
  /** Preparation time in minutes (defaults to ORDER_DEFAULT_PREPARATION_MINUTES). */
  @Field(() => Int, { nullable: true }) @IsOptional() @IsInt() @Min(1) @Max(480) preparationMinutes?: number;
  @Field({ nullable: true }) @IsOptional() @IsString() @MaxLength(500) note?: string;
}

@InputType()
export class ExtendPreparationInput {
  @Field(() => ID) @IsUUID() orderId: string;
  /** Minutes to add (defaults to ORDER_PREPARATION_EXTENSION_MINUTES, i.e. "+2 Mins"). */
  @Field(() => Int, { nullable: true }) @IsOptional() @IsInt() @Min(1) @Max(60) minutes?: number;
}

@InputType()
export class ScheduleReturnPickupInput {
  @Field(() => ID) @IsUUID() orderId: string;
  /** YYYY-MM-DD, today or later. */
  @Field() @IsDateString({ strict: true }) pickupDate: string;
}

@InputType()
export class ApproveRefundInput {
  @Field(() => ID) @IsUUID() orderId: string;
  @Field({ nullable: true }) @IsOptional() @IsString() @MaxLength(120) providerReference?: string;
}
