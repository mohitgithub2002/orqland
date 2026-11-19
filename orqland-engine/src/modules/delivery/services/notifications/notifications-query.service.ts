import { Inject, Injectable } from '@nestjs/common';
import { and, count, desc, eq, inArray, isNull } from 'drizzle-orm';
import type { AuthUser } from '@/core/decorators/current-user.decorator';
import { DRIZZLE, type DrizzleDB } from '@/infrastructure/database/drizzle.module';
import { deliveryNotifications } from '@/infrastructure/database/schema';
import type { DeliveryNotificationPageType } from '../../dto/types/support.type';

@Injectable()
export class NotificationsQueryService {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB) {}

  async list(user: AuthUser, unreadOnly: boolean, limit: number): Promise<DeliveryNotificationPageType> {
    const where = unreadOnly
      ? and(eq(deliveryNotifications.userId, user.id), isNull(deliveryNotifications.readAt))
      : eq(deliveryNotifications.userId, user.id);
    const items = await this.db
      .select()
      .from(deliveryNotifications)
      .where(where)
      .orderBy(desc(deliveryNotifications.createdAt))
      .limit(Math.min(Math.max(limit, 1), 100));
    const [{ unread }] = await this.db
      .select({ unread: count() })
      .from(deliveryNotifications)
      .where(and(eq(deliveryNotifications.userId, user.id), isNull(deliveryNotifications.readAt)));
    return { items, unreadCount: unread };
  }

  /** Marks the given notifications (or all when `ids` is empty) as read. Returns the remaining unread count. */
  async markRead(user: AuthUser, ids: string[]): Promise<number> {
    const scope = [eq(deliveryNotifications.userId, user.id), isNull(deliveryNotifications.readAt)];
    if (ids.length) scope.push(inArray(deliveryNotifications.id, ids));
    await this.db.update(deliveryNotifications).set({ readAt: new Date() }).where(and(...scope));
    const [{ unread }] = await this.db
      .select({ unread: count() })
      .from(deliveryNotifications)
      .where(and(eq(deliveryNotifications.userId, user.id), isNull(deliveryNotifications.readAt)));
    return unread;
  }
}
