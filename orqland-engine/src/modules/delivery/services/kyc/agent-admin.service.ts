import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, count, desc, eq, ilike, inArray, or, type SQL } from 'drizzle-orm';
import type { AuthUser } from '@/core/decorators/current-user.decorator';
import { DRIZZLE, type DrizzleDB } from '@/infrastructure/database/drizzle.module';
import { deliveryAgentProfiles, deliveryOffers, deliveryTasks, orqspaceAgentConnections, orqUsers } from '@/infrastructure/database/schema';
import type { PlatformAgentsFilterInput } from '../../dto/inputs/support.inputs';
import type { PlatformDeliveryAgentPageType, PlatformDeliveryAgentType } from '../../dto/types/agent.type';
import { AuditService } from '@/modules/orders/services/shared/audit.service';
import { DeliveryNotifierService } from '../notifications/delivery-notifier.service';
import { AgentRegistrationService } from './agent-registration.service';

/** Platform-level agent controls (workspaces can only disconnect, never suspend globally). */
@Injectable()
export class AgentAdminService {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    private readonly registration: AgentRegistrationService,
    private readonly audit: AuditService,
    private readonly notifier: DeliveryNotifierService,
  ) {}

  async suspend(admin: AuthUser, userId: string, reason: string) {
    await this.db.transaction(async (tx) => {
      const [profile] = await tx.select().from(deliveryAgentProfiles).where(eq(deliveryAgentProfiles.userId, userId)).for('update');
      if (!profile) throw new NotFoundException('Agent not found');
      if (profile.agentStatus === 'SUSPENDED') throw new BadRequestException('Agent is already suspended');
      await tx
        .update(deliveryAgentProfiles)
        .set({ agentStatus: 'SUSPENDED', availability: 'OFFLINE', suspendedReason: reason, suspendedAt: new Date(), suspendedByUserId: admin.id })
        .where(eq(deliveryAgentProfiles.userId, userId));
      // Open offers are withdrawn by the offer-expiry job's eligibility re-check; withdraw them now for immediacy.
      await tx
        .update(deliveryOffers)
        .set({ status: 'WITHDRAWN', respondedAt: new Date(), declineReason: 'Agent suspended' })
        .where(and(eq(deliveryOffers.agentUserId, userId), eq(deliveryOffers.status, 'OFFERED')));
      await this.audit.record(tx, {
        entityType: 'delivery_agent',
        entityId: userId,
        action: 'agent.suspended',
        actorUserId: admin.id,
        actorRole: 'PLATFORM_ADMIN',
        reason,
        before: { agentStatus: profile.agentStatus },
        after: { agentStatus: 'SUSPENDED' },
      });
    });
    await this.notifier.send({ userId, type: 'AGENT_SUSPENDED', title: 'Delivery account suspended', body: reason });
    return this.registration.toProfileType(await this.load(userId));
  }

  async reinstate(admin: AuthUser, userId: string, reason: string) {
    await this.db.transaction(async (tx) => {
      const [profile] = await tx.select().from(deliveryAgentProfiles).where(eq(deliveryAgentProfiles.userId, userId)).for('update');
      if (!profile) throw new NotFoundException('Agent not found');
      if (profile.agentStatus !== 'SUSPENDED') throw new BadRequestException('Agent is not suspended');
      await tx
        .update(deliveryAgentProfiles)
        .set({ agentStatus: 'KYC_BLOCKED', suspendedReason: null, suspendedAt: null, suspendedByUserId: null })
        .where(eq(deliveryAgentProfiles.userId, userId));
      await this.registration.recomputeStatus(tx, userId);
      await this.audit.record(tx, {
        entityType: 'delivery_agent',
        entityId: userId,
        action: 'agent.reinstated',
        actorUserId: admin.id,
        actorRole: 'PLATFORM_ADMIN',
        reason,
      });
    });
    await this.notifier.send({ userId, type: 'AGENT_REINSTATED', title: 'Delivery account reinstated', body: reason });
    return this.registration.toProfileType(await this.load(userId));
  }

  /** KYC review queue and agent directory for the admin portal. */
  async list(filter: PlatformAgentsFilterInput): Promise<PlatformDeliveryAgentPageType> {
    const conditions: SQL[] = [];
    if (filter.statuses?.length) conditions.push(inArray(deliveryAgentProfiles.agentStatus, filter.statuses));
    if (filter.search?.trim()) {
      const term = `%${filter.search.trim()}%`;
      conditions.push(or(ilike(orqUsers.orqUserId, term), ilike(orqUsers.displayName, term), ilike(orqUsers.fname, term))!);
    }
    const where = conditions.length ? and(...conditions) : undefined;
    const [{ total }] = await this.db
      .select({ total: count() })
      .from(deliveryAgentProfiles)
      .innerJoin(orqUsers, eq(orqUsers.id, deliveryAgentProfiles.userId))
      .where(where);
    const rows = await this.db
      .select({ profile: deliveryAgentProfiles, user: orqUsers })
      .from(deliveryAgentProfiles)
      .innerJoin(orqUsers, eq(orqUsers.id, deliveryAgentProfiles.userId))
      .where(where)
      .orderBy(desc(deliveryAgentProfiles.updatedAt))
      .limit(filter.pageSize)
      .offset((filter.page - 1) * filter.pageSize);
    return { items: await this.toPlatformTypes(rows), total, page: filter.page, pageSize: filter.pageSize };
  }

  async get(userId: string): Promise<PlatformDeliveryAgentType> {
    const rows = await this.db
      .select({ profile: deliveryAgentProfiles, user: orqUsers })
      .from(deliveryAgentProfiles)
      .innerJoin(orqUsers, eq(orqUsers.id, deliveryAgentProfiles.userId))
      .where(eq(deliveryAgentProfiles.userId, userId));
    if (!rows.length) throw new NotFoundException('Agent not found');
    return (await this.toPlatformTypes(rows))[0];
  }

  private async toPlatformTypes(
    rows: { profile: typeof deliveryAgentProfiles.$inferSelect; user: typeof orqUsers.$inferSelect }[],
  ): Promise<PlatformDeliveryAgentType[]> {
    if (!rows.length) return [];
    const ids = rows.map((r) => r.profile.userId);
    const connections = await this.db
      .select({ agentUserId: orqspaceAgentConnections.agentUserId, n: count() })
      .from(orqspaceAgentConnections)
      .where(and(inArray(orqspaceAgentConnections.agentUserId, ids), eq(orqspaceAgentConnections.status, 'ACTIVE')))
      .groupBy(orqspaceAgentConnections.agentUserId);
    const delivered = await this.db
      .select({ agentUserId: deliveryTasks.agentUserId, n: count() })
      .from(deliveryTasks)
      .where(and(inArray(deliveryTasks.agentUserId, ids), eq(deliveryTasks.status, 'DELIVERED')))
      .groupBy(deliveryTasks.agentUserId);
    const conn = new Map(connections.map((c) => [c.agentUserId, c.n]));
    const done = new Map(delivered.map((d) => [d.agentUserId!, d.n]));
    return Promise.all(
      rows.map(async ({ profile, user }) => ({
        profile: await this.registration.toProfileType(profile),
        phone: user.phone,
        email: user.email,
        activeConnections: conn.get(profile.userId) ?? 0,
        completedDeliveries: done.get(profile.userId) ?? 0,
        createdAt: profile.createdAt,
      })),
    );
  }

  private async load(userId: string) {
    const [row] = await this.db.select().from(deliveryAgentProfiles).where(eq(deliveryAgentProfiles.userId, userId));
    return row;
  }
}
