import type { AssignmentStrategy } from '@/infrastructure/database/schema';

export interface AssignmentCandidate {
  agentUserId: string;
  connectionId: string;
  ratePerKm: string;
  /** Distance from the agent's last known position to the pickup point; null when unknown. */
  distanceToPickupKm: number | null;
  activeTasks: number;
  /** Time since the agent's last availability change / completed task — longer idle wins ties. */
  idleSeconds: number;
}

export interface RankedCandidate extends AssignmentCandidate {
  score: number;
}

/** Lower score = better. Unknown distance ranks after known distances. */
type Scorer = (c: AssignmentCandidate, ctx: { maxDistance: number; maxLoad: number }) => number;

const UNKNOWN_DISTANCE_PENALTY = 1_000;

const scorers: Record<AssignmentStrategy, Scorer> = {
  NEAREST: (c) => c.distanceToPickupKm ?? UNKNOWN_DISTANCE_PENALTY,
  LEAST_LOADED: (c) => c.activeTasks * 100 + (c.distanceToPickupKm ?? UNKNOWN_DISTANCE_PENALTY) / 100,
  HYBRID: (c, ctx) => {
    const distance = c.distanceToPickupKm === null ? 1 : c.distanceToPickupKm / Math.max(ctx.maxDistance, 0.001);
    const load = ctx.maxLoad === 0 ? 0 : c.activeTasks / ctx.maxLoad;
    return 0.7 * distance + 0.3 * load;
  },
};

/** Pure ranking so strategies can be unit-tested and new ones added without touching the engine. */
export function rankCandidates(strategy: AssignmentStrategy, candidates: AssignmentCandidate[]): RankedCandidate[] {
  const known = candidates.map((c) => c.distanceToPickupKm).filter((d): d is number => d !== null);
  const ctx = { maxDistance: known.length ? Math.max(...known) : 1, maxLoad: Math.max(0, ...candidates.map((c) => c.activeTasks)) };
  return candidates
    .map((c) => ({ ...c, score: scorers[strategy](c, ctx) }))
    .sort((a, b) => a.score - b.score || b.idleSeconds - a.idleSeconds || a.agentUserId.localeCompare(b.agentUserId));
}
