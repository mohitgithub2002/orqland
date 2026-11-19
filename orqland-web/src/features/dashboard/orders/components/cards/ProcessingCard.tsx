'use client';

import { useNow } from '@/features/dashboard/common/hooks/useNow';
import { timeAgo } from '@/features/dashboard/common/utils/format';
import { DEFAULT_PREP_MINUTES, hasActiveDelivery, isPickupOrder, PREP_EXTENSION_MINUTES, prepUrgency } from '../../utils/order-display';
import { AssignDeliveryPartner, PartnerDetails } from './DeliveryPartner';
import { ActionButton, CustomerNote, InlineError, OrderCardFrame, StatusHeading } from './parts';
import { PrepTimer } from './PrepTimer';
import type { OrderCardProps } from './types';
import { useCardAction } from './useCardAction';

/**
 * In preparation. The timer counts down to preparationDueAt; the border blinks red when it runs low
 * and stays red when overdue. A delivery partner can be assigned now so they arrive as it is ready.
 */
export function ProcessingCard({ order, orqspaceId, onOpen }: OrderCardProps) {
  const now = useNow(1000);
  const { run, runSteps, pending, error } = useCardAction(order.id);
  const pickup = isPickupOrder(order);
  const urgency = prepUrgency(order, now);
  const assigned = hasActiveDelivery(order);

  return (
    <OrderCardFrame
      order={order}
      onOpen={onOpen}
      urgent={urgency}
      heading={
        <StatusHeading
          tone={urgency ? 'red' : 'amber'}
          title="Preparing"
          sub={`Started ${timeAgo(order.preparingAt)} · ${order.preparationMinutes ?? DEFAULT_PREP_MINUTES} min target`}
        />
      }
      leftExtra={<PrepTimer order={order} now={now} extending={pending} onExtend={() => run('extendOrderPreparation', { minutes: PREP_EXTENSION_MINUTES })} />}
      actions={
        <ActionButton disabled={pending} onClick={() => (pickup ? void runSteps(['markOrderReady', 'markOrderAwaitingPickup']) : run('markOrderReady'))}>
          {pending ? 'Saving…' : pickup ? 'Prepared · ready for pickup' : 'Mark as prepared'}
        </ActionButton>
      }
    >
      {pickup ? (
        <p className="rounded-xl bg-gray-100 px-3 py-2.5 text-[12.5px] text-gray-700">The customer collects from the shop. They are told as soon as you mark it prepared.</p>
      ) : assigned ? (
        <>
          <PartnerDetails order={order} onTrack={() => onOpen(order.id)} />
          <p className="text-[11.5px] text-gray-500">The partner can collect once you mark the order prepared.</p>
        </>
      ) : (
        <AssignDeliveryPartner order={order} orqspaceId={orqspaceId} />
      )}
      <CustomerNote order={order} />
      <InlineError message={error} />
    </OrderCardFrame>
  );
}
