import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, count, desc, eq, ilike, inArray, or, type SQL } from 'drizzle-orm';
import type { AuthUser } from '@/core/decorators/current-user.decorator';
import { DRIZZLE, type DrizzleDB } from '@/infrastructure/database/drizzle.module';
import {
  deliveryAgentProfiles,
  deliveryEarnings,
  deliveryOffers,
  deliverySupportMessages,
  deliverySupportTickets,
  deliveryTasks,
  orqspaceAgentConnections,
  orqspaces,
  orqUsers,
  type SupportTicketCategory,
  type SupportTicketPriority,
} from '@/infrastructure/database/schema';
import { generateTicketNumber } from '@/core/utils/public-codes';
import { AuditService } from '@/modules/orders/services/shared/audit.service';
import type {
  CreateSupportTicketInput,
  ReplySupportTicketInput,
  SupportTicketsFilterInput,
  UpdateSupportTicketInput,
} from '../../dto/inputs/support.inputs';
import type { SupportMessageType, SupportTicketPageType, SupportTicketType } from '../../dto/types/support.type';
import { displayNameOf } from '../agents/agent-directory.service';
import { DeliveryFilesService } from '../files/delivery-files.service';
import { DeliveryNotifierService } from '../notifications/delivery-notifier.service';

type TicketRow = typeof deliverySupportTickets.$inferSelect;

const TEAM_BY_CATEGORY: Record<SupportTicketCategory, string> = {
  DELIVERY: 'OPERATIONS',
  EARNINGS_PAYMENT: 'FINANCE',
  KYC: 'VERIFICATION',
  WORKSPACE: 'OPERATIONS',
  TECHNICAL: 'TECH',
  ACCOUNT_SECURITY: 'TRUST_SAFETY',
  EMERGENCY: 'SAFETY',
};

const DEFAULT_PRIORITY: Record<SupportTicketCategory, SupportTicketPriority> = {
  DELIVERY: 'NORMAL',
  EARNINGS_PAYMENT: 'NORMAL',
  KYC: 'NORMAL',
  WORKSPACE: 'NORMAL',
  TECHNICAL: 'NORMAL',
  ACCOUNT_SECURITY: 'HIGH',
  EMERGENCY: 'URGENT',
};

/** Screen 6 — delivery-agent support tickets, including earnings disputes, handled by platform support. */
@Injectable()
export class SupportService {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    private readonly audit: AuditService,
    private readonly notifier: DeliveryNotifierService,
    private readonly files: DeliveryFilesService,
  ) {}

  // ── agent ──────────────────────────────────────────────────────────────

  async create(user: AuthUser, input: CreateSupportTicketInput): Promise<SupportTicketType> {
    const [profile] = await this.db
      .select({ userId: deliveryAgentProfiles.userId })
      .from(deliveryAgentProfiles)
      .where(eq(deliveryAgentProfiles.userId, user.id));
    if (!profile) throw new BadRequestException('Support from Orqland Run is available to registered delivery agents');
    await this.assertRelatedOwnership(user.id, input);

    const ticket = await this.db.transaction(async (tx) => {
      const [row] = await tx
        .insert(deliverySupportTickets)
        .values({
          ticketNumber: generateTicketNumber(),
          raisedByUserId: user.id,
          category: input.category,
          subject: input.subject,
          description: input.description,
          priority: DEFAULT_PRIORITY[input.category],
          assignedTeam: TEAM_BY_CATEGORY[input.category],
          relatedTaskId: input.relatedTaskId ?? null,
          relatedEarningId: input.relatedEarningId ?? null,
          relatedConnectionId: input.relatedConnectionId ?? null,
          relatedPeriodMonth: input.relatedPeriodMonth ?? null,
        })
        .returning();
      if (input.attachmentUrls?.length || input.attachmentFileIds?.length) {
        await this.files.attach(tx, user.id, 'SUPPORT_ATTACHMENT', input.attachmentFileIds ?? []);
        await tx.insert(deliverySupportMessages).values({
          ticketId: row.id,
          authorUserId: user.id,
          authorRole: 'AGENT',
          body: 'Attachments',
          attachmentUrls: input.attachmentUrls ?? [],
          attachmentFileIds: input.attachmentFileIds ?? [],
        });
      }
      // An earnings dispute pauses approval/payout of that earning until it is reviewed.
      if (input.relatedEarningId) {
        await tx
          .update(deliveryEarnings)
          .set({ status: 'UNDER_REVIEW' })
          .where(and(eq(deliveryEarnings.id, input.relatedEarningId), inArray(deliveryEarnings.status, ['PENDING_APPROVAL', 'APPROVED'])));
        await this.audit.record(tx, {
          entityType: 'delivery_earning',
          entityId: input.relatedEarningId,
          action: 'earning.disputed',
          actorUserId: user.id,
          actorRole: 'AGENT',
          reason: input.subject,
          after: { ticketId: row.id },
        });
      }
      return row;
    });

    if (input.relatedEarningId) {
      const [owner] = await this.db
        .select({ ownerId: orqspaces.ownerId })
        .from(deliveryEarnings)
        .innerJoin(orqspaces, eq(orqspaces.id, deliveryEarnings.orqspaceId))
        .where(eq(deliveryEarnings.id, input.relatedEarningId));
      if (owner) {
        await this.notifier.send({
          userId: owner.ownerId,
          type: 'SUPPORT_TICKET_UPDATED',
          title: 'An agent disputed a delivery earning',
          body: `${ticket.ticketNumber}: ${input.subject}. The earning is under review in Delivery → Costs.`,
        });
      }
    }
    return (await this.toTypes([ticket]))[0];
  }

  async listMine(user: AuthUser): Promise<SupportTicketType[]> {
    const rows = await this.db
      .select()
      .from(deliverySupportTickets)
      .where(eq(deliverySupportTickets.raisedByUserId, user.id))
      .orderBy(desc(deliverySupportTickets.updatedAt))
      .limit(100);
    return this.toTypes(rows);
  }

  async getMine(user: AuthUser, ticketId: string): Promise<SupportTicketType> {
    const ticket = await this.load(ticketId);
    if (ticket.raisedByUserId !== user.id) throw new NotFoundException('Ticket not found');
    return (await this.toTypes([ticket]))[0];
  }

  async replyAsAgent(user: AuthUser, input: ReplySupportTicketInput): Promise<SupportMessageType> {
    const ticket = await this.load(input.ticketId);
    if (ticket.raisedByUserId !== user.id) throw new NotFoundException('Ticket not found');
    if (ticket.status === 'CLOSED') throw new BadRequestException('This ticket is closed. Raise a new ticket if you still need help.');
    const message = await this.db.transaction(async (tx) => {
      await this.files.attach(tx, user.id, 'SUPPORT_ATTACHMENT', input.attachmentFileIds ?? []);
      const [row] = await tx
        .insert(deliverySupportMessages)
        .values({
          ticketId: ticket.id,
          authorUserId: user.id,
          authorRole: 'AGENT',
          body: input.body,
          attachmentUrls: input.attachmentUrls ?? [],
          attachmentFileIds: input.attachmentFileIds ?? [],
        })
        .returning();
      await tx
        .update(deliverySupportTickets)
        .set({
          status: ticket.status === 'WAITING_ON_AGENT' || ticket.status === 'RESOLVED' ? 'IN_PROGRESS' : ticket.status,
          resolvedAt: null,
        })
        .where(eq(deliverySupportTickets.id, ticket.id));
      return row;
    });
    return { ...message, authorName: null };
  }

  async closeMine(user: AuthUser, ticketId: string): Promise<SupportTicketType> {
    const ticket = await this.load(ticketId);
    if (ticket.raisedByUserId !== user.id) throw new NotFoundException('Ticket not found');
    const [row] = await this.db
      .update(deliverySupportTickets)
      .set({ status: 'CLOSED', resolvedAt: ticket.resolvedAt ?? new Date() })
      .where(eq(deliverySupportTickets.id, ticket.id))
      .returning();
    return (await this.toTypes([row]))[0];
  }

  // ── platform support (admin portal) ────────────────────────────────────

  async list(filter: SupportTicketsFilterInput): Promise<SupportTicketPageType> {
    const conditions: SQL[] = [];
    if (filter.statuses?.length) conditions.push(inArray(deliverySupportTickets.status, filter.statuses));
    if (filter.categories?.length) conditions.push(inArray(deliverySupportTickets.category, filter.categories));
    if (filter.search?.trim()) {
      const term = `%${filter.search.trim()}%`;
      conditions.push(
        or(ilike(deliverySupportTickets.ticketNumber, term), ilike(deliverySupportTickets.subject, term), ilike(orqUsers.orqUserId, term))!,
      );
    }
    const where = conditions.length ? and(...conditions) : undefined;
    const [{ total }] = await this.db
      .select({ total: count() })
      .from(deliverySupportTickets)
      .innerJoin(orqUsers, eq(orqUsers.id, deliverySupportTickets.raisedByUserId))
      .where(where);
    const rows = await this.db
      .select({ ticket: deliverySupportTickets })
      .from(deliverySupportTickets)
      .innerJoin(orqUsers, eq(orqUsers.id, deliverySupportTickets.raisedByUserId))
      .where(where)
      .orderBy(desc(deliverySupportTickets.updatedAt))
      .limit(filter.pageSize)
      .offset((filter.page - 1) * filter.pageSize);
    return {
      items: await this.toTypes(rows.map((r) => r.ticket)),
      total,
      page: filter.page,
      pageSize: filter.pageSize,
    };
  }

  async get(ticketId: string): Promise<SupportTicketType> {
    return (await this.toTypes([await this.load(ticketId)]))[0];
  }

  async replyAsSupport(admin: AuthUser, input: ReplySupportTicketInput): Promise<SupportMessageType> {
    const ticket = await this.load(input.ticketId);
    const message = await this.db.transaction(async (tx) => {
      await this.files.attach(tx, admin.id, 'SUPPORT_ATTACHMENT', input.attachmentFileIds ?? []);
      const [row] = await tx
        .insert(deliverySupportMessages)
        .values({
          ticketId: ticket.id,
          authorUserId: admin.id,
          authorRole: 'PLATFORM_ADMIN',
          body: input.body,
          attachmentUrls: input.attachmentUrls ?? [],
          attachmentFileIds: input.attachmentFileIds ?? [],
          isInternal: !!input.internal,
        })
        .returning();
      if (!input.internal && ['OPEN', 'IN_PROGRESS'].includes(ticket.status)) {
        await tx.update(deliverySupportTickets).set({ status: 'WAITING_ON_AGENT' }).where(eq(deliverySupportTickets.id, ticket.id));
      }
      return row;
    });
    if (!input.internal) {
      await this.notifier.send({
        userId: ticket.raisedByUserId,
        type: 'SUPPORT_TICKET_UPDATED',
        title: `Support replied on ${ticket.ticketNumber}`,
        body: input.body.slice(0, 200),
        data: { ticketId: ticket.id },
      });
    }
    return { ...message, authorName: 'Orqland Support' };
  }

  async update(admin: AuthUser, input: UpdateSupportTicketInput): Promise<SupportTicketType> {
    const ticket = await this.load(input.ticketId);
    const patch: Partial<TicketRow> = {};
    if (input.status) {
      patch.status = input.status;
      patch.resolvedAt = ['RESOLVED', 'CLOSED'].includes(input.status) ? (ticket.resolvedAt ?? new Date()) : null;
    }
    if (input.priority) patch.priority = input.priority;
    if (input.assignedTeam !== undefined) patch.assignedTeam = input.assignedTeam || null;
    const row = await this.db.transaction(async (tx) => {
      const [updated] = await tx.update(deliverySupportTickets).set(patch).where(eq(deliverySupportTickets.id, ticket.id)).returning();
      await this.audit.record(tx, {
        entityType: 'support_ticket',
        entityId: ticket.id,
        action: 'support.ticket_updated',
        actorUserId: admin.id,
        actorRole: 'PLATFORM_ADMIN',
        before: { status: ticket.status, priority: ticket.priority, assignedTeam: ticket.assignedTeam },
        after: { ...input },
      });
      return updated;
    });
    if (input.status && input.status !== ticket.status) {
      await this.notifier.send({
        userId: ticket.raisedByUserId,
        type: 'SUPPORT_TICKET_UPDATED',
        title: `${ticket.ticketNumber} is now ${input.status.toLowerCase().replace(/_/g, ' ')}`,
        body: ticket.subject,
        data: { ticketId: ticket.id },
      });
    }
    return (await this.toTypes([row]))[0];
  }

  /** Conversation; internal notes are visible to support only. */
  async messages(ticketId: string, includeInternal: boolean): Promise<SupportMessageType[]> {
    const rows = await this.db
      .select({ message: deliverySupportMessages, author: orqUsers })
      .from(deliverySupportMessages)
      .leftJoin(orqUsers, eq(orqUsers.id, deliverySupportMessages.authorUserId))
      .where(
        includeInternal
          ? eq(deliverySupportMessages.ticketId, ticketId)
          : and(eq(deliverySupportMessages.ticketId, ticketId), eq(deliverySupportMessages.isInternal, false)),
      )
      .orderBy(asc(deliverySupportMessages.createdAt));
    return rows.map(({ message, author }) => ({
      ...message,
      authorName: message.authorRole === 'PLATFORM_ADMIN' ? 'Orqland Support' : author ? displayNameOf(author) : null,
    }));
  }

  // ── internals ──────────────────────────────────────────────────────────

  private async assertRelatedOwnership(userId: string, input: CreateSupportTicketInput) {
    if (input.relatedTaskId) {
      const [task] = await this.db
        .select({ agentUserId: deliveryTasks.agentUserId })
        .from(deliveryTasks)
        .where(eq(deliveryTasks.id, input.relatedTaskId));
      const [offer] = await this.db
        .select({ id: deliveryOffers.id })
        .from(deliveryOffers)
        .where(and(eq(deliveryOffers.taskId, input.relatedTaskId), eq(deliveryOffers.agentUserId, userId)))
        .limit(1);
      if (!task || (task.agentUserId !== userId && !offer)) throw new BadRequestException('That delivery is not yours');
    }
    if (input.relatedEarningId) {
      const [earning] = await this.db
        .select({ agentUserId: deliveryEarnings.agentUserId })
        .from(deliveryEarnings)
        .where(eq(deliveryEarnings.id, input.relatedEarningId));
      if (earning?.agentUserId !== userId) throw new BadRequestException('That earning is not yours');
    }
    if (input.relatedConnectionId) {
      const [connection] = await this.db
        .select({ agentUserId: orqspaceAgentConnections.agentUserId })
        .from(orqspaceAgentConnections)
        .where(eq(orqspaceAgentConnections.id, input.relatedConnectionId));
      if (connection?.agentUserId !== userId) throw new BadRequestException('That workspace connection is not yours');
    }
  }

  private async load(ticketId: string): Promise<TicketRow> {
    const [row] = await this.db.select().from(deliverySupportTickets).where(eq(deliverySupportTickets.id, ticketId));
    if (!row) throw new NotFoundException('Ticket not found');
    return row;
  }

  private async toTypes(rows: TicketRow[]): Promise<SupportTicketType[]> {
    if (!rows.length) return [];
    const users = await this.db
      .select()
      .from(orqUsers)
      .where(inArray(orqUsers.id, [...new Set(rows.map((r) => r.raisedByUserId))]));
    const userById = new Map(users.map((u) => [u.id, u]));
    const taskIds = rows.map((r) => r.relatedTaskId).filter((id): id is string => !!id);
    const tasks = taskIds.length
      ? await this.db
          .select({ id: deliveryTasks.id, taskNumber: deliveryTasks.taskNumber })
          .from(deliveryTasks)
          .where(inArray(deliveryTasks.id, taskIds))
      : [];
    const taskNumber = new Map(tasks.map((t) => [t.id, t.taskNumber]));
    const counts = await this.db
      .select({ ticketId: deliverySupportMessages.ticketId, n: count() })
      .from(deliverySupportMessages)
      .where(
        and(
          inArray(
            deliverySupportMessages.ticketId,
            rows.map((r) => r.id),
          ),
          eq(deliverySupportMessages.isInternal, false),
        ),
      )
      .groupBy(deliverySupportMessages.ticketId);
    const messageCount = new Map(counts.map((c) => [c.ticketId, c.n]));
    return rows.map((row) => {
      const user = userById.get(row.raisedByUserId)!;
      return {
        ...row,
        raisedByName: displayNameOf(user),
        raisedByOrqUserId: user.orqUserId,
        relatedTaskNumber: row.relatedTaskId ? (taskNumber.get(row.relatedTaskId) ?? null) : null,
        messageCount: messageCount.get(row.id) ?? 0,
      };
    });
  }
}
