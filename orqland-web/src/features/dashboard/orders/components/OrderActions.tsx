'use client';

import { useState } from 'react';
import { ReasonDialog } from '@/features/dashboard/common/components/ReasonDialog';
import { gqlErrorMessage } from '@/features/dashboard/common/utils/gqlError';
import { DispatchDialog } from '@/features/dashboard/delivery/components/DispatchDialog';
import { CompleteSelfDeliveryDialog } from '@/features/dashboard/delivery/components/TaskActions';
import type { OrderActionName } from '../graphql/orders.graphql';
import { useOrderAction } from '../hooks/useOrders';
import type { Order } from '../types/order.types';
import { cancelPending, DEFAULT_PREP_MINUTES, hasActiveDelivery, isPickupOrder, PREP_EXTENSION_MINUTES } from '../utils/order-display';
import { ActionButton, InlineError } from './cards/parts';
import { MarkReturnedDialog } from './MarkReturnedDialog';

/** Delivery Management page route — adjust if your dashboard routes differ. */
export const DELIVERY_PAGE_HREF = '/delivery';

type ReasonAction = { name: OrderActionName; title: string; confirm: string; description: string; destructive?: boolean };

const PRE_PICKUP = ['PENDING_ASSIGNMENT', 'OFFERED', 'ACCEPTED', 'ARRIVING_AT_PICKUP'];

/** Action bar in the order view. The next step is the dark button; the rest are secondary. */
export function OrderActions({ order, orqspaceId }: { order: Order; orqspaceId: string }) {
  const action = useOrderAction();
  const [reasonAction, setReasonAction] = useState<ReasonAction | null>(null);
  const [dispatch, setDispatch] = useState<'dispatch' | 'reassign' | null>(null);
  const [returnOpen, setReturnOpen] = useState(false);
  const [completeOpen, setCompleteOpen] = useState(false);
  const run = (name: OrderActionName, input: Record<string, unknown> = {}) => action.mutate({ name, input: { orderId: order.id, ...input } });
  const steps = async (names: OrderActionName[]) => {
    try {
      for (const name of names) await action.mutateAsync({ name, input: { orderId: order.id } });
    } catch {
      /* shown below */
    }
  };
  const pending = action.isPending;
  const d = order.delivery;
  const active = hasActiveDelivery(order);
  const pickup = isPickupOrder(order);
  const ask = (a: ReasonAction) => setReasonAction(a);

  const b: React.ReactNode[] = [];
  if (cancelPending(order)) {
    b.push(
      <ActionButton key="approve" variant="accept" disabled={pending} onClick={() => run('approveOrderCancellation')}>
        Approve Cancel
      </ActionButton>,
      <ActionButton key="decline" variant="decline" onClick={() => ask({ name: 'declineOrderCancellation', title: 'Decline the cancellation?', confirm: 'Decline request', description: 'The order continues. The customer sees your reason.' })}>
        Decline cancel
      </ActionButton>,
    );
  }
  switch (order.orderStatus) {
    case 'PLACED':
      b.push(
        <ActionButton key="accept" variant="accept" disabled={pending} onClick={() => run('acceptOrder')}>
          Accept
        </ActionButton>,
        <ActionButton key="reject" variant="decline" onClick={() => ask({ name: 'rejectOrder', title: 'Decline this order?', confirm: 'Decline order', description: 'Any online payment becomes a refund due.', destructive: true })}>
          Decline
        </ActionButton>,
      );
      break;
    case 'ACCEPTED':
      b.push(
        <ActionButton key="prep" disabled={pending} onClick={() => run('startPreparingOrder', { preparationMinutes: order.preparationMinutes ?? DEFAULT_PREP_MINUTES })}>
          Start Preparation
        </ActionButton>,
      );
      break;
    case 'PREPARING':
      b.push(
        <ActionButton key="ready" disabled={pending} onClick={() => (pickup ? void steps(['markOrderReady', 'markOrderAwaitingPickup']) : run('markOrderReady'))}>
          {pickup ? 'Prepared · ready for pickup' : 'Mark as prepared'}
        </ActionButton>,
        <ActionButton key="extend" variant="soft" disabled={pending} onClick={() => run('extendOrderPreparation', { minutes: PREP_EXTENSION_MINUTES })}>
          +{PREP_EXTENSION_MINUTES} Mins
        </ActionButton>,
      );
      if (!pickup && !active) b.push(<ActionButton key="assign" variant="soft" onClick={() => setDispatch('dispatch')}>Assign delivery</ActionButton>);
      break;
    case 'READY_FOR_FULFILMENT':
      if (active && d && d.mode === 'AGENT' && PRE_PICKUP.includes(d.status)) {
        b.push(<ActionButton key="reassign" variant="soft" onClick={() => setDispatch('reassign')}>Reassign agent</ActionButton>);
      } else if (!active) {
        if (!pickup) b.push(<ActionButton key="dispatch" onClick={() => setDispatch('dispatch')}>Assign delivery</ActionButton>);
        b.push(
          <ActionButton key="pickup" variant={pickup ? 'ink' : 'soft'} disabled={pending} onClick={() => run('markOrderAwaitingPickup')}>
            Ready for customer pickup
          </ActionButton>,
        );
      }
      break;
    case 'AWAITING_CUSTOMER_PICKUP':
      b.push(
        <ActionButton key="collected" disabled={pending} onClick={() => run('confirmCustomerPickup')}>
          Customer collected
        </ActionButton>,
        <ActionButton key="back" variant="soft" disabled={pending} onClick={() => run('reopenOrderForFulfilment')}>
          Change fulfilment
        </ActionButton>,
      );
      break;
    case 'OUT_FOR_DELIVERY':
      if (d?.mode === 'SELF') b.push(<ActionButton key="done" onClick={() => setCompleteOpen(true)}>Confirm delivered</ActionButton>);
      break;
    case 'DELIVERY_FAILED':
      b.push(
        <ActionButton key="retry" disabled={pending} onClick={() => run('reopenOrderForFulfilment')}>
          Try again
        </ActionButton>,
        <ActionButton key="returned" variant="soft" onClick={() => setReturnOpen(true)}>
          Mark returned
        </ActionButton>,
      );
      break;
    case 'RETURN_REQUESTED':
      b.push(
        <ActionButton key="returned" onClick={() => setReturnOpen(true)}>
          Confirm Pickup
        </ActionButton>,
        <ActionButton key="decline" variant="decline" onClick={() => ask({ name: 'declineOrderReturn', title: 'Decline the return request?', confirm: 'Decline return', description: 'The customer sees your reason.' })}>
          Decline return
        </ActionButton>,
      );
      break;
  }
  if (order.allowedNextStatuses.includes('CANCELLED') && !cancelPending(order) && order.orderStatus !== 'PLACED') {
    b.push(
      <button
        key="cancel"
        type="button"
        className="px-2 text-[13px] font-semibold text-red-600 hover:underline"
        onClick={() => ask({ name: 'cancelOrderByWorkspace', title: 'Cancel this order?', confirm: 'Cancel order', description: 'The customer sees the reason. Any online payment becomes a refund due.', destructive: true })}
      >
        Cancel order
      </button>,
    );
  }

  return (
    <div className="space-y-2">
      {b.length > 0 && <div className="flex flex-wrap items-center gap-2">{b}</div>}
      {!reasonAction && <InlineError message={action.error ? gqlErrorMessage(action.error) : null} />}
      {reasonAction && (
        <ReasonDialog
          open
          onOpenChange={(o) => !o && setReasonAction(null)}
          title={reasonAction.title}
          description={reasonAction.description}
          confirmLabel={reasonAction.confirm}
          destructive={reasonAction.destructive}
          pending={pending}
          error={action.error ? gqlErrorMessage(action.error) : null}
          onConfirm={(reason) => action.mutate({ name: reasonAction.name, input: { orderId: order.id, reason } }, { onSuccess: () => setReasonAction(null) })}
        />
      )}
      {dispatch && (
        <DispatchDialog
          open
          onOpenChange={(o) => !o && setDispatch(null)}
          orqspaceId={orqspaceId}
          target={dispatch === 'reassign' && d ? { kind: 'reassign', taskId: d.id, taskNumber: d.taskNumber } : { kind: 'dispatch', orderId: order.id, orderNumber: order.orderNumber }}
        />
      )}
      {completeOpen && d && <CompleteSelfDeliveryDialog task={d} onClose={() => setCompleteOpen(false)} />}
      {returnOpen && <MarkReturnedDialog open onOpenChange={setReturnOpen} orderId={order.id} />}
    </div>
  );
}
