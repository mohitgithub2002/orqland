import { gql } from 'graphql-request';

const ADDRESS = `recipientName recipientPhone doorNo street landmark city state pincode latitude longitude`;
const AGENT = `userId orqUserId displayName avatar phone availability vehicleNumberMasked lastLat lastLng lastLocationAt`;
const DELIVERY = `
  id taskNumber status mode needsAttention attentionReason codAmount requiresOtp selfStaffName selfStaffPhone
  estimatedDistanceKm pickupLat pickupLng dropoffLat dropoffLng acceptedAt pickedUpAt createdAt
  agent { ${AGENT} }
  currentOffer { id agentUserId agentName expiresAt }
`;

/** One selection for cards and the order view, so a mutation result can replace the cached order. */
export const ORDER_FIELDS = `
  id orderNumber orderStatus paymentMethod paymentStatus requestedFulfilment fulfilmentMethod
  subtotalBase totalGst deliveryFee discountTotal totalAmount itemCount allowedNextStatuses
  customerNote rejectionReason cancellationReason
  createdAt acceptedAt preparingAt readyAt dispatchedAt deliveredAt completedAt cancelledAt
  scheduledFor preparationMinutes preparationDueAt
  cancelRequestStatus cancelRequestedAt cancelRequestReason cancelRequestResolution
  returnPickupDate returnWindowEndsAt distanceFromPickupKm amountPaid
  buyerSnapshot { name phone email orqUserId }
  deliveryAddressSnapshot { ${ADDRESS} }
  items { id title variantLabel sku imageUrl quantity unitBasePrice gstPercentage unitTotalPrice lineTotal stockRemaining }
  invoice { id mimeType sizeBytes originalName createdAt }
  history { id fromStatus toStatus actorRole actorName reason createdAt }
  delivery { ${DELIVERY} }
`;

const ORDER_DETAIL_FIELDS = `${ORDER_FIELDS} checkoutId payments { id kind method status amount provider providerReference occurredAt }`;

export const ORQSPACE_ORDERS_QUERY = gql`
  query OrqspaceOrders($filter: OrqspaceOrdersFilterInput!) {
    orqspaceOrders(filter: $filter) { total page pageSize items { ${ORDER_FIELDS} } }
  }
`;

export const ORQSPACE_ORDER_SUMMARY_QUERY = gql`
  query OrqspaceOrderSummary($orqspaceId: ID!) {
    orqspaceOrderSummary(orqspaceId: $orqspaceId) {
      totalSales totalSalesChangePercent ongoingOrders newOrdersToday completedOrders completedChangePercent
      tabs { queue count }
    }
  }
`;

export const ORQSPACE_ORDER_COUNTS_QUERY = gql`
  query OrqspaceOrderCounts($orqspaceId: ID!) {
    orqspaceOrderCounts(orqspaceId: $orqspaceId) { status count }
  }
`;

export const ORQSPACE_ORDER_QUERY = gql`
  query OrqspaceOrder($orderId: ID!) {
    orqspaceOrder(orderId: $orderId) { ${ORDER_DETAIL_FIELDS} }
  }
`;

export const ATTACH_ORDER_INVOICE = gql`
  mutation AttachOrderInvoice($orderId: ID!, $fileId: ID!) { attachOrderInvoice(orderId: $orderId, fileId: $fileId) { id } }
`;

const actionMutation = (name: string, inputType: string) => gql`
  mutation ${name.charAt(0).toUpperCase() + name.slice(1)}($input: ${inputType}!) {
    ${name}(input: $input) { ${ORDER_DETAIL_FIELDS} }
  }
`;

export const ORDER_ACTION_MUTATIONS = {
  acceptOrder: actionMutation('acceptOrder', 'AcceptOrderInput'),
  startPreparingOrder: actionMutation('startPreparingOrder', 'StartPreparationInput'),
  extendOrderPreparation: actionMutation('extendOrderPreparation', 'ExtendPreparationInput'),
  markOrderReady: actionMutation('markOrderReady', 'OrderActionInput'),
  markOrderAwaitingPickup: actionMutation('markOrderAwaitingPickup', 'OrderActionInput'),
  confirmCustomerPickup: actionMutation('confirmCustomerPickup', 'OrderActionInput'),
  reopenOrderForFulfilment: actionMutation('reopenOrderForFulfilment', 'OrderActionInput'),
  rejectOrder: actionMutation('rejectOrder', 'OrderReasonInput'),
  cancelOrderByWorkspace: actionMutation('cancelOrderByWorkspace', 'OrderReasonInput'),
  approveOrderCancellation: actionMutation('approveOrderCancellation', 'OrderActionInput'),
  declineOrderCancellation: actionMutation('declineOrderCancellation', 'OrderReasonInput'),
  declineOrderReturn: actionMutation('declineOrderReturn', 'OrderReasonInput'),
  scheduleOrderReturnPickup: actionMutation('scheduleOrderReturnPickup', 'ScheduleReturnPickupInput'),
  markOrderReturned: actionMutation('markOrderReturned', 'MarkOrderReturnedInput'),
  approveOrderRefund: actionMutation('approveOrderRefund', 'ApproveRefundInput'),
  recordOrderPayment: actionMutation('recordOrderPayment', 'RecordOrderPaymentInput'),
} as const;

export type OrderActionName = keyof typeof ORDER_ACTION_MUTATIONS;
