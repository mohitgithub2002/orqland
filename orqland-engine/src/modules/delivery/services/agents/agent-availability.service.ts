import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import type { AuthUser } from '@/core/decorators/current-user.decorator';
import { DRIZZLE, type DrizzleDB } from '@/infrastructure/database/drizzle.module';
import { deliveryAgentProfiles } from '@/infrastructure/database/schema';
import type { DbExecutor } from '@/core/utils/db-executor';
import type { AgentAvailabilityChoice } from '../../dto/enums/delivery.enums';
import { assessAgentKyc } from '../../helpers/agent-eligibility';
import { AgentDirectoryService } from './agent-directory.service';

/**
 * OFFLINE / ONLINE are chosen by the agent; BUSY is derived from active load vs. max_concurrent_tasks.
 * Going OFFLINE never cancels accepted deliveries — it only stops new offers.
 */
@Injectable()
export class AgentAvailabilityService {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    private readonly directory: AgentDirectoryService,
  ) {}

  async setAvailability(user: AuthUser, choice: AgentAvailabilityChoice) {
    return this.db.transaction(async (tx) => {
      const [profile] = await tx
        .select()
        .from(deliveryAgentProfiles)
        .where(eq(deliveryAgentProfiles.userId, user.id))
        .for('update');
      if (!profile) throw new NotFoundException('You are not registered as a delivery agent');

      if (choice === 'ONLINE') {
        const kyc = assessAgentKyc(profile);
        if (!kyc.valid) throw new BadRequestException(`You cannot go online: ${kyc.reasons.join('; ')}`);
      }
      let next: typeof profile.availability = choice;
      if (choice === 'ONLINE') {
        const load = (await this.directory.activeTaskCounts([user.id], tx)).get(user.id) ?? 0;
        if (load >= profile.maxConcurrentTasks) next = 'BUSY';
      }
      const [updated] = await tx
        .update(deliveryAgentProfiles)
        .set({ availability: next, lastAvailabilityChangeAt: new Date() })
        .where(eq(deliveryAgentProfiles.userId, user.id))
        .returning();
      return updated;
    });
  }

  /** Recomputes ONLINE ⇄ BUSY after an agent's load changes. OFFLINE agents stay OFFLINE. */
  async refreshBusy(exec: DbExecutor, agentUserId: string): Promise<void> {
    const [profile] = await exec
      .select({ availability: deliveryAgentProfiles.availability, max: deliveryAgentProfiles.maxConcurrentTasks })
      .from(deliveryAgentProfiles)
      .where(eq(deliveryAgentProfiles.userId, agentUserId));
    if (!profile || profile.availability === 'OFFLINE') return;
    const load = (await this.directory.activeTaskCounts([agentUserId], exec)).get(agentUserId) ?? 0;
    const next = load >= profile.max ? 'BUSY' : 'ONLINE';
    if (next !== profile.availability) {
      await exec
        .update(deliveryAgentProfiles)
        .set({ availability: next, lastAvailabilityChangeAt: new Date() })
        .where(eq(deliveryAgentProfiles.userId, agentUserId));
    }
  }
}
