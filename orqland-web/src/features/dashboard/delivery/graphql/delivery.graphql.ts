import { gql } from 'graphql-request';

const AGENT = `userId orqUserId displayName avatar phone agentStatus availability vehicleCategory vehicleNumberMasked kycValid activeTaskCount lastLat lastLng lastLocationAt`;
const ADDRESS = `recipientName recipientPhone doorNo street landmark city state pincode latitude longitude`;
const OFFER = `id taskId agentUserId agentName assignmentType status ratePerKmOffered distanceToPickupKm offeredAt expiresAt declineReason`;
const CONNECTION = `id orqspaceId orqspaceName agentUserId status currentRatePerKm inviteMessage invitedAt inviteExpiresAt activatedAt disconnectedAt disconnectReason disconnectRequestStatus disconnectRequestedAt disconnectRequestedByRole disconnectRequestReason activeTaskCount agent { ${AGENT} }`;
const TASK = `
  id taskNumber orderId orderNumber orqspaceId orqspaceName mode assignmentType status needsAttention attentionReason
  agentUserId ratePerKmSnapshot selfStaffName selfStaffPhone dropoffArea pickupLat pickupLng dropoffLat dropoffLng
  estimatedDistanceKm measuredDistanceKm estimatedEarnings codAmount requiresOtp podType podRecipientName podFileId
  acceptedAt pickedUpAt deliveredAt failureReason cancellationReason attemptNo createdAt updatedAt
  agent { ${AGENT} }
  pickupSnapshot { ${ADDRESS} }
  dropoffSnapshot { ${ADDRESS} }
  currentOffer { ${OFFER} }
`;
const SETTINGS = `orqspaceId timezone pickupLat pickupLng autoAssignEnabled assignmentStrategy offerTimeoutSeconds maxOfferAttempts maxPickupRadiusKm roadDistanceFactor requireDeliveryOtp activeAgentCount agentLimit readyForAgentDispatch pickupAddress { ${ADDRESS} }`;
const COD = `id taskId taskNumber orderNumber agentName expectedAmount collectedAmount collectionMethod collectionProofFileId collectedAt settledAmount outstandingAmount status discrepancyReason createdAt settlements { id amount method note recordedByName createdAt }`;
const EARNING = `id taskId taskNumber orderNumber agentUserId agentName distanceSource estimatedDistanceKm measuredDistanceKm approvedBillableKm ratePerKm baseAmount adjustmentTotal finalAmount status periodMonth deliveredAt paidAt payoutReference`;

export const DELIVERY_SETTINGS_QUERY = gql`query DeliverySettings($orqspaceId: ID!) { orqspaceDeliverySettings(orqspaceId: $orqspaceId) { ${SETTINGS} } }`;
export const UPDATE_DELIVERY_SETTINGS = gql`mutation UpdateDeliverySettings($input: UpdateDeliverySettingsInput!) { updateOrqspaceDeliverySettings(input: $input) { ${SETTINGS} } }`;

export const DELIVERY_AGENTS_QUERY = gql`query DeliveryAgents($filter: WorkspaceConnectionsFilterInput!) { orqspaceDeliveryAgents(filter: $filter) { ${CONNECTION} rateHistory { id ratePerKm effectiveFrom reason } } }`;
export const SEARCH_AGENT_QUERY = gql`query SearchDeliveryAgent($input: SearchDeliveryAgentInput!) { searchDeliveryAgent(input: $input) { canInvite reason workspaceActiveConnections workspaceConnectionLimit existingConnection { id status } agent { ${AGENT} } } }`;
export const INVITE_AGENT = gql`mutation InviteDeliveryAgent($input: InviteDeliveryAgentInput!) { inviteDeliveryAgent(input: $input) { ${CONNECTION} } }`;
export const CANCEL_INVITE = gql`mutation CancelDeliveryAgentInvite($input: ConnectionReasonInput!) { cancelDeliveryAgentInvite(input: $input) { id status } }`;
export const UPDATE_RATE = gql`mutation UpdateDeliveryAgentRate($input: UpdateConnectionRateInput!) { updateDeliveryAgentRate(input: $input) { id currentRatePerKm } }`;
export const DISCONNECT_AGENT = gql`mutation DisconnectDeliveryAgent($input: ConnectionReasonInput!) { disconnectDeliveryAgent(input: $input) { id status disconnectRequestStatus } }`;
export const WITHDRAW_DISCONNECT = gql`mutation WithdrawDeliveryAgentDisconnectRequest($connectionId: ID!) { withdrawDeliveryAgentDisconnectRequest(connectionId: $connectionId) { id status disconnectRequestStatus } }`;

export const LIVE_DELIVERIES_QUERY = gql`query LiveDeliveries($orqspaceId: ID!) { orqspaceLiveDeliveries(orqspaceId: $orqspaceId) { ${TASK} } }`;
export const DELIVERY_TASKS_QUERY = gql`query DeliveryTasks($filter: WorkspaceTasksFilterInput!) { orqspaceDeliveryTasks(filter: $filter) { total page pageSize items { ${TASK} } } }`;
export const DELIVERY_TASK_QUERY = gql`query DeliveryTask($taskId: ID!) {
  orqspaceDeliveryTask(taskId: $taskId) { ${TASK} events { id fromStatus toStatus actorRole actorName reason isOverride createdAt } offers { ${OFFER} } }
}`;
export const TASK_TRACE_QUERY = gql`query DeliveryTaskTrace($taskId: ID!) { deliveryTaskTrace(taskId: $taskId) { lat lng recordedAt accuracyM } }`;

export const DISPATCH_ORDER = gql`mutation DispatchOrder($input: DispatchOrderInput!) { dispatchOrder(input: $input) { ${TASK} } }`;
export const REASSIGN_TASK = gql`mutation ReassignDeliveryTask($input: ReassignTaskInput!) { reassignDeliveryTask(input: $input) { ${TASK} } }`;
export const CANCEL_TASK = gql`mutation CancelDeliveryTask($input: TaskReasonInput!) { cancelDeliveryTask(input: $input) { ${TASK} } }`;
export const OVERRIDE_DELIVERED = gql`mutation OverrideDelivered($input: TaskReasonInput!) { overrideDeliveryAsDelivered(input: $input) { ${TASK} } }`;
export const SELF_DELIVERY_UPDATE = gql`mutation UpdateSelfDelivery($input: SelfDeliveryUpdateInput!) { updateSelfDelivery(input: $input) { ${TASK} } }`;

export const COD_RECORDS_QUERY = gql`query CodRecords($filter: CodFilterInput!) { orqspaceCodRecords(filter: $filter) { ${COD} } }`;
export const COD_SUMMARY_QUERY = gql`query CodSummary($orqspaceId: ID!) { orqspaceCodSummary(orqspaceId: $orqspaceId) { expected collected settled outstanding openRecords discrepancies } }`;
export const RECORD_COD_SETTLEMENT = gql`mutation RecordCodSettlement($input: RecordCodSettlementInput!) { recordCodSettlement(input: $input) { ${COD} } }`;
export const RESOLVE_COD = gql`mutation ResolveCodRecord($input: ResolveCodInput!) { resolveCodRecord(input: $input) { ${COD} } }`;

export const EARNINGS_QUERY = gql`query DeliveryEarnings($filter: EarningsFilterInput!) { orqspaceDeliveryEarnings(filter: $filter) { ${EARNING} } }`;
export const COST_REPORT_QUERY = gql`query DeliveryCostReport($input: CostReportInput!) {
  orqspaceDeliveryCostReport(input: $input) { periodMonth deliveries billableKm totalAmount pendingAmount approvedAmount paidAmount selfDeliveries failedDeliveries byAgent { agentUserId agentName deliveries billableKm amount pendingAmount approvedAmount paidAmount } }
}`;
export const APPROVE_EARNING = gql`mutation ApproveDeliveryEarning($input: ApproveEarningInput!) { approveDeliveryEarning(input: $input) { ${EARNING} } }`;
export const ADJUST_EARNING = gql`mutation AdjustDeliveryEarning($input: AdjustEarningInput!) { adjustDeliveryEarning(input: $input) { ${EARNING} } }`;
export const MARK_EARNINGS_PAID = gql`mutation MarkDeliveryEarningsPaid($input: MarkEarningsPaidInput!) { markDeliveryEarningsPaid(input: $input) { id status } }`;

const STATEMENT = `id agentUserId agentName agentOrqUserId orqspaceId orqspaceName periodMonth periodStart periodEnd status deliveries approvedKm baseAmount adjustments finalAmount paidAmount outstandingAmount codCollected codSettled generatedAt finalizedAt`;
export const STATEMENTS_QUERY = gql`query DeliveryStatements($orqspaceId: ID!, $periodMonth: String!) { orqspaceDeliveryStatements(orqspaceId: $orqspaceId, periodMonth: $periodMonth) { ${STATEMENT} } }`;

export const OPERATIONS_QUERY = gql`query DeliveryOperations($orqspaceId: ID!) {
  orqspaceDeliveryOperations(orqspaceId: $orqspaceId) {
    orqspaceId generatedAt timezone
    queue { newOrders preparing readyForFulfilment awaitingPickup outForDelivery deliveryFailed }
    deliveries { unassigned offered toPickup inTransit needsAttention openOffers deliveredToday failedToday }
    timings {
      windowDays medianOrderAcceptMinutes medianAssignMinutes medianPickupMinutes medianDeliverMinutes medianEndToEndMinutes
      orderAcceptSlaPercent deliverySlaPercent successRatePercent averageDistanceKm
      slaTargets { orderAcceptMinutes assignMinutes pickupMinutes deliverMinutes }
    }
    agents { connected connectionLimit online busy offline staleLocation workload { agentUserId displayName orqUserId availability activeTasks deliveredToday maxConcurrentTasks ratePerKm lastLocationAt locationStale disconnectPending } }
    cod { outstanding expectedOpen discrepancies }
    breaches { kind orderId taskId reference stage minutesOver targetMinutes }
    trend { day delivered failed }
  }
}`;
