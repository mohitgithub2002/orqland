import { UseGuards } from '@nestjs/common';
import { Args, ID, Mutation, Query, Resolver } from '@nestjs/graphql';
import { CurrentUser, type AuthUser } from '@/core/decorators/current-user.decorator';
import { GqlAuthGuard } from '@/core/guards/gql-auth.guard';
import { OrderReasonInput } from '../dto/inputs/order-action.inputs';
import { MyOrdersFilterInput } from '../dto/inputs/orqspace-orders-filter.input';
import { PlaceOrderInput } from '../dto/inputs/place-order.input';
import { CheckoutAddressType, OrderPageType, OrderType, PlaceOrderResultType } from '../dto/types/order.type';
import { OrderActionsService } from '../services/lifecycle/order-actions.service';
import { OrderPlacementService } from '../services/lifecycle/order-placement.service';
import { OrdersQueryService } from '../services/orders-query.service';

/** Customer-facing order API (checkout and "my orders"). */
@Resolver(() => OrderType)
@UseGuards(GqlAuthGuard)
export class CustomerOrdersResolver {
  constructor(
    private readonly placement: OrderPlacementService,
    private readonly query: OrdersQueryService,
    private readonly actions: OrderActionsService,
  ) {}

  @Mutation(() => PlaceOrderResultType)
  async placeOrder(@CurrentUser() user: AuthUser, @Args('input') input: PlaceOrderInput) {
    const result = await this.placement.placeOrder(user, input);
    return { ...result, orders: await this.query.toOrderTypes(result.orders, 'CUSTOMER') };
  }

  @Query(() => [CheckoutAddressType])
  myCheckoutAddresses(@CurrentUser() user: AuthUser) {
    return this.query.checkoutAddresses(user);
  }

  @Query(() => OrderPageType)
  myOrders(
    @CurrentUser() user: AuthUser,
    @Args('filter', { type: () => MyOrdersFilterInput, nullable: true }) filter?: MyOrdersFilterInput,
  ) {
    return this.query.listForCustomer(user, filter ?? { page: 1, pageSize: 20 });
  }

  @Query(() => OrderType)
  myOrder(@CurrentUser() user: AuthUser, @Args('orderId', { type: () => ID }) orderId: string) {
    return this.query.getForCustomer(user, orderId);
  }

  @Mutation(() => OrderType)
  cancelMyOrder(@CurrentUser() user: AuthUser, @Args('input') input: OrderReasonInput) {
    return this.actions.cancelByCustomer(user, input);
  }

  @Mutation(() => OrderType)
  requestOrderReturn(@CurrentUser() user: AuthUser, @Args('input') input: OrderReasonInput) {
    return this.actions.requestReturn(user, input);
  }
}
