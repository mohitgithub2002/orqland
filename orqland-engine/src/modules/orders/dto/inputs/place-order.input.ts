import { Field, ID, InputType, Int } from '@nestjs/graphql';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import type { OrderPaymentMethod, OrderRequestedFulfilment } from '@/infrastructure/database/schema';
import { MAX_ITEMS_PER_CHECKOUT, MAX_QUANTITY_PER_LINE } from '../../helpers/orderable';
import { OrderPaymentMethodGql, OrderRequestedFulfilmentGql } from '../enums/order.enums';

@InputType()
export class PlaceOrderItemInput {
  @Field(() => ID) @IsUUID() listingId: string;
  @Field(() => ID, { nullable: true }) @IsOptional() @IsUUID() variantId?: string;
  @Field(() => Int) @IsInt() @Min(1) @Max(MAX_QUANTITY_PER_LINE) quantity: number;
}

@InputType()
export class PlaceOrderInput {
  /** Client-generated key; retries with the same key return the original orders. */
  @Field() @IsString() @Matches(/^[A-Za-z0-9_-]{8,64}$/) idempotencyKey: string;

  @Field(() => [PlaceOrderItemInput])
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_ITEMS_PER_CHECKOUT)
  @ValidateNested({ each: true })
  @Type(() => PlaceOrderItemInput)
  items: PlaceOrderItemInput[];

  @Field(() => OrderPaymentMethodGql) @IsIn(Object.keys(OrderPaymentMethodGql)) paymentMethod: OrderPaymentMethod;

  @Field(() => OrderRequestedFulfilmentGql)
  @IsIn(Object.keys(OrderRequestedFulfilmentGql))
  requestedFulfilment: OrderRequestedFulfilment;

  /** Required when requestedFulfilment = DELIVERY. Snapshotted at order time. */
  @Field(() => ID, { nullable: true }) @IsOptional() @IsUUID() addressId?: string;

  @Field({ nullable: true }) @IsOptional() @IsString() @MaxLength(500) customerNote?: string;

  /** Optional: deliver / be ready for pickup at this time (ISO 8601). Empty = as soon as possible. */
  @Field({ nullable: true }) @IsOptional() @IsDateString() scheduledFor?: string;
}
