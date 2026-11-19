'use client';

import { gqlErrorMessage } from '@/features/dashboard/common/utils/gqlError';
import type { OrderActionName } from '../../graphql/orders.graphql';
import { useOrderAction } from '../../hooks/useOrders';

/** Order actions from a card: one mutation per card so each card shows its own pending state and error. */
export function useCardAction(orderId: string) {
  const action = useOrderAction();
  const run = (name: OrderActionName, input: Record<string, unknown> = {}, onSuccess?: () => void) =>
    action.mutate({ name, input: { orderId, ...input } }, { onSuccess: () => onSuccess?.() });
  /** Several steps in order (e.g. mark prepared → ready for customer pickup); stops at the first error. */
  const runSteps = async (names: OrderActionName[]) => {
    try {
      for (const name of names) await action.mutateAsync({ name, input: { orderId } });
    } catch {
      /* surfaced through action.error */
    }
  };
  return { run, runSteps, pending: action.isPending, error: action.error ? gqlErrorMessage(action.error) : null, reset: action.reset };
}
