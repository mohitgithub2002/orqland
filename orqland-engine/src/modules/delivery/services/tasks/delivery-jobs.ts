import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron, Interval } from '@nestjs/schedule';
import { and, eq, lt } from 'drizzle-orm';
import { DRIZZLE, type DrizzleDB } from '@/infrastructure/database/drizzle.module';
import { deliveryOffers } from '@/infrastructure/database/schema';
import { deliveryConfig } from '@/config/delivery.config';
import { ConnectionsService } from '../connections/connections.service';
import { DeliveryFilesService } from '../files/delivery-files.service';
import { DeliveryNotifierService } from '../notifications/delivery-notifier.service';
import { DeliverySettingsService } from '../settings/delivery-settings.service';
import { TrackingService } from '../tracking/tracking.service';
import { AssignmentEngineService } from './assignment-engine.service';

/**
 * Background jobs. Each job claims work with conditional updates / row locks, so running several
 * engine instances is safe (an expired offer is processed by exactly one instance).
 */
@Injectable()
export class DeliveryJobs {
  private readonly logger = new Logger('DeliveryJobs');

  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    private readonly engine: AssignmentEngineService,
    private readonly settings: DeliverySettingsService,
    private readonly connections: ConnectionsService,
    private readonly tracking: TrackingService,
    private readonly notifier: DeliveryNotifierService,
    private readonly files: DeliveryFilesService,
  ) {}

  /** Expires unanswered offers and moves auto-assigned tasks to the next agent. */
  @Interval('delivery-offer-expiry', 30_000)
  async expireOffers(): Promise<number> {
    const stale = await this.db
      .select({ id: deliveryOffers.id })
      .from(deliveryOffers)
      .where(and(eq(deliveryOffers.status, 'OFFERED'), lt(deliveryOffers.expiresAt, new Date())))
      .limit(100);
    let processed = 0;
    for (const { id } of stale) {
      try {
        const outcome = await this.db.transaction(async (tx) => {
          const [offer] = await tx.select().from(deliveryOffers).where(eq(deliveryOffers.id, id)).for('update', { skipLocked: true });
          if (!offer || offer.status !== 'OFFERED') return null;
          const task = await this.engine.closeOffer(tx, offer, 'EXPIRED', 'No response before the offer expired', {
            userId: null,
            role: 'SYSTEM',
            as: 'SYSTEM',
          });
          if (!task) return null;
          const settings = await this.settings.ensure(task.orqspaceId, tx);
          return { agentUserId: offer.agentUserId, result: await this.engine.afterOfferClosed(tx, task, settings, 'The offer expired without a response') };
        });
        if (!outcome) continue;
        processed++;
        await this.notifier.send({ userId: outcome.agentUserId, type: 'DELIVERY_OFFER_WITHDRAWN', title: 'Offer expired', body: 'The delivery was offered to another agent.' });
        if (outcome.result.offer) {
          await this.notifier.send({ userId: outcome.result.offer.agentUserId, type: 'DELIVERY_OFFERED', title: 'New delivery offer', body: `₹${outcome.result.offer.ratePerKmOffered}/km` });
        }
      } catch (error) {
        this.logger.warn(`Offer ${id} expiry failed: ${(error as Error).message}`);
      }
    }
    return processed;
  }

  /** Pending disconnect requests close once the agent's last active delivery for that workspace ends. */
  @Interval('delivery-disconnect-requests', 60_000)
  async finalizeDisconnects(): Promise<number> {
    return this.connections.finalizeRequestedDisconnects();
  }

  @Cron('0 15 * * * *', { name: 'delivery-invite-expiry' })
  async expireInvites(): Promise<number> {
    return this.connections.expireStaleInvites();
  }

  /** Uploads never attached to a registration, delivery or ticket within 24 h are deleted. */
  @Cron('0 30 3 * * *', { name: 'delivery-files-cleanup', timeZone: 'Asia/Kolkata' })
  async purgeAbandonedFiles(): Promise<number> {
    return this.files.purgeAbandoned();
  }

  @Cron('0 0 3 * * *', { name: 'delivery-location-retention', timeZone: 'Asia/Kolkata' })
  async purgeLocations(): Promise<number> {
    const removed = await this.tracking.purgeOlderThan(deliveryConfig.locationRetentionDays);
    this.logger.log(`Purged ${removed} location pings older than ${deliveryConfig.locationRetentionDays} days`);
    return removed;
  }
}
