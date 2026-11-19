import {
  agentConnectionStatusEnum,
  assignmentStrategyEnum,
  assignmentTypeEnum,
  codCollectionMethodEnum,
  codStatusEnum,
  deliveryAgentAvailabilityEnum,
  deliveryAgentStatusEnum,
  deliveryModeEnum,
  deliveryOfferStatusEnum,
  deliveryTaskStatusEnum,
  distanceSourceEnum,
  earningStatusEnum,
  kycAttemptStatusEnum,
  kycCheckStatusEnum,
  kycCheckTypeEnum,
  kycTriggerEnum,
  proofOfDeliveryTypeEnum,
  supportTicketCategoryEnum,
  supportTicketPriorityEnum,
  supportTicketStatusEnum,
  vehicleCategoryEnum,
} from '@/infrastructure/database/schema';
import { gqlEnumFrom } from '@/core/utils/gql-enum';

const gqlApiEnum = gqlEnumFrom;

export const DeliveryAgentStatusGql = gqlEnumFrom(deliveryAgentStatusEnum.enumValues, 'DeliveryAgentStatus');
export const DeliveryAgentAvailabilityGql = gqlEnumFrom(
  deliveryAgentAvailabilityEnum.enumValues,
  'DeliveryAgentAvailability',
);
export const KycCheckStatusGql = gqlEnumFrom(kycCheckStatusEnum.enumValues, 'KycCheckStatus');
export const VehicleCategoryGql = gqlEnumFrom(vehicleCategoryEnum.enumValues, 'VehicleCategory');
export const KycCheckTypeGql = gqlEnumFrom(kycCheckTypeEnum.enumValues, 'KycCheckType');
export const KycTriggerGql = gqlEnumFrom(kycTriggerEnum.enumValues, 'KycTrigger');
export const KycAttemptStatusGql = gqlEnumFrom(kycAttemptStatusEnum.enumValues, 'KycAttemptStatus');
export const AgentConnectionStatusGql = gqlEnumFrom(agentConnectionStatusEnum.enumValues, 'AgentConnectionStatus');
export const AssignmentStrategyGql = gqlEnumFrom(assignmentStrategyEnum.enumValues, 'AssignmentStrategy');
export const DeliveryModeGql = gqlEnumFrom(deliveryModeEnum.enumValues, 'DeliveryMode');
export const AssignmentTypeGql = gqlEnumFrom(assignmentTypeEnum.enumValues, 'AssignmentType');
export const DeliveryTaskStatusGql = gqlEnumFrom(deliveryTaskStatusEnum.enumValues, 'DeliveryTaskStatus');
export const DeliveryOfferStatusGql = gqlEnumFrom(deliveryOfferStatusEnum.enumValues, 'DeliveryOfferStatus');
export const ProofOfDeliveryTypeGql = gqlEnumFrom(proofOfDeliveryTypeEnum.enumValues, 'ProofOfDeliveryType');
export const CodCollectionMethodGql = gqlEnumFrom(codCollectionMethodEnum.enumValues, 'CodCollectionMethod');
export const CodStatusGql = gqlEnumFrom(codStatusEnum.enumValues, 'CodStatus');
export const DistanceSourceGql = gqlEnumFrom(distanceSourceEnum.enumValues, 'DistanceSource');
export const EarningStatusGql = gqlEnumFrom(earningStatusEnum.enumValues, 'EarningStatus');

export const SupportTicketCategoryGql = gqlEnumFrom(supportTicketCategoryEnum.enumValues, 'SupportTicketCategory');
export const SupportTicketStatusGql = gqlEnumFrom(supportTicketStatusEnum.enumValues, 'SupportTicketStatus');
export const SupportTicketPriorityGql = gqlEnumFrom(supportTicketPriorityEnum.enumValues, 'SupportTicketPriority');

/** Workspace decision on a COD record that is in DISCREPANCY / UNDER_REVIEW. */
export type CodResolution = 'ACCEPT_AS_SETTLED' | 'MARK_NOT_COLLECTED' | 'KEEP_UNDER_REVIEW';
export const CodResolutionGql = gqlApiEnum(['ACCEPT_AS_SETTLED', 'MARK_NOT_COLLECTED', 'KEEP_UNDER_REVIEW'], 'CodResolution');

/** Agent-side availability choice (BUSY is managed by the system). */
export type AgentAvailabilityChoice = 'ONLINE' | 'OFFLINE';
export const AgentAvailabilityChoiceGql = gqlApiEnum(['ONLINE', 'OFFLINE'], 'AgentAvailabilityChoice');
