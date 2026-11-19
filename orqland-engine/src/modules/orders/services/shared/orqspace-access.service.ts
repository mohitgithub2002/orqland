import { ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import type { AuthUser } from '@/core/decorators/current-user.decorator';
import { DRIZZLE, type DrizzleDB } from '@/infrastructure/database/drizzle.module';
import { orqspaces, type ActorRole } from '@/infrastructure/database/schema';
import type { DbExecutor } from '@/core/utils/db-executor';
import { assertWorkspaceAccess } from '@/core/utils/workspace-access';

export const PLATFORM_ADMIN_ROLE = 'PLATFORM_ADMIN';

export interface WorkspaceActor {
  userId: string;
  role: Extract<ActorRole, 'WORKSPACE' | 'PLATFORM_ADMIN'>;
  orqspace: { id: string; name: string; ownerId: string };
}

/**
 * Workspace-admin authorization for the Orders & Delivery modules.
 * The workspace decision is delegated to the standalone `assertWorkspaceAccess` helper (review §2.3);
 * platform admins are allowed as an audited override.
 */
@Injectable()
export class OrqspaceAccessService {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB) {}

  isPlatformAdmin(user: AuthUser): boolean {
    return user.roles.includes(PLATFORM_ADMIN_ROLE);
  }

  async assertCanManage(user: AuthUser, orqspaceId: string, exec: DbExecutor = this.db): Promise<WorkspaceActor> {
    const [orqspace] = await exec
      .select({ id: orqspaces.id, name: orqspaces.name, ownerId: orqspaces.ownerId })
      .from(orqspaces)
      .where(eq(orqspaces.id, orqspaceId))
      .limit(1);
    if (!orqspace) throw new NotFoundException('Workspace not found');

    if (await assertWorkspaceAccess(orqspaceId, user.id, exec)) {
      return { userId: user.id, role: 'WORKSPACE', orqspace };
    }
    if (this.isPlatformAdmin(user)) return { userId: user.id, role: 'PLATFORM_ADMIN', orqspace };
    throw new ForbiddenException('You do not manage this workspace');
  }
}
