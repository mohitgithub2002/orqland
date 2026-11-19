import { Inject, UseGuards } from '@nestjs/common';
import { Args, Context, Field, Float, ID, Int, Mutation, ObjectType, Parent, ResolveField, Resolver } from '@nestjs/graphql';
import { eq } from 'drizzle-orm';
import { GqlAuthGuard } from '@/core/guards/gql-auth.guard';
import { CurrentUser } from '@/core/decorators/current-user.decorator';
import { DRIZZLE, type DrizzleDB } from '@/infrastructure/database/drizzle.module';
import { orqspaceDeliverySettings } from '@/infrastructure/database/schema';
import { haversineKm, round2, toLatLng } from '../helpers/geo';
import { DeliveryFilesService, type DeliveryFileRow } from '../services/files/delivery-files.service';
import type { AuthUser } from '@/core/decorators/current-user.decorator';
import { OrderType } from '@/modules/orders/dto/types/order.type';
import { OrqspaceAccessService } from '@/modules/orders/services/shared/orqspace-access.service';
import { AgentConnectionType, AgentRateHistoryType } from '../dto/types/connection.type';
import { DeliveryOfferType, DeliveryStatusEventType, DeliveryTaskType } from '../dto/types/delivery-task.type';
import { PRE_PICKUP_STATUSES } from '../helpers/delivery-state-machine';
import { ConnectionsService } from '../services/connections/connections.service';
import { DeliveryOtpService } from '../services/tasks/delivery-otp.service';
import { TaskQueryService } from '../services/tasks/task-query.service';

type GqlContext = { req: { user?: AuthUser } };

/**
 * Detail fields. Field resolvers do not run guards, so each one re-checks the viewer
 * (the parent query has already authenticated the request and set req.user).
 */
@Resolver(() => DeliveryTaskType)
export class DeliveryTaskFieldsResolver {
  constructor(
    private readonly tasks: TaskQueryService,
    private readonly access: OrqspaceAccessService,
  ) {}

  @ResolveField(() => [DeliveryStatusEventType])
  events(@Parent() task: DeliveryTaskType) {
    return this.tasks.events(task.id);
  }

  /** Full offer history is workspace-only; agents get an empty list. */
  @ResolveField(() => [DeliveryOfferType])
  async offers(@Parent() task: DeliveryTaskType, @Context() ctx: GqlContext) {
    const user = ctx.req.user;
    if (!user) return [];
    try {
      await this.access.assertCanManage(user, task.orqspaceId);
    } catch {
      return [];
    }
    return this.tasks.offers(task.id);
  }
}

@Resolver(() => AgentConnectionType)
export class AgentConnectionFieldsResolver {
  constructor(private readonly connections: ConnectionsService) {}

  @ResolveField(() => [AgentRateHistoryType])
  rateHistory(@Parent() connection: AgentConnectionType) {
    return this.connections.rateHistory(connection.id);
  }
}

@ObjectType('OrderDocument')
export class OrderDocumentType {
  @Field(() => ID) id: string;
  @Field() mimeType: string;
  @Field(() => Int) sizeBytes: number;
  @Field(() => String, { nullable: true }) originalName: string | null;
  @Field() createdAt: Date;
}

const toDocument = (row: DeliveryFileRow | null): OrderDocumentType | null =>
  row ? { id: row.id, mimeType: row.mimeType, sizeBytes: row.sizeBytes, originalName: row.originalName, createdAt: row.createdAt } : null;

/** Adds the delivery record to the Order type without the Orders module depending on Delivery. */
@Resolver(() => OrderType)
export class OrderDeliveryFieldsResolver {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    private readonly tasks: TaskQueryService,
    private readonly otp: DeliveryOtpService,
    private readonly files: DeliveryFilesService,
  ) {}

  /** Latest invoice uploaded by the workspace (bytes via GET /delivery/files/:id — customer and workspace only). */
  @ResolveField(() => OrderDocumentType, { nullable: true })
  async invoice(@Parent() order: OrderType) {
    return toDocument(await this.files.latestInvoice(order.id));
  }

  /** Road-distance estimate from the workspace pickup point to the delivery address (km). */
  @ResolveField(() => Float, { nullable: true })
  async distanceFromPickupKm(@Parent() order: OrderType) {
    const drop = toLatLng(order.deliveryAddressSnapshot?.latitude, order.deliveryAddressSnapshot?.longitude);
    if (!drop) return null;
    const [settings] = await this.db
      .select({ lat: orqspaceDeliverySettings.pickupLat, lng: orqspaceDeliverySettings.pickupLng, factor: orqspaceDeliverySettings.roadDistanceFactor })
      .from(orqspaceDeliverySettings)
      .where(eq(orqspaceDeliverySettings.orqspaceId, order.orqspaceId));
    const pickup = toLatLng(settings?.lat, settings?.lng);
    return pickup ? round2(haversineKm(pickup, drop) * Number(settings!.factor)) : null;
  }

  /** Workspace attaches an uploaded invoice (POST /delivery/files?purpose=ORDER_INVOICE) to a completed order. */
  @Mutation(() => OrderDocumentType)
  @UseGuards(GqlAuthGuard)
  async attachOrderInvoice(@CurrentUser() user: AuthUser, @Args('orderId', { type: () => ID }) orderId: string, @Args('fileId', { type: () => ID }) fileId: string) {
    return toDocument(await this.files.attachOrderInvoice(user, orderId, fileId));
  }

  @ResolveField(() => DeliveryTaskType, { nullable: true })
  delivery(@Parent() order: OrderType, @Context() ctx: GqlContext) {
    const isCustomer = ctx.req.user?.id === order.customerId;
    return this.tasks.forOrder(order.id, isCustomer ? { kind: 'CUSTOMER' } : { kind: 'WORKSPACE' });
  }

  /** The 4-digit code the customer shares with the delivery person. Customer-only. */
  @ResolveField(() => String, { nullable: true })
  async deliveryOtp(@Parent() order: OrderType, @Context() ctx: GqlContext) {
    if (ctx.req.user?.id !== order.customerId) return null;
    const task = await this.tasks.latestRowForOrder(order.id);
    if (!task?.deliveryOtpHash) return null;
    const live = [...PRE_PICKUP_STATUSES, 'PICKED_UP', 'IN_TRANSIT'].includes(task.status);
    return live ? this.otp.otpFor(task.id) : null;
  }
}
