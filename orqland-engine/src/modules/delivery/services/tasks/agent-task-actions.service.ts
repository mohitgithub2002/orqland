import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import type { AuthUser } from '@/core/decorators/current-user.decorator';
import { DRIZZLE, type DrizzleDB } from '@/infrastructure/database/drizzle.module';
import { deliveryConfig } from '@/config/delivery.config';
import { deliveryAgentProfiles, deliveryOffers, orders, orqspaces, type DeliveryTaskStatus } from '@/infrastructure/database/schema';
import type { CompleteDeliveryInput, FailDeliveryInput, OfferResponseInput, TaskActionInput } from '../../dto/inputs/task.inputs';
import type { DeliveryTaskType } from '../../dto/types/delivery-task.type';
import { assessAgentKyc } from '../../helpers/agent-eligibility';
import { checkPickupGeofence } from '../../helpers/pickup-geofence';
import { AgentDirectoryService } from '../agents/agent-directory.service';
import { CodService } from '../cod/cod.service';
import { ConnectionsService } from '../connections/connections.service';
import { DeliveryFilesService } from '../files/delivery-files.service';
import { DeliveryNotifierService } from '../notifications/delivery-notifier.service';
import { DeliverySettingsService } from '../settings/delivery-settings.service';
import { TrackingService } from '../tracking/tracking.service';
import { AssignmentEngineService, type AssignmentOutcome } from './assignment-engine.service';
import { DispatchService } from './dispatch.service';
import { TaskQueryService } from './task-query.service';
import { TaskTransitionsService, type TaskTransitionActor } from './task-transitions.service';

/** Module D — the delivery agent's actions in Orqland Run. */
@Injectable()
export class AgentTaskActionsService {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    private readonly transitions: TaskTransitionsService,
    private readonly engine: AssignmentEngineService,
    private readonly settings: DeliverySettingsService,
    private readonly connections: ConnectionsService,
    private readonly directory: AgentDirectoryService,
    private readonly dispatch: DispatchService,
    private readonly tracking: TrackingService,
    private readonly cod: CodService,
    private readonly query: TaskQueryService,
    private readonly notifier: DeliveryNotifierService,
    private readonly files: DeliveryFilesService,
  ) {}

  /** Atomic accept: only one agent can ever win a task; the per-km rate is snapshotted now. */
  async acceptOffer(user: AuthUser, input: OfferResponseInput): Promise<DeliveryTaskType> {
    const actor = this.agentActor(user);
    const taskId = await this.db.transaction(async (tx) => {
      const [offer] = await tx
        .select()
        .from(deliveryOffers)
        .where(and(eq(deliveryOffers.id, input.offerId), eq(deliveryOffers.agentUserId, user.id)))
        .for('update');
      if (!offer) throw new NotFoundException('Offer not found');
      if (offer.status !== 'OFFERED') throw new ConflictException({ code: 'OFFER_CLOSED', message: `This offer is ${offer.status.toLowerCase()}` });
      if (offer.expiresAt < new Date()) throw new ConflictException({ code: 'OFFER_EXPIRED', message: 'This offer has expired' });

      const task = await this.transitions.lock(tx, offer.taskId);
      if (task.status !== 'OFFERED') throw new ConflictException({ code: 'OFFER_CLOSED', message: 'This delivery is no longer available' });

      const [profile] = await tx.select().from(deliveryAgentProfiles).where(eq(deliveryAgentProfiles.userId, user.id)).for('update');
      const kyc = assessAgentKyc(profile);
      if (!kyc.valid) throw new BadRequestException(`You cannot accept deliveries: ${kyc.reasons.join('; ')}`);
      const load = (await this.directory.activeTaskCounts([user.id], tx)).get(user.id) ?? 0;
      if (load >= profile.maxConcurrentTasks) throw new BadRequestException('Finish your current delivery first');
      const connection = await this.connections.activeConnection(tx, task.orqspaceId, user.id);
      if (!connection) throw new BadRequestException('You are no longer connected to this workspace');
      if (connection.disconnectRequestStatus === 'REQUESTED') {
        throw new BadRequestException('A disconnection from this workspace is pending — new deliveries cannot be accepted');
      }

      await tx.update(deliveryOffers).set({ status: 'ACCEPTED', respondedAt: new Date() }).where(eq(deliveryOffers.id, offer.id));
      await this.transitions.apply(tx, task, 'ACCEPTED', actor, {
        patch: {
          agentUserId: user.id,
          connectionId: connection.id,
          ratePerKmSnapshot: connection.currentRatePerKm,
          needsAttention: false,
          attentionReason: null,
        },
        metadata: { offerId: offer.id, ratePerKm: connection.currentRatePerKm },
      });
      return task.id;
    });
    return this.query.getForAgent(user.id, taskId);
  }

  async declineOffer(user: AuthUser, input: OfferResponseInput): Promise<boolean> {
    const actor = this.agentActor(user);
    let outcome: AssignmentOutcome = { offer: null, attentionReason: null };
    let orqspaceId = '';
    await this.db.transaction(async (tx) => {
      const [offer] = await tx
        .select()
        .from(deliveryOffers)
        .where(and(eq(deliveryOffers.id, input.offerId), eq(deliveryOffers.agentUserId, user.id)))
        .for('update');
      if (!offer) throw new NotFoundException('Offer not found');
      if (offer.status !== 'OFFERED') return;
      const task = await this.engine.closeOffer(tx, offer, 'DECLINED', input.reason ?? null, { ...actor, as: 'SYSTEM' });
      if (!task) return;
      orqspaceId = task.orqspaceId;
      const settings = await this.settings.ensure(task.orqspaceId, tx);
      outcome = await this.engine.afterOfferClosed(tx, task, settings, 'The agent declined the delivery');
    });
    await this.notifyOutcome(outcome, orqspaceId);
    return true;
  }

  markArriving(user: AuthUser, input: TaskActionInput) {
    return this.step(user, input, 'ARRIVING_AT_PICKUP');
  }

  /**
   * Pickup is confirmed only at the pickup point (geofence, default 50 m) and only once the workspace has
   * marked the order ready — agents may be assigned during preparation and wait at the workspace.
   */
  async confirmPickup(user: AuthUser, input: TaskActionInput): Promise<DeliveryTaskType> {
    const actor = this.agentActor(user);
    await this.db.transaction(async (tx) => {
      const task = await this.transitions.lock(tx, input.taskId);
      if (task.agentUserId !== user.id) throw new NotFoundException('Delivery not found');
      if (!['ACCEPTED', 'ARRIVING_AT_PICKUP'].includes(task.status)) {
        throw new ConflictException({ code: 'TASK_STATUS_CHANGED', message: `This delivery is ${task.status.toLowerCase().replace(/_/g, ' ')}` });
      }
      const geofence = checkPickupGeofence(
        { pickupLat: task.pickupLat, pickupLng: task.pickupLng, lat: input.lat, lng: input.lng, accuracyM: input.accuracyM },
        deliveryConfig.pickupGeofenceMeters,
        deliveryConfig.pickupGeofenceMaxAccuracyMeters,
      );
      if (!geofence.ok) throw new BadRequestException({ code: geofence.code, message: geofence.message, distanceM: geofence.distanceM });
      const [order] = await tx.select({ status: orders.orderStatus }).from(orders).where(eq(orders.id, task.orderId));
      if (order?.status === 'PREPARING' || order?.status === 'ACCEPTED') {
        throw new ConflictException({ code: 'ORDER_NOT_READY', message: 'The workspace is still preparing this order. Wait at the pickup point until it is marked ready' });
      }
      await this.transitions.apply(tx, task, 'PICKED_UP', actor, {
        lat: input.lat,
        lng: input.lng,
        metadata: { pickupDistanceM: geofence.distanceM, accuracyM: input.accuracyM ?? null },
      });
    });
    return this.query.getForAgent(user.id, input.taskId);
  }

  startTransit(user: AuthUser, input: TaskActionInput) {
    return this.step(user, input, 'IN_TRANSIT');
  }

  async completeDelivery(user: AuthUser, input: CompleteDeliveryInput): Promise<DeliveryTaskType> {
    const actor = this.agentActor(user);
    await this.db.transaction(async (tx) => {
      const task = await this.transitions.lock(tx, input.taskId);
      if (task.agentUserId !== user.id) throw new NotFoundException('Delivery not found');
      await this.dispatch.assertProof(task, input.otp, input.codCollectedAmount, input.codMethod);
      await this.files.attach(tx, user.id, 'PROOF_OF_DELIVERY', [input.photoFileId]);
      await this.files.assertCapturedAfter(tx, input.photoFileId, task.pickedUpAt, 'Take a new photo at the door — the proof photo must be captured during this delivery');
      await this.files.attach(tx, user.id, 'COD_PROOF', [input.codProofFileId]);
      if (input.codCollectedAmount && input.codMethod) {
        await this.cod.recordCollection(tx, task.id, input.codCollectedAmount, input.codMethod, {
          url: input.photoUrl ?? null,
          fileId: input.codProofFileId ?? null,
        });
      }
      const measured = await this.tracking.measuredDistanceKm(tx, task.id, task.pickedUpAt, new Date());
      await this.transitions.apply(tx, task, 'DELIVERED', actor, {
        lat: input.lat,
        lng: input.lng,
        patch: {
          podType: input.otp ? 'OTP' : input.photoUrl || input.photoFileId ? 'PHOTO' : 'SIGNATURE_NAME',
          podPhotoUrl: input.photoUrl ?? null,
          podFileId: input.photoFileId ?? null,
          podRecipientName: input.recipientName ?? null,
          measuredDistanceKm: measured?.toFixed(2) ?? null,
        },
      });
    });
    await this.cod.notifyDiscrepancy(input.taskId);
    await this.notifyWorkspace(input.taskId, 'Delivery completed');
    await this.connections.finalizeRequestedDisconnects({ agentUserId: user.id });
    return this.query.getForAgent(user.id, input.taskId);
  }

  async failDelivery(user: AuthUser, input: FailDeliveryInput): Promise<DeliveryTaskType> {
    const result = await this.step(user, input, 'FAILED', input.reason);
    await this.notifyWorkspace(input.taskId, `Delivery failed: ${input.reason}`);
    await this.connections.finalizeRequestedDisconnects({ agentUserId: user.id });
    return result;
  }

  async returnToOrigin(user: AuthUser, input: TaskActionInput): Promise<DeliveryTaskType> {
    const result = await this.step(user, input, 'RETURNED_TO_ORIGIN', 'Returned to pickup point');
    await this.connections.finalizeRequestedDisconnects({ agentUserId: user.id });
    return result;
  }

  private async step(user: AuthUser, input: TaskActionInput, to: DeliveryTaskStatus, reason?: string): Promise<DeliveryTaskType> {
    const actor = this.agentActor(user);
    await this.db.transaction(async (tx) => {
      const task = await this.transitions.lock(tx, input.taskId);
      if (task.agentUserId !== user.id) throw new NotFoundException('Delivery not found');
      await this.transitions.apply(tx, task, to, actor, { reason: reason ?? null, lat: input.lat, lng: input.lng });
    });
    return this.query.getForAgent(user.id, input.taskId);
  }

  private agentActor(user: AuthUser): TaskTransitionActor {
    return { userId: user.id, role: 'AGENT', as: 'PERFORMER' };
  }

  private async notifyWorkspace(taskId: string, title: string) {
    const task = await this.query.find(taskId);
    const [space] = await this.db.select({ ownerId: orqspaces.ownerId }).from(orqspaces).where(eq(orqspaces.id, task.orqspaceId));
    await this.notifier.send({ userId: space.ownerId, type: 'DELIVERY_STATUS_CHANGED', title, body: task.taskNumber });
  }

  private async notifyOutcome(outcome: AssignmentOutcome, orqspaceId: string) {
    if (outcome.offer) {
      await this.notifier.send({ userId: outcome.offer.agentUserId, type: 'DELIVERY_OFFERED', title: 'New delivery offer', body: `₹${outcome.offer.ratePerKmOffered}/km` });
    } else if (outcome.attentionReason && orqspaceId) {
      const [space] = await this.db.select({ ownerId: orqspaces.ownerId }).from(orqspaces).where(eq(orqspaces.id, orqspaceId));
      await this.notifier.send({ userId: space.ownerId, type: 'DELIVERY_UNASSIGNED', title: 'Delivery needs an agent', body: outcome.attentionReason });
    }
  }
}
