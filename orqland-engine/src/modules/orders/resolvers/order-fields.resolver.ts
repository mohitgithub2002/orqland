import { Parent, ResolveField, Resolver } from '@nestjs/graphql';
import { OrderPaymentType, OrderStatusHistoryType, OrderType } from '../dto/types/order.type';
import { OrdersQueryService } from '../services/orders-query.service';

/** Detail-only fields. Parent access was already authorized by the query that returned the order. */
@Resolver(() => OrderType)
export class OrderFieldsResolver {
  constructor(private readonly query: OrdersQueryService) {}

  @ResolveField(() => [OrderStatusHistoryType])
  history(@Parent() order: OrderType) {
    return this.query.history(order.id);
  }

  /** Name of the fulfilling workspace (the shop the customer bought from). */
  @ResolveField(() => String)
  orqspaceName(@Parent() order: OrderType) {
    return this.query.orqspaceName(order.orqspaceId);
  }

  @ResolveField(() => [OrderPaymentType])
  payments(@Parent() order: OrderType) {
    return this.query.payments(order.id);
  }
}
