import { Field, ID, InputType, Int } from '@nestjs/graphql';
import { IsArray, IsIn, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';
import type { OrderPaymentMethod, OrderStatus } from '@/infrastructure/database/schema';
import { ORDER_QUEUES, type OrderQueue } from '../../helpers/order-queues';
import { OrderPaymentMethodGql, OrderQueueGql, OrderStatusGql } from '../enums/order.enums';

@InputType()
export class OrqspaceOrdersFilterInput {
  @Field(() => ID) @IsUUID() orqspaceId: string;

  @Field(() => [OrderStatusGql], { nullable: true })
  @IsOptional()
  @IsArray()
  @IsIn(Object.keys(OrderStatusGql), { each: true })
  statuses?: OrderStatus[];

  /** Page tab; combined with `statuses` when both are given. */
  @Field(() => OrderQueueGql, { nullable: true })
  @IsOptional()
  @IsIn(ORDER_QUEUES)
  queue?: OrderQueue;

  @Field(() => OrderPaymentMethodGql, { nullable: true })
  @IsOptional()
  @IsIn(Object.keys(OrderPaymentMethodGql))
  paymentMethod?: OrderPaymentMethod;

  /** Matches order number or buyer name/phone. */
  @Field({ nullable: true }) @IsOptional() @IsString() @MaxLength(80) search?: string;

  @Field(() => Int, { defaultValue: 1 }) @IsInt() @Min(1) page: number = 1;
  @Field(() => Int, { defaultValue: 20 }) @IsInt() @Min(1) @Max(100) pageSize: number = 20;
}

@InputType()
export class MyOrdersFilterInput {
  @Field(() => Int, { defaultValue: 1 }) @IsInt() @Min(1) page: number = 1;
  @Field(() => Int, { defaultValue: 20 }) @IsInt() @Min(1) @Max(50) pageSize: number = 20;
}
