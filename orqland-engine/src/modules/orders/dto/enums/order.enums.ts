import {
  actorRoleEnum,
  orderFulfilmentMethodEnum,
  orderPaymentKindEnum,
  orderPaymentMethodEnum,
  orderPaymentRecordStatusEnum,
  orderPaymentStatusEnum,
  orderRequestedFulfilmentEnum,
  orderStatusEnum,
} from '@/infrastructure/database/schema';
import { gqlEnumFrom } from '@/core/utils/gql-enum';
import { ORDER_QUEUES } from '../../helpers/order-queues';

export const ActorRoleGql = gqlEnumFrom(actorRoleEnum.enumValues, 'ActorRole');
export const OrderStatusGql = gqlEnumFrom(orderStatusEnum.enumValues, 'OrderStatus');
export const OrderPaymentMethodGql = gqlEnumFrom(orderPaymentMethodEnum.enumValues, 'OrderPaymentMethod');
export const OrderPaymentStatusGql = gqlEnumFrom(orderPaymentStatusEnum.enumValues, 'OrderPaymentStatus');
export const OrderRequestedFulfilmentGql = gqlEnumFrom(
  orderRequestedFulfilmentEnum.enumValues,
  'OrderRequestedFulfilment',
);
export const OrderFulfilmentMethodGql = gqlEnumFrom(orderFulfilmentMethodEnum.enumValues, 'OrderFulfilmentMethod');
export const OrderPaymentKindGql = gqlEnumFrom(orderPaymentKindEnum.enumValues, 'OrderPaymentKind');
export const OrderPaymentRecordStatusGql = gqlEnumFrom(
  orderPaymentRecordStatusEnum.enumValues,
  'OrderPaymentRecordStatus',
);
export const OrderQueueGql = gqlEnumFrom(ORDER_QUEUES, 'OrderQueue');
