import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { and, eq, inArray, lt, lte, or, sql } from 'drizzle-orm';
import { DRIZZLE, type DrizzleDB } from '@/infrastructure/database/drizzle.module';
import { deliveryAgentProfiles } from '@/infrastructure/database/schema';
import { deliveryConfig } from '@/config/delivery.config';
import { DeliveryNotifierService } from '../notifications/delivery-notifier.service';

/**
 * Daily re-KYC sweep:
 *  - checks past their re-verification date (or document expiry) → EXPIRED, agent → KYC_BLOCKED (no new offers;
 *    deliveries already in progress may be completed — SCHEMA_DESIGN.md Q-8)
 *  - checks due within the reminder window → reminder notification
 * Idempotent and safe to run on several instances.
 */
@Injectable()
export class ReKycJob {
  private readonly logger = new Logger('ReKycJob');

  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    private readonly notifier: DeliveryNotifierService,
  ) {}

  @Cron('0 30 2 * * *', { name: 'delivery-rekyc', timeZone: 'Asia/Kolkata' })
  async run(): Promise<{ expired: number; reminded: number }> {
    const now = new Date();
    const today = now.toISOString().slice(0, 10);

    const expiredLicence = await this.db
      .update(deliveryAgentProfiles)
      .set({ licenceStatus: 'EXPIRED' })
      .where(
        and(
          eq(deliveryAgentProfiles.licenceStatus, 'VERIFIED'),
          or(lt(deliveryAgentProfiles.licenceNextDueAt, now), lt(deliveryAgentProfiles.licenceValidTo, today)),
        ),
      )
      .returning({ userId: deliveryAgentProfiles.userId });
    const expiredVehicle = await this.db
      .update(deliveryAgentProfiles)
      .set({ vehicleStatus: 'EXPIRED' })
      .where(
        and(
          eq(deliveryAgentProfiles.vehicleStatus, 'VERIFIED'),
          or(lt(deliveryAgentProfiles.vehicleNextDueAt, now), lt(deliveryAgentProfiles.vehicleRcValidTo, today)),
        ),
      )
      .returning({ userId: deliveryAgentProfiles.userId });

    const expiredIds = [...new Set([...expiredLicence, ...expiredVehicle].map((r) => r.userId))];
    if (expiredIds.length) {
      await this.db
        .update(deliveryAgentProfiles)
        .set({ agentStatus: 'KYC_BLOCKED', lastFailureReason: 'Re-verification overdue' })
        .where(and(inArray(deliveryAgentProfiles.userId, expiredIds), eq(deliveryAgentProfiles.agentStatus, 'ACTIVE')));
      await this.notifier.sendMany(
        expiredIds.map((userId) => ({
          userId,
          type: 'KYC_EXPIRED' as const,
          title: 'Verification expired',
          body: 'Re-verify your documents in Orqland Run to receive new deliveries again.',
        })),
      );
    }

    const horizon = new Date(now.getTime() + deliveryConfig.reKycReminderDays * 86_400_000);
    const dueSoon = await this.db
      .select({
        userId: deliveryAgentProfiles.userId,
        licenceDue: deliveryAgentProfiles.licenceNextDueAt,
        vehicleDue: deliveryAgentProfiles.vehicleNextDueAt,
      })
      .from(deliveryAgentProfiles)
      .where(
        and(
          eq(deliveryAgentProfiles.agentStatus, 'ACTIVE'),
          or(
            sql`${deliveryAgentProfiles.licenceNextDueAt} BETWEEN ${now} AND ${horizon}`,
            lte(deliveryAgentProfiles.vehicleNextDueAt, horizon),
          ),
        ),
      );
    await this.notifier.sendMany(
      dueSoon.map((row) => {
        const which = row.licenceDue && row.licenceDue <= horizon ? 'driving licence' : 'vehicle registration';
        return {
          userId: row.userId,
          type: 'KYC_REVERIFICATION_DUE' as const,
          title: 'Re-verification due soon',
          body: `Your ${which} re-verification is due soon. Complete it in Orqland Run to keep receiving deliveries.`,
        };
      }),
    );

    this.logger.log(`re-KYC sweep: ${expiredIds.length} blocked, ${dueSoon.length} reminded`);
    return { expired: expiredIds.length, reminded: dueSoon.length };
  }
}
