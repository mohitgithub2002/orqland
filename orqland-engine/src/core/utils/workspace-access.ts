import { eq } from 'drizzle-orm';
import { orqspaces } from '@/infrastructure/database/schema';
import type { DbExecutor } from './db-executor';

/**
 * The single workspace-administration check for the Orders & Delivery modules (architecture review §2.3, Q-15).
 * Every workspace admin operation goes through this helper (via OrqspaceAccessService).
 *
 * Standalone build: the workspace owner is its only administrator.
 * On merge, the Core Engine team rewires the body to the internal `assertOrqspaceAccess`
 * so delegated workspace administrators are supported.
 */
export async function assertWorkspaceAccess(orqspaceId: string, userId: string, db: DbExecutor): Promise<boolean> {
  const orqspace = await db.query.orqspaces.findFirst({
    where: eq(orqspaces.id, orqspaceId),
  });
  return orqspace?.ownerId === userId;
}
