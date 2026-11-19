import type { DrizzleDB } from '@/infrastructure/database/drizzle.module';

export type DbTx = Parameters<Parameters<DrizzleDB['transaction']>[0]>[0];
/** Either the root connection or an open transaction. Services accept this so callers can compose transactions. */
export type DbExecutor = DrizzleDB | DbTx;

/** Postgres unique_violation, optionally narrowed to a constraint/index name. */
export function isUniqueViolation(error: unknown, constraint?: string): boolean {
  const err = (error as { cause?: unknown })?.cause ?? error;
  const pg = err as { code?: string; constraint?: string };
  return pg?.code === '23505' && (!constraint || pg.constraint === constraint);
}
