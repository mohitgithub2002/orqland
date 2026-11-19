import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, desc, eq, gte, inArray, lte, lt } from 'drizzle-orm';
import type { AuthUser } from '@/core/decorators/current-user.decorator';
import { DRIZZLE, type DrizzleDB } from '@/infrastructure/database/drizzle.module';
import { deliveryAgentProfiles, deliveryLocationPings, deliveryTasks } from '@/infrastructure/database/schema';
import type { DbExecutor } from '@/core/utils/db-executor';
import { OrqspaceAccessService } from '@/modules/orders/services/shared/orqspace-access.service';
import type { LocationPingInput } from '../../dto/inputs/task.inputs';
import type { LocationPointType } from '../../dto/types/delivery-task.type';
import { deliveryConfig } from '@/config/delivery.config';
import { AGENT_LOAD_STATUSES } from '../../helpers/delivery-state-machine';
import { round2, traceDistanceKm } from '../../helpers/geo';

export interface PingResult {
  accepted: boolean;
  trackingActive: boolean;
  reason: string | null;
}

/**
 * Purpose-limited location capture: pings are stored only while the agent is ONLINE/BUSY or has an active task,
 * and are visible to a workspace only for its own tasks. Old pings are purged by the retention job.
 */
@Injectable()
export class TrackingService {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    private readonly access: OrqspaceAccessService,
  ) {}

  async recordPing(user: AuthUser, input: LocationPingInput): Promise<PingResult> {
    const [profile] = await this.db.select().from(deliveryAgentProfiles).where(eq(deliveryAgentProfiles.userId, user.id));
    if (!profile) throw new NotFoundException('You are not registered as a delivery agent');

    const [activeTask] = await this.db
      .select({ id: deliveryTasks.id })
      .from(deliveryTasks)
      .where(and(eq(deliveryTasks.agentUserId, user.id), inArray(deliveryTasks.status, AGENT_LOAD_STATUSES)))
      .orderBy(desc(deliveryTasks.acceptedAt))
      .limit(1);
    const trackingActive = profile.availability !== 'OFFLINE' || !!activeTask;
    if (!trackingActive) return { accepted: false, trackingActive, reason: 'Tracking is off while you are offline' };

    if (input.accuracyM !== undefined && input.accuracyM > deliveryConfig.maxPingAccuracyMeters * 5) {
      return { accepted: false, trackingActive, reason: 'Location too inaccurate' };
    }
    const recordedAt = new Date(input.recordedAt);
    const now = Date.now();
    if (recordedAt.getTime() > now + 60_000 || recordedAt.getTime() < now - 15 * 60_000) {
      throw new BadRequestException('recordedAt is outside the accepted window');
    }
    if (profile.lastLocationAt && recordedAt.getTime() - profile.lastLocationAt.getTime() < deliveryConfig.minPingIntervalSeconds * 1000) {
      return { accepted: false, trackingActive, reason: 'Too frequent' };
    }

    await this.db.transaction(async (tx) => {
      await tx.insert(deliveryLocationPings).values({
        agentUserId: user.id,
        taskId: activeTask?.id ?? null,
        lat: input.lat.toFixed(6),
        lng: input.lng.toFixed(6),
        accuracyM: input.accuracyM ?? null,
        speedMps: input.speedMps ?? null,
        heading: input.heading ?? null,
        recordedAt,
      });
      await tx
        .update(deliveryAgentProfiles)
        .set({ lastLat: input.lat.toFixed(6), lastLng: input.lng.toFixed(6), lastLocationAt: recordedAt })
        .where(eq(deliveryAgentProfiles.userId, user.id));
    });
    return { accepted: true, trackingActive, reason: null };
  }

  /** GPS trace for one task (workspace scope). */
  async taskTrace(user: AuthUser, taskId: string): Promise<LocationPointType[]> {
    const [task] = await this.db
      .select({ orqspaceId: deliveryTasks.orqspaceId, agentUserId: deliveryTasks.agentUserId })
      .from(deliveryTasks)
      .where(eq(deliveryTasks.id, taskId));
    if (!task) throw new NotFoundException('Task not found');
    // The assigned agent sees their own route; otherwise only the workspace that owns the delivery.
    if (task.agentUserId !== user.id) await this.access.assertCanManage(user, task.orqspaceId);
    const rows = await this.db
      .select()
      .from(deliveryLocationPings)
      .where(eq(deliveryLocationPings.taskId, taskId))
      .orderBy(asc(deliveryLocationPings.recordedAt))
      .limit(2000);
    return rows.map((r) => ({ lat: Number(r.lat), lng: Number(r.lng), recordedAt: r.recordedAt, accuracyM: r.accuracyM }));
  }

  /** Distance travelled between pickup and now, from accurate pings only. */
  async measuredDistanceKm(exec: DbExecutor, taskId: string, from: Date | null, to: Date): Promise<number | null> {
    if (!from) return null;
    const rows = await exec
      .select({ lat: deliveryLocationPings.lat, lng: deliveryLocationPings.lng, accuracyM: deliveryLocationPings.accuracyM })
      .from(deliveryLocationPings)
      .where(
        and(
          eq(deliveryLocationPings.taskId, taskId),
          gte(deliveryLocationPings.recordedAt, from),
          lte(deliveryLocationPings.recordedAt, to),
        ),
      )
      .orderBy(asc(deliveryLocationPings.recordedAt));
    const points = rows
      .filter((r) => r.accuracyM === null || r.accuracyM <= deliveryConfig.maxPingAccuracyMeters)
      .map((r) => ({ lat: Number(r.lat), lng: Number(r.lng) }));
    return points.length >= 2 ? round2(traceDistanceKm(points)) : null;
  }

  async purgeOlderThan(days: number): Promise<number> {
    const cutoff = new Date(Date.now() - days * 86_400_000);
    const rows = await this.db
      .delete(deliveryLocationPings)
      .where(lt(deliveryLocationPings.receivedAt, cutoff))
      .returning({ id: deliveryLocationPings.id });
    return rows.length;
  }
}
