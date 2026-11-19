import { Field, ID, Int, ObjectType } from '@nestjs/graphql';
import type { ActorRole, SupportTicketCategory, SupportTicketPriority, SupportTicketStatus } from '@/infrastructure/database/schema';
import { ActorRoleGql } from '@/modules/orders/dto/enums/order.enums';
import { SupportTicketCategoryGql, SupportTicketPriorityGql, SupportTicketStatusGql } from '../enums/delivery.enums';

@ObjectType('DeliveryNotification')
export class DeliveryNotificationType {
  @Field(() => ID) id: string;
  @Field() type: string;
  @Field() title: string;
  @Field() body: string;
  @Field(() => Date, { nullable: true }) readAt: Date | null;
  @Field() createdAt: Date;
}

@ObjectType('DeliveryNotificationPage')
export class DeliveryNotificationPageType {
  @Field(() => [DeliveryNotificationType]) items: DeliveryNotificationType[];
  @Field(() => Int) unreadCount: number;
}

@ObjectType('NotificationPreference')
export class NotificationPreferenceType {
  @Field() type: string;
  /** OFFERS | DELIVERY_UPDATES | WORKSPACES | EARNINGS_COD | ACCOUNT_KYC | SUPPORT */
  @Field() group: string;
  @Field() label: string;
  @Field() enabled: boolean;
  /** Safety / account-critical alerts are always delivered. */
  @Field() locked: boolean;
}

@ObjectType('SupportMessage')
export class SupportMessageType {
  @Field(() => ID) id: string;
  @Field(() => ActorRoleGql) authorRole: ActorRole;
  @Field(() => String, { nullable: true }) authorName: string | null;
  @Field() body: string;
  @Field(() => [String]) attachmentUrls: string[];
  @Field(() => [ID]) attachmentFileIds: string[];
  @Field() isInternal: boolean;
  @Field() createdAt: Date;
}

@ObjectType('SupportTicket')
export class SupportTicketType {
  @Field(() => ID) id: string;
  @Field() ticketNumber: string;
  @Field(() => ID) raisedByUserId: string;
  @Field() raisedByName: string;
  @Field() raisedByOrqUserId: string;
  @Field(() => SupportTicketCategoryGql) category: SupportTicketCategory;
  @Field() subject: string;
  @Field() description: string;
  @Field(() => SupportTicketPriorityGql) priority: SupportTicketPriority;
  @Field(() => SupportTicketStatusGql) status: SupportTicketStatus;
  @Field(() => String, { nullable: true }) assignedTeam: string | null;
  @Field(() => ID, { nullable: true }) relatedTaskId: string | null;
  @Field(() => String, { nullable: true }) relatedTaskNumber: string | null;
  @Field(() => ID, { nullable: true }) relatedEarningId: string | null;
  @Field(() => ID, { nullable: true }) relatedConnectionId: string | null;
  @Field(() => String, { nullable: true }) relatedPeriodMonth: string | null;
  @Field(() => Date, { nullable: true }) resolvedAt: Date | null;
  @Field() createdAt: Date;
  @Field() updatedAt: Date;
  @Field(() => Int) messageCount: number;
}

@ObjectType('SupportTicketPage')
export class SupportTicketPageType {
  @Field(() => [SupportTicketType]) items: SupportTicketType[];
  @Field(() => Int) total: number;
  @Field(() => Int) page: number;
  @Field(() => Int) pageSize: number;
}
