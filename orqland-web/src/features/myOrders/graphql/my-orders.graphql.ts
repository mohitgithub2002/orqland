import { gql } from 'graphql-request';

const LIST = `id orderNumber orqspaceName orderStatus paymentMethod paymentStatus requestedFulfilment fulfilmentMethod totalAmount itemCount allowedNextStatuses createdAt
  buyerSnapshot { name phone } items { id title variantLabel quantity } delivery { status }`;
const DETAIL = `id orderNumber checkoutId orqspaceName orderStatus paymentMethod paymentStatus requestedFulfilment fulfilmentMethod subtotalBase totalGst deliveryFee discountTotal totalAmount
  itemCount allowedNextStatuses customerNote rejectionReason cancellationReason createdAt deliveryOtp
  scheduledFor cancelRequestStatus cancelRequestReason cancelRequestResolution returnWindowEndsAt returnPickupDate
  invoice { id originalName mimeType sizeBytes createdAt }
  buyerSnapshot { name phone email orqUserId }
  deliveryAddressSnapshot { recipientName recipientPhone doorNo street landmark city state pincode latitude longitude }
  items { id title variantLabel sku imageUrl quantity unitBasePrice gstPercentage unitTotalPrice lineTotal }
  history { id fromStatus toStatus actorRole actorName reason createdAt }
  payments { id kind method status amount provider providerReference occurredAt }
  delivery { id status mode taskNumber }`;

export const MY_ORDERS = gql`query MyOrders($filter: MyOrdersFilterInput) { myOrders(filter: $filter) { total page pageSize items { ${LIST} } } }`;
export const MY_ORDER = gql`query MyOrder($orderId: ID!) { myOrder(orderId: $orderId) { ${DETAIL} } }`;
export const CHECKOUT_ADDRESSES = gql`query MyCheckoutAddresses { myCheckoutAddresses { id addressType isPrimary recipientName recipientPhone doorNo street landmark city state pincode latitude longitude } }`;
export const PLACE_ORDER = gql`mutation PlaceOrder($input: PlaceOrderInput!) { placeOrder(input: $input) { checkoutId replayed orders { id orderNumber orqspaceName totalAmount } } }`;
export const CANCEL_MY_ORDER = gql`mutation CancelMyOrder($input: OrderReasonInput!) { cancelMyOrder(input: $input) { id orderStatus cancelRequestStatus } }`;
export const REQUEST_RETURN = gql`mutation RequestOrderReturn($input: OrderReasonInput!) { requestOrderReturn(input: $input) { id orderStatus } }`;
