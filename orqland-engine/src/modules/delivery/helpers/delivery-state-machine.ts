import type { DeliveryTaskStatus } from '@/infrastructure/database/schema';

/**
 * Who may trigger a task transition:
 * - PERFORMER: the assigned agent (AGENT mode) or the workspace (SELF mode)
 * - WORKSPACE: the workspace admin managing the task
 * - SYSTEM: assignment engine / expiry jobs
 */
export type TaskActor = 'PERFORMER' | 'WORKSPACE' | 'SYSTEM';

const P: TaskActor = 'PERFORMER';
const W: TaskActor = 'WORKSPACE';
const S: TaskActor = 'SYSTEM';

export const TASK_TRANSITIONS: Record<DeliveryTaskStatus, Partial<Record<DeliveryTaskStatus, TaskActor[]>>> = {
  // PENDING → PENDING by the workspace starts a new assignment round (reassignment of an unassigned task).
  PENDING_ASSIGNMENT: { PENDING_ASSIGNMENT: [W], OFFERED: [W, S], PICKED_UP: [P], CANCELLED: [W, S] },
  OFFERED: { ACCEPTED: [P], PENDING_ASSIGNMENT: [W, S], CANCELLED: [W, S] },
  ACCEPTED: { ARRIVING_AT_PICKUP: [P], PICKED_UP: [P], PENDING_ASSIGNMENT: [W], CANCELLED: [W, S] },
  ARRIVING_AT_PICKUP: { PICKED_UP: [P], PENDING_ASSIGNMENT: [W], CANCELLED: [W, S] },
  PICKED_UP: { IN_TRANSIT: [P], DELIVERED: [P], FAILED: [P] },
  IN_TRANSIT: { DELIVERED: [P], FAILED: [P] },
  FAILED: { RETURNED_TO_ORIGIN: [P, W] },
  DELIVERED: {},
  CANCELLED: {},
  RETURNED_TO_ORIGIN: {},
};

export const TERMINAL_TASK_STATUSES: DeliveryTaskStatus[] = ['DELIVERED', 'FAILED', 'CANCELLED', 'RETURNED_TO_ORIGIN'];
export const PRE_PICKUP_STATUSES: DeliveryTaskStatus[] = ['PENDING_ASSIGNMENT', 'OFFERED', 'ACCEPTED', 'ARRIVING_AT_PICKUP'];
/** Statuses in which the task occupies the agent's capacity. */
export const AGENT_LOAD_STATUSES: DeliveryTaskStatus[] = ['ACCEPTED', 'ARRIVING_AT_PICKUP', 'PICKED_UP', 'IN_TRANSIT'];
/** An authorized workspace override may mark these delivered (reason + audit required). */
export const OVERRIDE_DELIVERABLE_STATUSES: DeliveryTaskStatus[] = ['ACCEPTED', 'ARRIVING_AT_PICKUP', 'PICKED_UP', 'IN_TRANSIT'];

export function canTaskTransition(from: DeliveryTaskStatus, to: DeliveryTaskStatus, actor: TaskActor): boolean {
  return TASK_TRANSITIONS[from]?.[to]?.includes(actor) ?? false;
}
