import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import type { AuthUser } from '@/core/decorators/current-user.decorator';
import { DRIZZLE, type DrizzleDB } from '@/infrastructure/database/drizzle.module';
import { deliveryNotificationPreferences } from '@/infrastructure/database/schema';
import type { NotificationPreferenceType } from '../../dto/types/support.type';
import { NOTIFICATION_CATALOGUE, PUSH_CHANNEL, type DeliveryNotificationType } from './delivery-notifier.service';

/** Push preferences per notification type. Safety and account-critical types cannot be muted. */
@Injectable()
export class NotificationPreferencesService {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB) {}

  async list(user: AuthUser): Promise<NotificationPreferenceType[]> {
    const rows = await this.db
      .select()
      .from(deliveryNotificationPreferences)
      .where(and(eq(deliveryNotificationPreferences.userId, user.id), eq(deliveryNotificationPreferences.channel, PUSH_CHANNEL)));
    const byType = new Map(rows.map((r) => [r.type, r.enabled]));
    return (Object.entries(NOTIFICATION_CATALOGUE) as [DeliveryNotificationType, (typeof NOTIFICATION_CATALOGUE)[DeliveryNotificationType]][]).map(
      ([type, meta]) => ({
        type,
        group: meta.group,
        label: meta.label,
        locked: meta.locked,
        enabled: meta.locked ? true : (byType.get(type) ?? true),
      }),
    );
  }

  async set(user: AuthUser, type: string, enabled: boolean): Promise<NotificationPreferenceType[]> {
    const meta = NOTIFICATION_CATALOGUE[type as DeliveryNotificationType];
    if (!meta) throw new BadRequestException('Unknown notification type');
    if (meta.locked && !enabled) throw new BadRequestException(`"${meta.label}" alerts are required for safety and cannot be turned off`);
    await this.db
      .insert(deliveryNotificationPreferences)
      .values({ userId: user.id, type, channel: PUSH_CHANNEL, enabled })
      .onConflictDoUpdate({
        target: [deliveryNotificationPreferences.userId, deliveryNotificationPreferences.type, deliveryNotificationPreferences.channel],
        set: { enabled, updatedAt: new Date() },
      });
    return this.list(user);
  }
}
