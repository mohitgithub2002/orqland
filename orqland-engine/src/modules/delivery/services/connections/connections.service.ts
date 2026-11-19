import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, count, desc, eq, gte, inArray, lt, notInArray, sql } from 'drizzle-orm';
import type { AuthUser } from '@/core/decorators/current-user.decorator';
import { DRIZZLE, type DrizzleDB } from '@/infrastructure/database/drizzle.module';
import {
  deliveryAgentAssignments,
  deliveryAgentProfiles,
  deliveryTasks,
  orqspaceAgentConnections,
  orqspaceAgentRateHistory,
  orqspaces,
  orqUsers,
  type AgentConnectionStatus,
} from '@/infrastructure/database/schema';
import { isUniqueViolation, type DbExecutor, type DbTx } from '@/core/utils/db-executor';
import { AuditService } from '@/modules/orders/services/shared/audit.service';
import { OrqspaceAccessService } from '@/modules/orders/services/shared/orqspace-access.service';
import type {
  ConnectionReasonInput,
  InviteDeliveryAgentInput,
  RespondToInvitationInput,
  SearchDeliveryAgentInput,
  UpdateConnectionRateInput,
  WorkspaceConnectionsFilterInput,
} from '../../dto/inputs/connection.inputs';
import type { AgentConnectionType, AgentRateHistoryType, AgentSearchResultType } from '../../dto/types/connection.type';
import { assessAgentKyc } from '../../helpers/agent-eligibility';
import { deliveryConfig } from '@/config/delivery.config';
import { TERMINAL_TASK_STATUSES } from '../../helpers/delivery-state-machine';
import { AgentDirectoryService } from '../agents/agent-directory.service';
import { DeliveryNotifierService } from '../notifications/delivery-notifier.service';
import { DeliverySettingsService } from '../settings/delivery-settings.service';

export type ConnectionRow = typeof orqspaceAgentConnections.$inferSelect;

/**
 * Module C — workspace ↔ delivery agent connections.
 * Mutual consent (workspace invites, agent accepts); hard limits of 5 active connections per side,
 * enforced under row locks so concurrent accepts can never exceed them.
 */
@Injectable()
export class ConnectionsService {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    private readonly access: OrqspaceAccessService,
    private readonly audit: AuditService,
    private readonly notifier: DeliveryNotifierService,
    private readonly directory: AgentDirectoryService,
    private readonly settings: DeliverySettingsService,
  ) {}

  // ── workspace side ─────────────────────────────────────────────────────

  async searchAgent(user: AuthUser, input: SearchDeliveryAgentInput): Promise<AgentSearchResultType> {
    await this.access.assertCanManage(user, input.orqspaceId);
    const workspaceActive = await this.countActive({ orqspaceId: input.orqspaceId });
    const base = {
      agent: null,
      existingConnection: null,
      workspaceActiveConnections: workspaceActive,
      workspaceConnectionLimit: deliveryConfig.maxAgentsPerWorkspace,
    };

    const [target] = await this.db
      .select({ user: orqUsers, profile: deliveryAgentProfiles })
      .from(orqUsers)
      .leftJoin(deliveryAgentProfiles, eq(deliveryAgentProfiles.userId, orqUsers.id))
      .where(sql`upper(${orqUsers.orqUserId}) = ${input.orqUserId.trim().toUpperCase()}`);
    if (!target) return { ...base, canInvite: false, reason: 'No Orqland user with this Orq ID' };
    if (!target.profile || !['ACTIVE', 'KYC_BLOCKED'].includes(target.profile.agentStatus)) {
      return { ...base, canInvite: false, reason: 'This user is not a verified delivery agent' };
    }

    const [live] = await this.db
      .select()
      .from(orqspaceAgentConnections)
      .where(
        and(
          eq(orqspaceAgentConnections.orqspaceId, input.orqspaceId),
          eq(orqspaceAgentConnections.agentUserId, target.user.id),
          inArray(orqspaceAgentConnections.status, ['PENDING', 'ACTIVE']),
        ),
      );
    const agent = await this.directory.summary(target.user.id, live?.status === 'ACTIVE');
    const existingConnection = live ? await this.toType(live) : null;
    const agentActive = await this.countActive({ agentUserId: target.user.id });
    const kyc = assessAgentKyc(target.profile);

    const reason = live
      ? live.status === 'ACTIVE'
        ? 'Already connected to this workspace'
        : 'An invitation is already pending'
      : !kyc.valid
        ? 'Agent verification is not currently valid'
        : workspaceActive >= deliveryConfig.maxAgentsPerWorkspace
          ? `This workspace already has ${deliveryConfig.maxAgentsPerWorkspace} active agents`
          : agentActive >= deliveryConfig.maxWorkspacesPerAgent
            ? `This agent is already connected to ${deliveryConfig.maxWorkspacesPerAgent} workspaces`
            : null;
    return { ...base, agent, existingConnection, canInvite: reason === null, reason };
  }

  async invite(user: AuthUser, input: InviteDeliveryAgentInput): Promise<AgentConnectionType> {
    const actor = await this.access.assertCanManage(user, input.orqspaceId);
    const search = await this.searchAgent(user, input);
    if (!search.canInvite || !search.agent) throw new BadRequestException(search.reason ?? 'Agent cannot be invited');
    const agentUserId = search.agent.userId;
    if (agentUserId === actor.orqspace.ownerId) throw new BadRequestException('You cannot invite yourself');

    const connection = await this.db.transaction(async (tx) => {
      await this.settings.lock(tx, input.orqspaceId);
      const [{ pending }] = await tx
        .select({ pending: count() })
        .from(orqspaceAgentConnections)
        .where(and(eq(orqspaceAgentConnections.orqspaceId, input.orqspaceId), eq(orqspaceAgentConnections.status, 'PENDING')));
      if (pending >= deliveryConfig.maxPendingInvitesPerWorkspace) {
        throw new BadRequestException('Too many pending invitations. Cancel some before inviting more.');
      }
      const [{ recent }] = await tx
        .select({ recent: count() })
        .from(orqspaceAgentConnections)
        .where(
          and(
            eq(orqspaceAgentConnections.orqspaceId, input.orqspaceId),
            eq(orqspaceAgentConnections.agentUserId, agentUserId),
            gte(orqspaceAgentConnections.invitedAt, new Date(Date.now() - 30 * 86_400_000)),
          ),
        );
      if (recent >= deliveryConfig.maxInvitesToSameAgentPer30Days) {
        throw new BadRequestException('This agent has been invited too many times recently');
      }

      try {
        const [created] = await tx
          .insert(orqspaceAgentConnections)
          .values({
            orqspaceId: input.orqspaceId,
            agentUserId,
            status: 'PENDING',
            initiatedByUserId: actor.userId,
            initiatedByRole: 'WORKSPACE',
            currentRatePerKm: input.ratePerKm,
            inviteMessage: input.message ?? null,
            inviteExpiresAt: new Date(Date.now() + deliveryConfig.inviteExpiryDays * 86_400_000),
          })
          .returning();
        await tx.insert(orqspaceAgentRateHistory).values({
          connectionId: created.id,
          ratePerKm: input.ratePerKm,
          setByUserId: actor.userId,
          reason: 'Initial rate on invitation',
        });
        await this.audit.record(tx, {
          entityType: 'agent_connection',
          entityId: created.id,
          action: 'connection.invited',
          actorUserId: actor.userId,
          actorRole: actor.role,
          after: { agentUserId, ratePerKm: input.ratePerKm },
        });
        return created;
      } catch (error) {
        if (isUniqueViolation(error, 'orqspace_agent_connections_live_uq')) {
          throw new ConflictException('This agent already has a pending or active connection with the workspace');
        }
        throw error;
      }
    });

    await this.notifier.send({
      userId: agentUserId,
      type: 'CONNECTION_INVITED',
      title: `${actor.orqspace.name} invited you to deliver`,
      body: `Rate ₹${input.ratePerKm}/km. Review the invitation in Orqland Run.`,
      data: { connectionId: connection.id },
    });
    return this.toType(connection);
  }

  async cancelInvite(user: AuthUser, input: ConnectionReasonInput): Promise<AgentConnectionType> {
    const connection = await this.load(input.connectionId);
    const actor = await this.access.assertCanManage(user, connection.orqspaceId);
    const updated = await this.db.transaction(async (tx) => {
      const [row] = await tx
        .update(orqspaceAgentConnections)
        .set({ status: 'CANCELLED', respondedAt: new Date(), disconnectReason: input.reason })
        .where(and(eq(orqspaceAgentConnections.id, connection.id), eq(orqspaceAgentConnections.status, 'PENDING')))
        .returning();
      if (!row) throw new BadRequestException('Only pending invitations can be cancelled');
      await this.audit.record(tx, {
        entityType: 'agent_connection',
        entityId: connection.id,
        action: 'connection.invite_cancelled',
        actorUserId: actor.userId,
        actorRole: actor.role,
        reason: input.reason,
      });
      return row;
    });
    return this.toType(updated);
  }

  async updateRate(user: AuthUser, input: UpdateConnectionRateInput): Promise<AgentConnectionType> {
    const connection = await this.load(input.connectionId);
    const actor = await this.access.assertCanManage(user, connection.orqspaceId);
    if (!['PENDING', 'ACTIVE'].includes(connection.status)) throw new BadRequestException('Connection is not active');
    if (Number(input.ratePerKm) <= 0) throw new BadRequestException('Rate must be greater than zero');

    const updated = await this.db.transaction(async (tx) => {
      const [row] = await tx
        .update(orqspaceAgentConnections)
        .set({ currentRatePerKm: input.ratePerKm })
        .where(eq(orqspaceAgentConnections.id, connection.id))
        .returning();
      await tx.insert(orqspaceAgentRateHistory).values({
        connectionId: connection.id,
        ratePerKm: input.ratePerKm,
        setByUserId: actor.userId,
        reason: input.reason,
      });
      await this.audit.record(tx, {
        entityType: 'agent_connection',
        entityId: connection.id,
        action: 'connection.rate_changed',
        actorUserId: actor.userId,
        actorRole: actor.role,
        reason: input.reason,
        before: { ratePerKm: connection.currentRatePerKm },
        after: { ratePerKm: input.ratePerKm },
      });
      return row;
    });
    await this.notifier.send({
      userId: connection.agentUserId,
      type: 'CONNECTION_RATE_CHANGED',
      title: 'Your per-km rate changed',
      body: `New rate: ₹${input.ratePerKm}/km. Deliveries already accepted keep their original rate.`,
    });
    return this.toType(updated);
  }

  async disconnectByWorkspace(user: AuthUser, input: ConnectionReasonInput): Promise<AgentConnectionType> {
    const connection = await this.load(input.connectionId);
    const actor = await this.access.assertCanManage(user, connection.orqspaceId);
    if (input.afterActiveDeliveries && (await this.openTaskCount(this.db, connection)) > 0) {
      const requested = await this.requestDisconnect(connection, actor.userId, actor.role, input.reason);
      await this.notifier.send({
        userId: connection.agentUserId,
        type: 'CONNECTION_DISCONNECT_REQUESTED',
        title: `${actor.orqspace.name} will end the delivery connection`,
        body: `The connection closes after your active deliveries are finished. ${input.reason}`,
      });
      return requested;
    }
    const updated = await this.disconnect(connection, actor.userId, actor.role, input.reason);
    await this.notifier.send({
      userId: connection.agentUserId,
      type: 'CONNECTION_DISCONNECTED',
      title: `${actor.orqspace.name} ended the delivery connection`,
      body: input.reason,
    });
    return updated;
  }

  async listForWorkspace(user: AuthUser, filter: WorkspaceConnectionsFilterInput): Promise<AgentConnectionType[]> {
    await this.access.assertCanManage(user, filter.orqspaceId);
    const statuses: AgentConnectionStatus[] = filter.statuses?.length ? filter.statuses : ['PENDING', 'ACTIVE'];
    const rows = await this.db
      .select()
      .from(orqspaceAgentConnections)
      .where(and(eq(orqspaceAgentConnections.orqspaceId, filter.orqspaceId), inArray(orqspaceAgentConnections.status, statuses)))
      .orderBy(desc(orqspaceAgentConnections.invitedAt));
    return this.toTypes(rows);
  }

  // ── agent side ─────────────────────────────────────────────────────────

  async respond(user: AuthUser, input: RespondToInvitationInput): Promise<AgentConnectionType> {
    const connection = await this.load(input.connectionId);
    if (connection.agentUserId !== user.id) throw new NotFoundException('Invitation not found');
    if (connection.status !== 'PENDING') throw new BadRequestException('This invitation is no longer pending');
    if (connection.inviteExpiresAt < new Date()) throw new BadRequestException('This invitation has expired');

    const updated = await this.db.transaction(async (tx) => {
      if (!input.accept) {
        const [row] = await tx
          .update(orqspaceAgentConnections)
          .set({ status: 'DECLINED', respondedAt: new Date() })
          .where(and(eq(orqspaceAgentConnections.id, connection.id), eq(orqspaceAgentConnections.status, 'PENDING')))
          .returning();
        if (!row) throw new ConflictException('Invitation changed, refresh and retry');
        return row;
      }

      // Lock order: workspace settings row, then agent profile row (consistent order prevents deadlocks).
      await this.settings.lock(tx, connection.orqspaceId);
      const [profile] = await tx
        .select()
        .from(deliveryAgentProfiles)
        .where(eq(deliveryAgentProfiles.userId, user.id))
        .for('update');
      const kyc = assessAgentKyc(profile);
      if (!kyc.valid) throw new BadRequestException(`Complete verification first: ${kyc.reasons.join('; ')}`);

      const workspaceActive = await this.countActive({ orqspaceId: connection.orqspaceId }, tx);
      if (workspaceActive >= deliveryConfig.maxAgentsPerWorkspace) {
        throw new ConflictException('This workspace has reached its delivery-agent limit');
      }
      const agentActive = await this.countActive({ agentUserId: user.id }, tx);
      if (agentActive >= deliveryConfig.maxWorkspacesPerAgent) {
        throw new ConflictException(`You can be connected to at most ${deliveryConfig.maxWorkspacesPerAgent} workspaces`);
      }

      const now = new Date();
      const [row] = await tx
        .update(orqspaceAgentConnections)
        .set({ status: 'ACTIVE', respondedAt: now, activatedAt: now })
        .where(and(eq(orqspaceAgentConnections.id, connection.id), eq(orqspaceAgentConnections.status, 'PENDING')))
        .returning();
      if (!row) throw new ConflictException('Invitation changed, refresh and retry');

      // Keep the legacy mapping in sync for existing ORQLAND code that reads it.
      await tx
        .insert(deliveryAgentAssignments)
        .values({ deliveryAgentUserId: user.id, orqspaceId: connection.orqspaceId, assignedAt: now, revokedAt: null })
        .onConflictDoUpdate({
          target: [deliveryAgentAssignments.deliveryAgentUserId, deliveryAgentAssignments.orqspaceId],
          set: { assignedAt: now, revokedAt: null },
        });
      await this.audit.record(tx, {
        entityType: 'agent_connection',
        entityId: connection.id,
        action: 'connection.accepted',
        actorUserId: user.id,
        actorRole: 'AGENT',
        after: { ratePerKm: connection.currentRatePerKm },
      });
      return row;
    });

    const [space] = await this.db.select({ ownerId: orqspaces.ownerId }).from(orqspaces).where(eq(orqspaces.id, connection.orqspaceId));
    await this.notifier.send({
      userId: space.ownerId,
      type: input.accept ? 'CONNECTION_ACCEPTED' : 'CONNECTION_DECLINED',
      title: input.accept ? 'Delivery agent connected' : 'Delivery invitation declined',
      body: `Connection ${connection.id.slice(0, 8)} is now ${updated.status}.`,
    });
    return this.toType(updated);
  }

  async disconnectByAgent(user: AuthUser, input: ConnectionReasonInput): Promise<AgentConnectionType> {
    const connection = await this.load(input.connectionId);
    if (connection.agentUserId !== user.id) throw new NotFoundException('Connection not found');
    const [space] = await this.db.select({ ownerId: orqspaces.ownerId }).from(orqspaces).where(eq(orqspaces.id, connection.orqspaceId));
    if (input.afterActiveDeliveries && (await this.openTaskCount(this.db, connection)) > 0) {
      const requested = await this.requestDisconnect(connection, user.id, 'AGENT', input.reason);
      await this.notifier.send({
        userId: space.ownerId,
        type: 'CONNECTION_DISCONNECT_REQUESTED',
        title: 'A delivery agent requested disconnection',
        body: `New deliveries are no longer offered to this agent. The connection closes after their active deliveries. ${input.reason}`,
      });
      return requested;
    }
    const updated = await this.disconnect(connection, user.id, 'AGENT', input.reason);
    await this.notifier.send({
      userId: space.ownerId,
      type: 'CONNECTION_DISCONNECTED',
      title: 'A delivery agent disconnected',
      body: input.reason,
    });
    return updated;
  }

  async listForAgent(agentUserId: string, statuses: AgentConnectionStatus[]): Promise<AgentConnectionType[]> {
    const rows = await this.db
      .select()
      .from(orqspaceAgentConnections)
      .where(and(eq(orqspaceAgentConnections.agentUserId, agentUserId), inArray(orqspaceAgentConnections.status, statuses)))
      .orderBy(desc(orqspaceAgentConnections.invitedAt));
    return this.toTypes(rows);
  }

  /** The side that requested a pending disconnection can withdraw it while it is still pending. */
  async withdrawDisconnectRequest(user: AuthUser, connectionId: string): Promise<AgentConnectionType> {
    const connection = await this.load(connectionId);
    const isAgent = connection.agentUserId === user.id;
    if (!isAgent) await this.access.assertCanManage(user, connection.orqspaceId);
    if (connection.disconnectRequestStatus !== 'REQUESTED') throw new BadRequestException('There is no pending disconnection request');
    if ((connection.disconnectRequestedByRole === 'AGENT') !== isAgent) {
      throw new ForbiddenException('Only the side that requested the disconnection can withdraw it');
    }
    const [row] = await this.db.transaction(async (tx) => {
      const updated = await tx
        .update(orqspaceAgentConnections)
        .set({ disconnectRequestStatus: 'WITHDRAWN' })
        .where(and(eq(orqspaceAgentConnections.id, connection.id), eq(orqspaceAgentConnections.disconnectRequestStatus, 'REQUESTED')))
        .returning();
      await this.audit.record(tx, {
        entityType: 'agent_connection',
        entityId: connection.id,
        action: 'connection.disconnect_request_withdrawn',
        actorUserId: user.id,
        actorRole: isAgent ? 'AGENT' : 'WORKSPACE',
      });
      return updated;
    });
    if (!row) throw new ConflictException('Connection changed, refresh and retry');
    return this.toType(row);
  }

  /**
   * Completes pending disconnect requests whose agent has no active deliveries left for that workspace.
   * Runs from the delivery jobs and right after an agent finishes a delivery.
   */
  async finalizeRequestedDisconnects(filter: { agentUserId?: string } = {}): Promise<number> {
    const conditions = [
      eq(orqspaceAgentConnections.status, 'ACTIVE' as const),
      eq(orqspaceAgentConnections.disconnectRequestStatus, 'REQUESTED' as const),
    ];
    if (filter.agentUserId) conditions.push(eq(orqspaceAgentConnections.agentUserId, filter.agentUserId));
    const pending = await this.db.select().from(orqspaceAgentConnections).where(and(...conditions)).limit(200);
    let completed = 0;
    for (const connection of pending) {
      if ((await this.openTaskCount(this.db, connection)) > 0) continue;
      try {
        await this.disconnect(
          connection,
          connection.disconnectRequestedByUserId ?? connection.agentUserId,
          connection.disconnectRequestedByRole === 'AGENT' ? 'AGENT' : 'WORKSPACE',
          connection.disconnectRequestReason ?? 'Disconnection requested',
          { completingRequest: true },
        );
        completed++;
        const [space] = await this.db.select({ ownerId: orqspaces.ownerId, name: orqspaces.name }).from(orqspaces).where(eq(orqspaces.id, connection.orqspaceId));
        await this.notifier.sendMany([
          { userId: connection.agentUserId, type: 'CONNECTION_DISCONNECTED', title: `Disconnected from ${space.name}`, body: 'Your pending disconnection is complete.' },
          { userId: space.ownerId, type: 'CONNECTION_DISCONNECTED', title: 'Delivery agent disconnected', body: 'The pending disconnection is complete.' },
        ]);
      } catch {
        // A new task slipped in or another instance completed it — the next run retries.
      }
    }
    return completed;
  }

  // ── shared ─────────────────────────────────────────────────────────────

  async rateHistory(connectionId: string): Promise<AgentRateHistoryType[]> {
    return this.db
      .select({
        id: orqspaceAgentRateHistory.id,
        ratePerKm: orqspaceAgentRateHistory.ratePerKm,
        effectiveFrom: orqspaceAgentRateHistory.effectiveFrom,
        reason: orqspaceAgentRateHistory.reason,
      })
      .from(orqspaceAgentRateHistory)
      .where(eq(orqspaceAgentRateHistory.connectionId, connectionId))
      .orderBy(desc(orqspaceAgentRateHistory.effectiveFrom));
  }

  async activeConnection(exec: DbExecutor, orqspaceId: string, agentUserId: string): Promise<ConnectionRow | null> {
    const [row] = await exec
      .select()
      .from(orqspaceAgentConnections)
      .where(
        and(
          eq(orqspaceAgentConnections.orqspaceId, orqspaceId),
          eq(orqspaceAgentConnections.agentUserId, agentUserId),
          eq(orqspaceAgentConnections.status, 'ACTIVE'),
        ),
      );
    return row ?? null;
  }

  async expireStaleInvites(): Promise<number> {
    const rows = await this.db
      .update(orqspaceAgentConnections)
      .set({ status: 'EXPIRED' })
      .where(and(eq(orqspaceAgentConnections.status, 'PENDING'), lt(orqspaceAgentConnections.inviteExpiresAt, new Date())))
      .returning({ id: orqspaceAgentConnections.id });
    return rows.length;
  }

  async assertWorkspaceOwnsConnection(user: AuthUser, connectionId: string) {
    const connection = await this.load(connectionId);
    await this.access.assertCanManage(user, connection.orqspaceId);
    return connection;
  }

  async assertAgentOwnsConnection(user: AuthUser, connectionId: string) {
    const connection = await this.load(connectionId);
    if (connection.agentUserId !== user.id) throw new ForbiddenException();
    return connection;
  }

  private async openTaskCount(exec: DbExecutor, connection: Pick<ConnectionRow, 'orqspaceId' | 'agentUserId'>): Promise<number> {
    const [{ open }] = await exec
      .select({ open: count() })
      .from(deliveryTasks)
      .where(
        and(
          eq(deliveryTasks.orqspaceId, connection.orqspaceId),
          eq(deliveryTasks.agentUserId, connection.agentUserId),
          notInArray(deliveryTasks.status, TERMINAL_TASK_STATUSES),
        ),
      );
    return open;
  }

  /** Records a pending disconnection: no new offers from now on; closes when active deliveries reach zero. */
  private async requestDisconnect(connection: ConnectionRow, actorUserId: string, actorRole: 'WORKSPACE' | 'PLATFORM_ADMIN' | 'AGENT', reason: string) {
    if (connection.status !== 'ACTIVE') throw new BadRequestException('Connection is not active');
    if (connection.disconnectRequestStatus === 'REQUESTED') throw new BadRequestException('A disconnection is already pending');
    return this.db.transaction(async (tx) => {
      const [row] = await tx
        .update(orqspaceAgentConnections)
        .set({
          disconnectRequestStatus: 'REQUESTED',
          disconnectRequestedAt: new Date(),
          disconnectRequestedByUserId: actorUserId,
          disconnectRequestedByRole: actorRole,
          disconnectRequestReason: reason,
        })
        .where(and(eq(orqspaceAgentConnections.id, connection.id), eq(orqspaceAgentConnections.status, 'ACTIVE')))
        .returning();
      if (!row) throw new ConflictException('Connection changed, refresh and retry');
      await this.audit.record(tx, {
        entityType: 'agent_connection',
        entityId: connection.id,
        action: 'connection.disconnect_requested',
        actorUserId,
        actorRole,
        reason,
      });
      return this.toType(row, tx);
    });
  }

  private async disconnect(
    connection: ConnectionRow,
    actorUserId: string,
    actorRole: 'WORKSPACE' | 'PLATFORM_ADMIN' | 'AGENT',
    reason: string,
    opts: { completingRequest?: boolean } = {},
  ) {
    if (connection.status !== 'ACTIVE') throw new BadRequestException('Connection is not active');
    return this.db.transaction(async (tx) => {
      // Lock the connection so a concurrent offer/accept sees the final state.
      await tx.select({ id: orqspaceAgentConnections.id }).from(orqspaceAgentConnections).where(eq(orqspaceAgentConnections.id, connection.id)).for('update');
      const open = await this.openTaskCount(tx, connection);
      if (open > 0) {
        throw new ConflictException({
          code: 'ACTIVE_DELIVERIES',
          message: `The agent has ${open} active deliver${open === 1 ? 'y' : 'ies'} for this workspace. Reassign or complete them first.`,
        });
      }
      const now = new Date();
      const [row] = await tx
        .update(orqspaceAgentConnections)
        .set({
          status: 'DISCONNECTED',
          disconnectedAt: now,
          disconnectedByUserId: actorUserId,
          disconnectReason: reason,
          ...(opts.completingRequest ? { disconnectRequestStatus: 'COMPLETED' as const } : {}),
        })
        .where(and(eq(orqspaceAgentConnections.id, connection.id), eq(orqspaceAgentConnections.status, 'ACTIVE')))
        .returning();
      if (!row) throw new ConflictException('Connection changed, refresh and retry');
      await tx
        .update(deliveryAgentAssignments)
        .set({ revokedAt: now })
        .where(
          and(
            eq(deliveryAgentAssignments.deliveryAgentUserId, connection.agentUserId),
            eq(deliveryAgentAssignments.orqspaceId, connection.orqspaceId),
          ),
        );
      await this.audit.record(tx, {
        entityType: 'agent_connection',
        entityId: connection.id,
        action: 'connection.disconnected',
        actorUserId,
        actorRole,
        reason,
      });
      return this.toType(row, tx);
    });
  }

  private async countActive(where: { orqspaceId?: string; agentUserId?: string }, exec: DbExecutor = this.db) {
    const conditions = [eq(orqspaceAgentConnections.status, 'ACTIVE' as const)];
    if (where.orqspaceId) conditions.push(eq(orqspaceAgentConnections.orqspaceId, where.orqspaceId));
    if (where.agentUserId) conditions.push(eq(orqspaceAgentConnections.agentUserId, where.agentUserId));
    const [{ n }] = await exec.select({ n: count() }).from(orqspaceAgentConnections).where(and(...conditions));
    return n;
  }

  private async load(connectionId: string): Promise<ConnectionRow> {
    const [row] = await this.db.select().from(orqspaceAgentConnections).where(eq(orqspaceAgentConnections.id, connectionId));
    if (!row) throw new NotFoundException('Connection not found');
    return row;
  }

  async toType(row: ConnectionRow, exec: DbExecutor = this.db): Promise<AgentConnectionType> {
    return (await this.toTypes([row], exec))[0];
  }

  async toTypes(rows: ConnectionRow[], exec: DbExecutor | DbTx = this.db): Promise<AgentConnectionType[]> {
    if (!rows.length) return [];
    const spaceIds = [...new Set(rows.map((r) => r.orqspaceId))];
    const spaces = await exec.select({ id: orqspaces.id, name: orqspaces.name }).from(orqspaces).where(inArray(orqspaces.id, spaceIds));
    const spaceName = new Map(spaces.map((s) => [s.id, s.name]));
    const activeAgents = rows.filter((r) => r.status === 'ACTIVE').map((r) => r.agentUserId);
    const connected = await this.directory.summaries(activeAgents, true, exec);
    const others = await this.directory.summaries(
      rows.filter((r) => r.status !== 'ACTIVE').map((r) => r.agentUserId),
      false,
      exec,
    );
    const taskCounts = await exec
      .select({ orqspaceId: deliveryTasks.orqspaceId, agentUserId: deliveryTasks.agentUserId, n: count() })
      .from(deliveryTasks)
      .where(
        and(
          inArray(deliveryTasks.orqspaceId, spaceIds),
          inArray(
            deliveryTasks.agentUserId,
            rows.map((r) => r.agentUserId),
          ),
          notInArray(deliveryTasks.status, TERMINAL_TASK_STATUSES),
        ),
      )
      .groupBy(deliveryTasks.orqspaceId, deliveryTasks.agentUserId);
    const load = new Map(taskCounts.map((t) => [`${t.orqspaceId}:${t.agentUserId}`, t.n]));

    return rows.map((row) => ({
      ...row,
      orqspaceName: spaceName.get(row.orqspaceId) ?? 'Workspace',
      agent: (row.status === 'ACTIVE' ? connected : others).get(row.agentUserId)!,
      activeTaskCount: load.get(`${row.orqspaceId}:${row.agentUserId}`) ?? 0,
    }));
  }
}
