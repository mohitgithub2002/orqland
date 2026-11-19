import { Injectable } from '@nestjs/common';
import { deliveryAuditLogs, type ActorRole } from '@/infrastructure/database/schema';
import type { DbExecutor } from '@/core/utils/db-executor';

export interface AuditEntry {
  entityType: string;
  entityId: string;
  action: string;
  actorUserId: string | null;
  actorRole: ActorRole;
  reason?: string | null;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
}

/** Writes to delivery_audit_logs. Call inside the same transaction as the change being audited. */
@Injectable()
export class AuditService {
  async record(exec: DbExecutor, entry: AuditEntry): Promise<void> {
    await exec.insert(deliveryAuditLogs).values({
      entityType: entry.entityType,
      entityId: entry.entityId,
      action: entry.action,
      actorUserId: entry.actorUserId,
      actorRole: entry.actorRole,
      reason: entry.reason ?? null,
      before: entry.before ?? null,
      after: entry.after ?? null,
    });
  }
}
