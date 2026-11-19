import { Inject, Injectable, Logger } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { DRIZZLE, type DrizzleDB } from '@/infrastructure/database/drizzle.module';
import { deliveryNotificationPreferences, deliveryNotifications } from '@/infrastructure/database/schema';

export type DeliveryNotificationType =
  | 'KYC_APPROVED'
  | 'KYC_REJECTED'
  | 'KYC_MANUAL_REVIEW'
  | 'KYC_REVERIFICATION_DUE'
  | 'KYC_EXPIRED'
  | 'AGENT_SUSPENDED'
  | 'AGENT_REINSTATED'
  | 'CONNECTION_INVITED'
  | 'CONNECTION_ACCEPTED'
  | 'CONNECTION_DECLINED'
  | 'CONNECTION_DISCONNECTED'
  | 'CONNECTION_DISCONNECT_REQUESTED'
  | 'CONNECTION_RATE_CHANGED'
  | 'DELIVERY_OFFERED'
  | 'DELIVERY_OFFER_WITHDRAWN'
  | 'DELIVERY_UNASSIGNED'
  | 'DELIVERY_STATUS_CHANGED'
  | 'DELIVERY_CANCELLED'
  | 'ORDER_READY_FOR_PICKUP'
  | 'COD_DISCREPANCY'
  | 'EARNING_APPROVED'
  | 'EARNING_PAID'
  | 'SUPPORT_TICKET_UPDATED'
  | 'STATEMENT_READY';

export type NotificationGroup = 'OFFERS' | 'DELIVERY_UPDATES' | 'WORKSPACES' | 'EARNINGS_COD' | 'ACCOUNT_KYC' | 'SUPPORT';

/**
 * Catalogue used by notification preferences. `locked` types are safety / account critical
 * (new offers, cancellations, suspensions, KYC expiry) and are always pushed.
 */
export const NOTIFICATION_CATALOGUE: Record<DeliveryNotificationType, { group: NotificationGroup; label: string; locked: boolean }> = {
  DELIVERY_OFFERED: { group: 'OFFERS', label: 'New delivery offers', locked: true },
  DELIVERY_OFFER_WITHDRAWN: { group: 'OFFERS', label: 'Offer expired or withdrawn', locked: false },
  DELIVERY_STATUS_CHANGED: { group: 'DELIVERY_UPDATES', label: 'Delivery status changes', locked: false },
  DELIVERY_UNASSIGNED: { group: 'DELIVERY_UPDATES', label: 'Delivery needs an agent', locked: false },
  DELIVERY_CANCELLED: { group: 'DELIVERY_UPDATES', label: 'Delivery cancelled', locked: true },
  ORDER_READY_FOR_PICKUP: { group: 'DELIVERY_UPDATES', label: 'Order ready for pickup', locked: true },
  CONNECTION_INVITED: { group: 'WORKSPACES', label: 'Workspace invitations', locked: false },
  CONNECTION_ACCEPTED: { group: 'WORKSPACES', label: 'Invitation accepted', locked: false },
  CONNECTION_DECLINED: { group: 'WORKSPACES', label: 'Invitation declined', locked: false },
  CONNECTION_DISCONNECTED: { group: 'WORKSPACES', label: 'Workspace disconnected', locked: true },
  CONNECTION_DISCONNECT_REQUESTED: { group: 'WORKSPACES', label: 'Disconnect requested', locked: true },
  CONNECTION_RATE_CHANGED: { group: 'WORKSPACES', label: 'Per-km rate changed', locked: true },
  COD_DISCREPANCY: { group: 'EARNINGS_COD', label: 'COD discrepancies', locked: true },
  EARNING_APPROVED: { group: 'EARNINGS_COD', label: 'Earnings approved', locked: false },
  EARNING_PAID: { group: 'EARNINGS_COD', label: 'Earnings paid', locked: false },
  STATEMENT_READY: { group: 'EARNINGS_COD', label: 'Monthly statement ready', locked: false },
  KYC_APPROVED: { group: 'ACCOUNT_KYC', label: 'Verification approved', locked: true },
  KYC_REJECTED: { group: 'ACCOUNT_KYC', label: 'Verification failed', locked: true },
  KYC_MANUAL_REVIEW: { group: 'ACCOUNT_KYC', label: 'Application under review', locked: true },
  KYC_REVERIFICATION_DUE: { group: 'ACCOUNT_KYC', label: 'Re-verification due', locked: true },
  KYC_EXPIRED: { group: 'ACCOUNT_KYC', label: 'Verification expired', locked: true },
  AGENT_SUSPENDED: { group: 'ACCOUNT_KYC', label: 'Account suspended', locked: true },
  AGENT_REINSTATED: { group: 'ACCOUNT_KYC', label: 'Account reinstated', locked: true },
  SUPPORT_TICKET_UPDATED: { group: 'SUPPORT', label: 'Support replies', locked: false },
};

export const PUSH_CHANNEL = 'PUSH';

export interface DeliveryNotification {
  userId: string;
  type: DeliveryNotificationType;
  title: string;
  body: string;
  data?: Record<string, string>;
}

/**
 * Stores every notification as in-app history (read/unread) and is the integration point for ORQLAND's
 * push / email channels: on merge, forward `deliver()` to your existing notification service.
 * Failures never break the caller.
 */
@Injectable()
export class DeliveryNotifierService {
  private readonly logger = new Logger('DeliveryNotifier');

  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB) {}

  async send(notification: DeliveryNotification): Promise<void> {
    try {
      await this.db.insert(deliveryNotifications).values({
        userId: notification.userId,
        type: notification.type,
        title: notification.title.slice(0, 200),
        body: notification.body,
        data: notification.data ?? null,
      });
      // In-app history is always kept; push respects the user's preference unless the type is locked.
      if (await this.pushEnabled(notification.userId, notification.type)) await this.deliver(notification);
    } catch (error) {
      this.logger.warn(`Notification failed: ${(error as Error).message}`);
    }
  }

  sendMany(notifications: DeliveryNotification[]): Promise<void[]> {
    return Promise.all(notifications.map((n) => this.send(n)));
  }

  private async pushEnabled(userId: string, type: DeliveryNotificationType): Promise<boolean> {
    if (NOTIFICATION_CATALOGUE[type]?.locked) return true;
    const [pref] = await this.db
      .select({ enabled: deliveryNotificationPreferences.enabled })
      .from(deliveryNotificationPreferences)
      .where(
        and(
          eq(deliveryNotificationPreferences.userId, userId),
          eq(deliveryNotificationPreferences.type, type),
          eq(deliveryNotificationPreferences.channel, PUSH_CHANNEL),
        ),
      );
    return pref?.enabled ?? true;
  }

  /** Push / email hand-off. Replace the log line with your notification channels. */
  protected async deliver(notification: DeliveryNotification): Promise<void> {
    this.logger.log(`[${notification.type}] → ${notification.userId}: ${notification.title}`);
  }
}
