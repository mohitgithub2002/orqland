import { gql } from 'graphql-request';

const PROFILE = `userId orqUserId displayName agentStatus availability licenceNumberLast4 licenceStatus licenceValidTo licenceNextDueAt vehicleNumberMasked vehicleCategory vehicleStatus vehicleNextDueAt lastFailureReason suspendedReason eligibleForAssignments kycAlerts licenceFrontFileId licenceBackFileId vehicleRcFileId`;
const ADDRESS = `recipientName recipientPhone doorNo street landmark city pincode latitude longitude`;
const TASK = `id taskNumber orderNumber orqspaceId orqspaceName status mode codAmount requiresOtp estimatedDistanceKm estimatedEarnings ratePerKmSnapshot dropoffArea pickupLat pickupLng dropoffLat dropoffLng failureReason acceptedAt pickedUpAt createdAt podFileId
  pickupSnapshot { ${ADDRESS} } dropoffSnapshot { ${ADDRESS} }`;
const CONNECTION = `id orqspaceId orqspaceName status currentRatePerKm inviteMessage invitedAt inviteExpiresAt activatedAt activeTaskCount disconnectRequestStatus disconnectRequestedAt disconnectRequestedByRole disconnectRequestReason agent { userId displayName availability }`;

export const MY_AGENT_PROFILE = gql`query MyDeliveryAgentProfile { myDeliveryAgentProfile { ${PROFILE} } }`;
export const REGISTER_AGENT = gql`mutation RegisterAsDeliveryAgent($input: RegisterDeliveryAgentInput!) { registerAsDeliveryAgent(input: $input) { ${PROFILE} } }`;
export const REVERIFY_KYC = gql`mutation ReverifyMyDeliveryKyc($input: ReverifyKycInput!) { reverifyMyDeliveryKyc(input: $input) { ${PROFILE} } }`;

export const RUN_HOME = gql`query RunHome {
  runHome {
    connectionLimit
    profile { ${PROFILE} }
    activeTasks { ${TASK} }
    openOffers { offer { id offeredAt expiresAt ratePerKmOffered distanceToPickupKm } task { ${TASK} } }
    invitations { ${CONNECTION} }
    connections { ${CONNECTION} }
    today { deliveries billableKm estimated approved paid }
    unreadNotifications
  }
}`;

export const SET_AVAILABILITY = gql`mutation SetMyAvailability($availability: AgentAvailabilityChoice!) { setMyAvailability(availability: $availability) { availability } }`;
export const RESPOND_INVITATION = gql`mutation RespondToDeliveryInvitation($input: RespondToInvitationInput!) { respondToDeliveryInvitation(input: $input) { id status } }`;
export const DISCONNECT_WORKSPACE = gql`mutation DisconnectFromWorkspace($input: ConnectionReasonInput!) { disconnectFromWorkspace(input: $input) { id status disconnectRequestStatus } }`;
export const WITHDRAW_DISCONNECT = gql`mutation WithdrawWorkspaceDisconnectRequest($connectionId: ID!) { withdrawWorkspaceDisconnectRequest(connectionId: $connectionId) { id status disconnectRequestStatus } }`;
export const ACCEPT_OFFER = gql`mutation AcceptDeliveryOffer($input: OfferResponseInput!) { acceptDeliveryOffer(input: $input) { id status } }`;
export const DECLINE_OFFER = gql`mutation DeclineDeliveryOffer($input: OfferResponseInput!) { declineDeliveryOffer(input: $input) }`;
export const MARK_ARRIVING = gql`mutation MarkArrivingAtPickup($input: TaskActionInput!) { markArrivingAtPickup(input: $input) { id status } }`;
export const CONFIRM_PICKUP = gql`mutation ConfirmDeliveryPickup($input: TaskActionInput!) { confirmDeliveryPickup(input: $input) { id status } }`;
export const START_TRANSIT = gql`mutation StartDeliveryTransit($input: TaskActionInput!) { startDeliveryTransit(input: $input) { id status } }`;
export const COMPLETE_DELIVERY = gql`mutation CompleteDelivery($input: CompleteDeliveryInput!) { completeDelivery(input: $input) { id status } }`;
export const FAIL_DELIVERY = gql`mutation FailDelivery($input: FailDeliveryInput!) { failDelivery(input: $input) { id status } }`;
export const RETURN_TO_ORIGIN = gql`mutation ReturnDeliveryToOrigin($input: TaskActionInput!) { returnDeliveryToOrigin(input: $input) { id status } }`;
export const RECORD_LOCATION = gql`mutation RecordMyLocation($input: LocationPingInput!) { recordMyLocation(input: $input) { accepted trackingActive } }`;

const EARNING = `id taskId taskNumber orderNumber orqspaceId orqspaceName distanceSource estimatedDistanceKm measuredDistanceKm approvedBillableKm ratePerKm baseAmount adjustmentTotal finalAmount status periodMonth deliveredAt paidAt payoutReference`;
const TICKET = `id ticketNumber category subject description priority status assignedTeam relatedTaskId relatedTaskNumber relatedEarningId relatedPeriodMonth resolvedAt createdAt updatedAt messageCount`;

export const MY_DELIVERY_HISTORY = gql`query MyDeliveryHistory { myDeliveryHistory { ${TASK} deliveredAt updatedAt measuredDistanceKm cancellationReason } }`;
export const MY_DELIVERY_TASK = gql`query MyDeliveryTask($taskId: ID!) {
  myDeliveryTask(taskId: $taskId) { ${TASK} deliveredAt updatedAt measuredDistanceKm events { id toStatus actorRole actorName reason createdAt isOverride } }
}`;

export const MY_EARNINGS_OVERVIEW = gql`query MyEarningsOverview($periodMonth: String!) {
  myDeliveryStatement(periodMonth: $periodMonth) {
    periodMonth periodStart periodEnd isClosed status adjustmentTotal grandTotal csv
    totals { deliveries billableKm estimated approved paid }
    byWorkspace { orqspaceId orqspaceName deliveries billableKm amount }
    lines { ${EARNING} }
  }
  myDeliveryPerformance(periodMonth: $periodMonth) { offered accepted declined expired completed failed trackedKm billableKm averageDistanceKm averageEarningPerDelivery }
  myDeliveryEarningsTrend(months: 6) { periodMonth deliveries billableKm amount }
}`;

export const MY_CONNECTIONS = gql`query MyDeliveryConnections {
  myDeliveryConnections { ${CONNECTION} disconnectedAt disconnectReason rateHistory { id ratePerKm effectiveFrom reason } }
}`;

export const MY_FULL_PROFILE = gql`query MyFullAgentProfile {
  myDeliveryAgentProfile { ${PROFILE} vehicleRcValidTo licenceVerifiedAt vehicleVerifiedAt activatedAt maxConcurrentTasks verifications { id checkType trigger status mismatchFields requestedAt completedAt } }
}`;
export const CHANGE_VEHICLE = gql`mutation ChangeMyDeliveryVehicle($input: ChangeVehicleInput!) { changeMyDeliveryVehicle(input: $input) { ${PROFILE} } }`;

export const MY_NOTIFICATIONS = gql`query MyDeliveryNotifications($unreadOnly: Boolean!) {
  myDeliveryNotifications(unreadOnly: $unreadOnly, limit: 50) { unreadCount items { id type title body readAt createdAt } }
}`;
export const MARK_NOTIFICATIONS_READ = gql`mutation MarkDeliveryNotificationsRead($ids: [ID!]!) { markDeliveryNotificationsRead(ids: $ids) }`;

export const MY_TICKETS = gql`query MySupportTickets { mySupportTickets { ${TICKET} } }`;
export const MY_TICKET = gql`query MySupportTicket($ticketId: ID!) { mySupportTicket(ticketId: $ticketId) { ${TICKET} messages { id authorRole authorName body attachmentUrls attachmentFileIds createdAt } } }`;
export const CREATE_TICKET = gql`mutation CreateSupportTicket($input: CreateSupportTicketInput!) { createSupportTicket(input: $input) { ${TICKET} } }`;
export const REPLY_TICKET = gql`mutation ReplyToSupportTicket($input: ReplySupportTicketInput!) { replyToSupportTicket(input: $input) { id } }`;
export const CLOSE_TICKET = gql`mutation CloseSupportTicket($ticketId: ID!) { closeSupportTicket(ticketId: $ticketId) { id status } }`;

const STATEMENT = `id orqspaceId orqspaceName periodMonth periodStart periodEnd status deliveries approvedKm baseAmount adjustments finalAmount paidAmount outstandingAmount codCollected codSettled generatedAt finalizedAt`;
export const MY_STATEMENTS = gql`query MyDeliveryStatements { myDeliveryStatements(limit: 24) { ${STATEMENT} } }`;

export const MY_NOTIFICATION_PREFERENCES = gql`query MyNotificationPreferences { myNotificationPreferences { type group label enabled locked } }`;
export const SET_NOTIFICATION_PREFERENCE = gql`mutation SetNotificationPreference($type: String!, $enabled: Boolean!) { setNotificationPreference(type: $type, enabled: $enabled) { type group label enabled locked } }`;
export const MY_TASK_TRACE = gql`query MyDeliveryTaskTrace($taskId: ID!) { deliveryTaskTrace(taskId: $taskId) { lat lng recordedAt } }`;
