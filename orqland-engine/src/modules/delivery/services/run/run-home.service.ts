import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, count, eq, isNull } from 'drizzle-orm';
import type { AuthUser } from '@/core/decorators/current-user.decorator';
import { deliveryConfig } from '@/config/delivery.config';
import { DRIZZLE, type DrizzleDB } from '@/infrastructure/database/drizzle.module';
import { deliveryNotifications } from '@/infrastructure/database/schema';
import type { RunHomeType } from '../../dto/types/run.type';
import { ConnectionsService } from '../connections/connections.service';
import { EarningsService } from '../earnings/earnings.service';
import { AgentRegistrationService } from '../kyc/agent-registration.service';
import { TaskQueryService } from '../tasks/task-query.service';

/** Composes the Orqland Run home screen (Screen 1) in one round trip. */
@Injectable()
export class RunHomeService {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    private readonly registration: AgentRegistrationService,
    private readonly tasks: TaskQueryService,
    private readonly connections: ConnectionsService,
    private readonly earnings: EarningsService,
  ) {}

  async home(user: AuthUser): Promise<RunHomeType> {
    const profile = await this.registration.getMyProfile(user);
    if (!profile) throw new NotFoundException('You are not registered as a delivery agent');
    const [activeTasks, openOffers, invitations, connections, today, [{ unread }]] = await Promise.all([
      this.tasks.agentActiveTasks(user.id),
      this.tasks.agentOpenOffers(user.id),
      this.connections.listForAgent(user.id, ['PENDING']),
      this.connections.listForAgent(user.id, ['ACTIVE']),
      this.earnings.agentToday(user.id),
      this.db
        .select({ unread: count() })
        .from(deliveryNotifications)
        .where(and(eq(deliveryNotifications.userId, user.id), isNull(deliveryNotifications.readAt))),
    ]);
    return {
      profile,
      activeTasks,
      openOffers,
      invitations,
      connections,
      today,
      unreadNotifications: unread,
      connectionLimit: deliveryConfig.maxWorkspacesPerAgent,
    };
  }
}
