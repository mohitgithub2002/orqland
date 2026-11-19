import { BadRequestException, Injectable } from '@nestjs/common';
import { and, count, desc, eq, gte, inArray } from 'drizzle-orm';
import {
  deliveryAgentProfiles,
  deliveryOffers,
  deliveryStatusEvents,
  deliveryTasks,
  orqspaceAgentConnections,
  type AssignmentType,
} from '@/infrastructure/database/schema';
import type { DbTx } from '@/core/utils/db-executor';
import { assessAgentKyc } from '../../helpers/agent-eligibility';
import { rankCandidates, type AssignmentCandidate, type RankedCandidate } from '../../helpers/assignment-strategies';
import { haversineKm, round2, toLatLng } from '../../helpers/geo';
import { AgentDirectoryService } from '../agents/agent-directory.service';
import type { DeliverySettingsRow } from '../settings/delivery-settings.service';
import { TaskTransitionsService, type TaskRow, type TaskTransitionActor } from './task-transitions.service';

export type OfferRow = typeof deliveryOffers.$inferSelect;

export interface AssignmentOutcome {
  offer: OfferRow | null;
  /** Set when no agent could be offered the task; the workspace is asked to act. */
  attentionReason: string | null;
}

const SYSTEM: TaskTransitionActor = { userId: null, role: 'SYSTEM', as: 'SYSTEM' };

/**
 * Configurable assignment engine. Only agents with an ACTIVE connection to the task's workspace are ever
 * considered — Orqland never sends a workspace's delivery to an unconnected agent.
 */
@Injectable()
export class AssignmentEngineService {
  constructor(
    private readonly transitions: TaskTransitionsService,
    private readonly directory: AgentDirectoryService,
  ) {}

  /** Eligible, ranked candidates for a task (excluding agents already offered in the current round). */
  async candidates(tx: DbTx, task: TaskRow, settings: DeliverySettingsRow, opts: { exclude?: string[]; ignoreRadius?: boolean } = {}) {
    const rows = await tx
      .select({ connection: orqspaceAgentConnections, profile: deliveryAgentProfiles })
      .from(orqspaceAgentConnections)
      .innerJoin(deliveryAgentProfiles, eq(deliveryAgentProfiles.userId, orqspaceAgentConnections.agentUserId))
      .where(and(eq(orqspaceAgentConnections.orqspaceId, task.orqspaceId), eq(orqspaceAgentConnections.status, 'ACTIVE')));

    const loads = await this.directory.activeTaskCounts(rows.map((r) => r.profile.userId), tx);
    const pickup = toLatLng(task.pickupLat, task.pickupLng);
    const now = Date.now();
    const exclude = new Set(opts.exclude ?? []);
    const rejected = new Map<string, string>();
    /** Positions older than this are ignored for distance ranking. */
    const maxPositionAgeMs = 30 * 60 * 1000;

    const eligible: AssignmentCandidate[] = [];
    for (const { connection, profile } of rows) {
      if (exclude.has(profile.userId)) continue;
      if (connection.disconnectRequestStatus === 'REQUESTED') { rejected.set(profile.userId, 'a disconnection is pending'); continue; }
      if (!assessAgentKyc(profile).valid) { rejected.set(profile.userId, 'verification is not valid'); continue; }
      if (profile.availability === 'OFFLINE') { rejected.set(profile.userId, 'agent is offline'); continue; }
      const load = loads.get(profile.userId) ?? 0;
      if (load >= profile.maxConcurrentTasks) { rejected.set(profile.userId, 'agent is at capacity'); continue; }

      const fresh = profile.lastLocationAt && now - profile.lastLocationAt.getTime() < maxPositionAgeMs;
      const position = fresh ? toLatLng(profile.lastLat, profile.lastLng) : null;
      const distance = pickup && position ? round2(haversineKm(position, pickup)) : null;
      if (!opts.ignoreRadius && distance !== null && distance > Number(settings.maxPickupRadiusKm)) {
        rejected.set(profile.userId, `${distance} km from pickup`);
        continue;
      }
      eligible.push({
        agentUserId: profile.userId,
        connectionId: connection.id,
        ratePerKm: connection.currentRatePerKm,
        distanceToPickupKm: distance,
        activeTasks: load,
        idleSeconds: profile.lastAvailabilityChangeAt ? (now - profile.lastAvailabilityChangeAt.getTime()) / 1000 : 0,
      });
    }
    return { ranked: rankCandidates(settings.assignmentStrategy, eligible), rejected, connected: rows.length };
  }

  /** Offers the task to the best next agent, or flags it for the workspace when nobody is left. */
  async offerNext(tx: DbTx, task: TaskRow, settings: DeliverySettingsRow): Promise<AssignmentOutcome> {
    const roundStart = await this.roundStart(tx, task);
    const previous = await tx
      .select({ agentUserId: deliveryOffers.agentUserId })
      .from(deliveryOffers)
      .where(and(eq(deliveryOffers.taskId, task.id), gte(deliveryOffers.offeredAt, roundStart)));
    if (previous.length >= settings.maxOfferAttempts) {
      return this.flag(tx, task, `No agent accepted after ${previous.length} offers`);
    }
    const { ranked, connected } = await this.candidates(tx, task, settings, { exclude: previous.map((p) => p.agentUserId) });
    if (!ranked.length) {
      return this.flag(tx, task, connected === 0 ? 'No delivery agents are connected to this workspace' : 'No eligible agent is available right now');
    }
    return { offer: await this.createOffer(tx, task, ranked[0], 'AUTO', settings, SYSTEM), attentionReason: null };
  }

  /** Manual assignment: the workspace picks a specific connected agent. */
  async offerTo(tx: DbTx, task: TaskRow, agentUserId: string, settings: DeliverySettingsRow, actor: TaskTransitionActor): Promise<OfferRow> {
    const { ranked, rejected } = await this.candidates(tx, task, settings, { ignoreRadius: true });
    const candidate = ranked.find((c) => c.agentUserId === agentUserId);
    if (!candidate) {
      const why = rejected.get(agentUserId);
      throw new BadRequestException(
        why ? `This agent cannot take the delivery right now (${why})` : 'This agent is not an active connection of the workspace',
      );
    }
    return this.createOffer(tx, task, candidate, 'MANUAL', settings, actor);
  }

  /** Closes the open offer (declined / expired / withdrawn) and returns the task to PENDING_ASSIGNMENT. */
  async closeOffer(tx: DbTx, offer: OfferRow, status: 'DECLINED' | 'EXPIRED' | 'WITHDRAWN', reason: string | null, actor: TaskTransitionActor) {
    const [closed] = await tx
      .update(deliveryOffers)
      .set({ status, respondedAt: new Date(), declineReason: reason })
      .where(and(eq(deliveryOffers.id, offer.id), eq(deliveryOffers.status, 'OFFERED')))
      .returning();
    if (!closed) return null;
    const task = await this.transitions.lock(tx, offer.taskId);
    if (task.status === 'OFFERED') {
      return this.transitions.apply(tx, task, 'PENDING_ASSIGNMENT', actor, {
        reason: reason ?? `Offer ${status.toLowerCase()}`,
        metadata: { offerId: offer.id, agentUserId: offer.agentUserId },
      });
    }
    return task;
  }

  /** After a decline/expiry: auto tasks move to the next agent, manual tasks wait for the workspace. */
  async afterOfferClosed(tx: DbTx, task: TaskRow, settings: DeliverySettingsRow, why: string): Promise<AssignmentOutcome> {
    if (task.status !== 'PENDING_ASSIGNMENT') return { offer: null, attentionReason: null };
    if (task.assignmentType === 'AUTO') return this.offerNext(tx, task, settings);
    return this.flag(tx, task, why);
  }

  async openOffer(tx: DbTx, taskId: string): Promise<OfferRow | null> {
    const [offer] = await tx
      .select()
      .from(deliveryOffers)
      .where(and(eq(deliveryOffers.taskId, taskId), eq(deliveryOffers.status, 'OFFERED')))
      .for('update');
    return offer ?? null;
  }

  async offersCount(tx: DbTx, taskId: string): Promise<number> {
    const [{ n }] = await tx.select({ n: count() }).from(deliveryOffers).where(eq(deliveryOffers.taskId, taskId));
    return n;
  }

  private async createOffer(
    tx: DbTx,
    task: TaskRow,
    candidate: RankedCandidate,
    type: AssignmentType,
    settings: DeliverySettingsRow,
    actor: TaskTransitionActor,
  ): Promise<OfferRow> {
    const [offer] = await tx
      .insert(deliveryOffers)
      .values({
        taskId: task.id,
        agentUserId: candidate.agentUserId,
        connectionId: candidate.connectionId,
        assignmentType: type,
        rankScore: candidate.score.toFixed(4),
        distanceToPickupKm: candidate.distanceToPickupKm?.toFixed(2) ?? null,
        ratePerKmOffered: candidate.ratePerKm,
        expiresAt: new Date(Date.now() + settings.offerTimeoutSeconds * 1000),
      })
      .returning();
    await this.transitions.apply(tx, task, 'OFFERED', actor, {
      patch: { needsAttention: false, attentionReason: null, assignmentType: type },
      metadata: { offerId: offer.id, agentUserId: candidate.agentUserId, strategy: settings.assignmentStrategy },
    });
    return offer;
  }

  private async flag(tx: DbTx, task: TaskRow, reason: string): Promise<AssignmentOutcome> {
    await tx
      .update(deliveryTasks)
      .set({ needsAttention: true, attentionReason: reason.slice(0, 160) })
      .where(eq(deliveryTasks.id, task.id));
    return { offer: null, attentionReason: reason };
  }

  /** Offers count per round: a workspace reassignment starts a new round (marked in the event metadata). */
  private async roundStart(tx: DbTx, task: TaskRow): Promise<Date> {
    const events = await tx
      .select({ createdAt: deliveryStatusEvents.createdAt, metadata: deliveryStatusEvents.metadata })
      .from(deliveryStatusEvents)
      .where(and(eq(deliveryStatusEvents.taskId, task.id), inArray(deliveryStatusEvents.toStatus, ['PENDING_ASSIGNMENT'])))
      .orderBy(desc(deliveryStatusEvents.createdAt))
      .limit(50);
    const round = events.find((e) => e.metadata?.newAssignmentRound === true);
    return round?.createdAt ?? task.createdAt;
  }
}
