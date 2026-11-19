import { Inject, Injectable } from '@nestjs/common';
import { and, count, eq } from 'drizzle-orm';
import type { AuthUser } from '@/core/decorators/current-user.decorator';
import { DRIZZLE, type DrizzleDB } from '@/infrastructure/database/drizzle.module';
import { orqspaceAgentConnections, orqspaceDeliverySettings } from '@/infrastructure/database/schema';
import type { DbExecutor } from '@/core/utils/db-executor';
import { AuditService } from '@/modules/orders/services/shared/audit.service';
import { OrqspaceAccessService } from '@/modules/orders/services/shared/orqspace-access.service';
import type { UpdateDeliverySettingsInput } from '../../dto/inputs/settings.inputs';
import type { DeliverySettingsType } from '../../dto/types/settings.type';
import { deliveryConfig } from '@/config/delivery.config';

export type DeliverySettingsRow = typeof orqspaceDeliverySettings.$inferSelect;

@Injectable()
export class DeliverySettingsService {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    private readonly access: OrqspaceAccessService,
    private readonly audit: AuditService,
  ) {}

  /** Returns the settings row, creating defaults on first use. */
  async ensure(orqspaceId: string, exec: DbExecutor = this.db): Promise<DeliverySettingsRow> {
    await exec.insert(orqspaceDeliverySettings).values({ orqspaceId }).onConflictDoNothing();
    const [row] = await exec.select().from(orqspaceDeliverySettings).where(eq(orqspaceDeliverySettings.orqspaceId, orqspaceId));
    return row;
  }

  /** Locks the workspace settings row — the serialization point for connection-limit checks. */
  async lock(exec: DbExecutor, orqspaceId: string): Promise<DeliverySettingsRow> {
    await exec.insert(orqspaceDeliverySettings).values({ orqspaceId }).onConflictDoNothing();
    const [row] = await exec
      .select()
      .from(orqspaceDeliverySettings)
      .where(eq(orqspaceDeliverySettings.orqspaceId, orqspaceId))
      .for('update');
    return row;
  }

  async get(user: AuthUser, orqspaceId: string): Promise<DeliverySettingsType> {
    await this.access.assertCanManage(user, orqspaceId);
    return this.toType(await this.ensure(orqspaceId));
  }

  async update(user: AuthUser, input: UpdateDeliverySettingsInput): Promise<DeliverySettingsType> {
    const actor = await this.access.assertCanManage(user, input.orqspaceId);
    const before = await this.ensure(input.orqspaceId);
    const patch: Partial<DeliverySettingsRow> = {};
    if (input.timezone !== undefined) {
      new Intl.DateTimeFormat('en', { timeZone: input.timezone }); // throws RangeError on an invalid zone
      patch.timezone = input.timezone;
    }
    if (input.pickupAddress !== undefined) {
      const a = input.pickupAddress;
      patch.pickupAddress = {
        recipientName: a.recipientName ?? null,
        recipientPhone: a.recipientPhone ?? null,
        doorNo: a.doorNo ?? null,
        street: a.street ?? null,
        landmark: a.landmark ?? null,
        city: a.city ?? null,
        district: a.district ?? null,
        state: a.state ?? null,
        country: a.country ?? null,
        pincode: a.pincode ?? null,
        latitude: input.pickupLat ?? null,
        longitude: input.pickupLng ?? null,
      };
    }
    if (input.pickupLat !== undefined) patch.pickupLat = String(input.pickupLat);
    if (input.pickupLng !== undefined) patch.pickupLng = String(input.pickupLng);
    if (input.autoAssignEnabled !== undefined) patch.autoAssignEnabled = input.autoAssignEnabled;
    if (input.assignmentStrategy !== undefined) patch.assignmentStrategy = input.assignmentStrategy;
    if (input.offerTimeoutSeconds !== undefined) patch.offerTimeoutSeconds = input.offerTimeoutSeconds;
    if (input.maxOfferAttempts !== undefined) patch.maxOfferAttempts = input.maxOfferAttempts;
    if (input.maxPickupRadiusKm !== undefined) patch.maxPickupRadiusKm = input.maxPickupRadiusKm.toFixed(2);
    if (input.roadDistanceFactor !== undefined) patch.roadDistanceFactor = input.roadDistanceFactor.toFixed(2);
    if (input.requireDeliveryOtp !== undefined) patch.requireDeliveryOtp = input.requireDeliveryOtp;

    const updated = await this.db.transaction(async (tx) => {
      const [row] = await tx
        .update(orqspaceDeliverySettings)
        .set(patch)
        .where(eq(orqspaceDeliverySettings.orqspaceId, input.orqspaceId))
        .returning();
      await this.audit.record(tx, {
        entityType: 'orqspace_delivery_settings',
        entityId: input.orqspaceId,
        action: 'settings.updated',
        actorUserId: actor.userId,
        actorRole: actor.role,
        before: { ...before, pickupAddress: undefined },
        after: { ...patch, pickupAddress: undefined },
      });
      return row;
    });
    return this.toType(updated);
  }

  async toType(row: DeliverySettingsRow): Promise<DeliverySettingsType> {
    const [{ n }] = await this.db
      .select({ n: count() })
      .from(orqspaceAgentConnections)
      .where(and(eq(orqspaceAgentConnections.orqspaceId, row.orqspaceId), eq(orqspaceAgentConnections.status, 'ACTIVE')));
    return {
      ...row,
      pickupLat: row.pickupLat === null ? null : Number(row.pickupLat),
      pickupLng: row.pickupLng === null ? null : Number(row.pickupLng),
      activeAgentCount: n,
      agentLimit: deliveryConfig.maxAgentsPerWorkspace,
      readyForAgentDispatch: row.pickupLat !== null && row.pickupLng !== null,
    };
  }
}
