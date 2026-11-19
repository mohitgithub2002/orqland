'use client';

import { useState } from 'react';
import { ReasonDialog } from '@/features/dashboard/common/components/ReasonDialog';
import { timeAgo } from '@/features/dashboard/common/utils/format';
import { DEFAULT_PREP_MINUTES, deliveryTypeLabel, formatClock, formatWhen, isPickupOrder, PREP_OPTIONS, travelMinutes } from '../../utils/order-display';
import { ActionButton, CustomerNote, Fact, Facts, InlineError, OrderCardFrame, StatusHeading } from './parts';
import type { OrderCardProps } from './types';
import { useCardAction } from './useCardAction';

/** Accepted, preparation not started: choose the preparation time and start. */
export function UpcomingCard({ order, onOpen }: OrderCardProps) {
  const { run, pending, error } = useCardAction(order.id);
  const [minutes, setMinutes] = useState(order.preparationMinutes ?? DEFAULT_PREP_MINUTES);
  const [cancelOpen, setCancelOpen] = useState(false);
  const pickup = isPickupOrder(order);
  const options = PREP_OPTIONS.includes(minutes) ? PREP_OPTIONS : [...PREP_OPTIONS, minutes].sort((a, b) => a - b);
  const travel = pickup ? 0 : (travelMinutes(order.distanceFromPickupKm) ?? 0);
  const startBy = order.scheduledFor ? new Date(order.scheduledFor).getTime() - (minutes + travel) * 60_000 : null;
  const late = startBy !== null && startBy < Date.now();

  return (
    <OrderCardFrame
      order={order}
      onOpen={onOpen}
      heading={
        <StatusHeading
          tone="amber"
          title={order.scheduledFor ? (pickup ? 'Pickup scheduled' : 'Delivery scheduled') : 'Accepted'}
          sub={order.scheduledFor ? `For ${formatWhen(order.scheduledFor)}` : `Accepted ${timeAgo(order.acceptedAt)} · as soon as possible`}
        />
      }
      actions={
        <>
          <select
            aria-label="Preparation time"
            value={minutes}
            onChange={(e) => setMinutes(Number(e.target.value))}
            className="h-10 rounded-lg border-0 bg-gray-100 px-3 text-[13.5px] font-semibold text-gray-950 focus-visible:outline-2 focus-visible:outline-gray-900"
          >
            {options.map((m) => (
              <option key={m} value={m}>
                {m} Minutes
              </option>
            ))}
          </select>
          <ActionButton disabled={pending} onClick={() => run('startPreparingOrder', { preparationMinutes: minutes })}>
            {pending ? 'Starting…' : 'Start Preparation'}
          </ActionButton>
        </>
      }
    >
      <Facts>
        <Fact label="Delivery type">{deliveryTypeLabel(order)}</Fact>
        <Fact label="Start preparing" className={late ? 'bg-red-50' : undefined}>
          {startBy === null ? 'Now' : late ? <span className="text-red-600">Now · running late</span> : `By ${formatClock(startBy)}`}
        </Fact>
      </Facts>
      {startBy !== null && !pickup && travel > 0 && <p className="text-[11.5px] text-gray-500">Includes about {travel} min for the delivery trip.</p>}
      <CustomerNote order={order} />
      <button type="button" onClick={() => setCancelOpen(true)} className="self-start text-[12px] text-red-600 underline-offset-2 hover:underline">
        Cancel this order
      </button>
      {!cancelOpen && <InlineError message={error} />}
      {cancelOpen && (
        <ReasonDialog
          open
          onOpenChange={(o) => !o && setCancelOpen(false)}
          title="Cancel this order?"
          description="The customer sees the reason. Any online payment becomes a refund due."
          confirmLabel="Cancel order"
          destructive
          pending={pending}
          error={error}
          onConfirm={(reason) => run('cancelOrderByWorkspace', { reason }, () => setCancelOpen(false))}
        />
      )}
    </OrderCardFrame>
  );
}
