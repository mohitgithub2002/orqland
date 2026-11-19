import { Inject, Injectable } from '@nestjs/common';
import { and, count, eq, inArray } from 'drizzle-orm';
import { DRIZZLE, type DrizzleDB } from '@/infrastructure/database/drizzle.module';
import { deliveryAgentProfiles, deliveryTasks, orqUsers } from '@/infrastructure/database/schema';
import type { DbExecutor } from '@/core/utils/db-executor';
import type { DeliveryAgentSummaryType } from '../../dto/types/agent.type';
import { assessAgentKyc } from '../../helpers/agent-eligibility';
import { AGENT_LOAD_STATUSES } from '../../helpers/delivery-state-machine';

export type AgentProfileRow = typeof deliveryAgentProfiles.$inferSelect;

export const displayNameOf = (u: { displayName: string | null; fname: string | null; lname: string | null; orqUserId: string }) =>
  u.displayName || [u.fname, u.lname].filter(Boolean).join(' ') || u.orqUserId;

/** Builds workspace-facing agent summaries. Contact + location are only included when `connected` is true. */
@Injectable()
export class AgentDirectoryService {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB) {}

  async summaries(userIds: string[], connected: boolean, exec: DbExecutor = this.db): Promise<Map<string, DeliveryAgentSummaryType>> {
    const ids = [...new Set(userIds)];
    const result = new Map<string, DeliveryAgentSummaryType>();
    if (!ids.length) return result;

    const rows = await exec
      .select({ user: orqUsers, profile: deliveryAgentProfiles })
      .from(deliveryAgentProfiles)
      .innerJoin(orqUsers, eq(orqUsers.id, deliveryAgentProfiles.userId))
      .where(inArray(deliveryAgentProfiles.userId, ids));
    const loads = await this.activeTaskCounts(ids, exec);

    for (const { user, profile } of rows) {
      result.set(profile.userId, {
        userId: profile.userId,
        orqUserId: user.orqUserId,
        displayName: displayNameOf(user),
        avatar: user.avatar,
        phone: connected ? user.phone : null,
        agentStatus: profile.agentStatus,
        availability: profile.availability,
        vehicleCategory: profile.vehicleCategory,
        vehicleNumberMasked: profile.vehicleNumberMasked,
        kycValid: assessAgentKyc(profile).valid,
        activeTaskCount: loads.get(profile.userId) ?? 0,
        lastLat: connected && profile.lastLat !== null ? Number(profile.lastLat) : null,
        lastLng: connected && profile.lastLng !== null ? Number(profile.lastLng) : null,
        lastLocationAt: connected ? profile.lastLocationAt : null,
      });
    }
    return result;
  }

  async summary(userId: string, connected: boolean, exec: DbExecutor = this.db) {
    return (await this.summaries([userId], connected, exec)).get(userId) ?? null;
  }

  async activeTaskCounts(userIds: string[], exec: DbExecutor = this.db): Promise<Map<string, number>> {
    if (!userIds.length) return new Map();
    const rows = await exec
      .select({ agentUserId: deliveryTasks.agentUserId, n: count() })
      .from(deliveryTasks)
      .where(and(inArray(deliveryTasks.agentUserId, userIds), inArray(deliveryTasks.status, AGENT_LOAD_STATUSES)))
      .groupBy(deliveryTasks.agentUserId);
    return new Map(rows.map((r) => [r.agentUserId!, r.n]));
  }
}
