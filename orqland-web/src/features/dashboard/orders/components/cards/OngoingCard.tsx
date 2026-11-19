'use client';

import { Navigation } from 'lucide-react';
import { useState } from 'react';
import { ReasonDialog } from '@/features/dashboard/common/components/ReasonDialog';
import { formatKm, formatMoney, timeAgo } from '@/features/dashboard/common/utils/format';
import { gqlErrorMessage } from '@/features/dashboard/common/utils/gqlError';
import { DispatchDialog } from '@/features/dashboard/delivery/components/DispatchDialog';
import { CompleteSelfDeliveryDialog } from '@/features/dashboard/delivery/components/TaskActions';
import { useDeliveryAction } from '@/features/dashboard/delivery/hooks/useDelivery';
import { agentDistanceKm, hasActiveDelivery, isPickupOrder, navigateUrl, travelMinutes } from '../../utils/order-display';
import { AssignDeliveryPartner, PartnerDetails } from './DeliveryPartner';
import { ActionButton, InlineError, OrderCardFrame, StatusHeading, type ChipTone } from './parts';
import type { OrderCardProps } from './types';
import { useCardAction } from './useCardAction';

const PRE_PICKUP = ['PENDING_ASSIGNMENT', 'OFFERED', 'ACCEPTED', 'ARRIVING_AT_PICKUP'];

/** Prepared and on its way: waiting for the partner, out for delivery (agent or own staff), or waiting for the customer to collect. */
export function OngoingCard({ order, orqspaceId, onOpen }: OrderCardProps) {
  const { run, pending, error } = useCardAction(order.id);
  const selfUpdate = useDeliveryAction('selfUpdate');
  const [reassignOpen, setReassignOpen] = useState(false);
  const [completeOpen, setCompleteOpen] = useState(false);
  const [failOpen, setFailOpen] = useState(false);
  const d = order.delivery;
  const active = hasActiveDelivery(order);
  const self = d?.mode === 'SELF';
  const codDue = order.paymentMethod === 'COD' && order.paymentStatus !== 'PAID';

  let tone: ChipTone = 'blue';
  let title = 'On the way';
  let sub = '';
  let body: React.ReactNode = null;
  let actions: React.ReactNode = null;

  if (order.orderStatus === 'AWAITING_CUSTOMER_PICKUP') {
    tone = 'green';
    title = 'Ready for pickup';
    sub = `Waiting for the customer · ready ${timeAgo(order.readyAt)}`;
    body = codDue ? <Note>Collect {formatMoney(order.totalAmount)} when the customer arrives.</Note> : <Note>Hand over once the customer shows their order number.</Note>;
    actions = (
      <>
        <ActionButton variant="soft" disabled={pending} onClick={() => run('reopenOrderForFulfilment')}>
          Change fulfilment
        </ActionButton>
        <ActionButton disabled={pending} onClick={() => run('confirmCustomerPickup')}>
          Customer collected
        </ActionButton>
      </>
    );
  } else if (order.orderStatus === 'READY_FOR_FULFILMENT' && !active) {
    tone = 'green';
    title = 'Prepared';
    sub = `Ready ${timeAgo(order.readyAt)} · choose how it reaches the customer`;
    body = isPickupOrder(order) ? <Note>The customer asked to collect this order.</Note> : <AssignDeliveryPartner order={order} orqspaceId={orqspaceId} />;
    actions = (
      <ActionButton variant={isPickupOrder(order) ? 'ink' : 'soft'} disabled={pending} onClick={() => run('markOrderAwaitingPickup')}>
        {isPickupOrder(order) ? 'Ready for customer pickup' : 'Customer pickup instead'}
      </ActionButton>
    );
  } else if (d && self) {
    const left = d.status === 'PENDING_ASSIGNMENT';
    title = left ? 'Ready to leave' : 'On the way';
    sub = left ? 'Own delivery · waiting for your staff to leave' : `Own delivery · left ${timeAgo(d.pickedUpAt)}`;
    body = <PartnerDetails order={order} />;
    const nav = navigateUrl(order);
    actions = left ? (
      <ActionButton disabled={selfUpdate.isPending} onClick={() => selfUpdate.mutate({ taskId: d.id, step: 'PICKED_UP' })}>
        Out for delivery
      </ActionButton>
    ) : (
      <>
        {nav && (
          <a
            href={nav}
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-10 items-center justify-center gap-1.5 rounded-lg bg-gray-200 px-4 text-[13.5px] font-semibold text-gray-900 hover:bg-gray-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-900"
          >
            <Navigation className="size-4" /> Navigate
          </a>
        )}
        <ActionButton onClick={() => setCompleteOpen(true)}>Arrived</ActionButton>
      </>
    );
  } else if (d) {
    const prePickup = PRE_PICKUP.includes(d.status);
    const km = agentDistanceKm(order, prePickup ? 'pickup' : 'dropoff');
    const eta = travelMinutes(km);
    title = prePickup ? (km !== null && km <= 0.1 ? 'Agent at the shop' : 'Waiting for agent') : 'On the way';
    tone = prePickup ? 'amber' : 'blue';
    sub = prePickup
      ? d.agent
        ? `${d.agent.displayName} is ${km !== null ? `${formatKm(km)} away` : 'on the way'} — hand over when they arrive`
        : 'Looking for an agent'
      : `Picked up ${timeAgo(d.pickedUpAt)}${eta ? ` · about ${eta} min to the customer` : ''}`;
    body = <PartnerDetails order={order} onTrack={() => onOpen(order.id)} />;
    actions = (
      <>
        {prePickup && (
          <ActionButton variant="soft" onClick={() => setReassignOpen(true)}>
            Reassign
          </ActionButton>
        )}
        <ActionButton onClick={() => onOpen(order.id)}>Track</ActionButton>
      </>
    );
  }

  const deliveryError = selfUpdate.error ? gqlErrorMessage(selfUpdate.error) : null;
  return (
    <OrderCardFrame order={order} onOpen={onOpen} heading={<StatusHeading tone={tone} title={title} sub={sub} />} actions={actions}>
      {body}
      {self && d && !['PENDING_ASSIGNMENT'].includes(d.status) && (
        <button type="button" onClick={() => setFailOpen(true)} className="self-start text-[12px] text-red-600 underline-offset-2 hover:underline">
          Could not deliver
        </button>
      )}
      <InlineError message={error ?? (failOpen ? null : deliveryError)} />
      {reassignOpen && d && <DispatchDialog open onOpenChange={setReassignOpen} orqspaceId={orqspaceId} target={{ kind: 'reassign', taskId: d.id, taskNumber: d.taskNumber }} />}
      {completeOpen && d && <CompleteSelfDeliveryDialog task={d} onClose={() => setCompleteOpen(false)} />}
      {failOpen && d && (
        <ReasonDialog
          open
          onOpenChange={(o) => !o && setFailOpen(false)}
          title="Delivery failed?"
          description="The order moves to Support so you can try again or take it back."
          confirmLabel="Mark failed"
          destructive
          pending={selfUpdate.isPending}
          error={deliveryError}
          onConfirm={(reason) => selfUpdate.mutate({ taskId: d.id, step: 'FAILED', reason }, { onSuccess: () => setFailOpen(false) })}
        />
      )}
    </OrderCardFrame>
  );
}

function Note({ children }: { children: React.ReactNode }) {
  return <p className="rounded-xl bg-gray-100 px-3 py-2.5 text-[12.5px] text-gray-700">{children}</p>;
}
