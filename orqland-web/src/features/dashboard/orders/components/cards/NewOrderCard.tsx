'use client';

import { useState } from 'react';
import { ReasonDialog } from '@/features/dashboard/common/components/ReasonDialog';
import { timeAgo } from '@/features/dashboard/common/utils/format';
import { deliveryTypeLabel, formatWhen } from '../../utils/order-display';
import { ActionButton, CustomerNote, Fact, Facts, InlineError, OrderCardFrame, StatusHeading } from './parts';
import type { OrderCardProps } from './types';
import { useCardAction } from './useCardAction';

/** New entry: the workspace accepts or declines. */
export function NewOrderCard({ order, onOpen }: OrderCardProps) {
  const { run, pending, error } = useCardAction(order.id);
  const [declineOpen, setDeclineOpen] = useState(false);
  const pickup = order.requestedFulfilment === 'PICKUP';
  const lowStock = order.items.filter((i) => i.stockRemaining !== null && i.stockRemaining <= 3);

  return (
    <OrderCardFrame
      order={order}
      onOpen={onOpen}
      heading={
        <StatusHeading
          tone="blue"
          title={order.scheduledFor ? (pickup ? 'Pickup scheduled' : 'Delivery scheduled') : 'New order'}
          sub={order.scheduledFor ? `For ${formatWhen(order.scheduledFor)} · received ${timeAgo(order.createdAt)}` : `Received ${timeAgo(order.createdAt)}`}
        />
      }
      actions={
        <>
          <ActionButton variant="decline" onClick={() => setDeclineOpen(true)}>
            Decline
          </ActionButton>
          <ActionButton variant="accept" disabled={pending} onClick={() => run('acceptOrder')}>
            {pending ? 'Accepting…' : 'Accept'}
          </ActionButton>
        </>
      }
    >
      <Facts>
        <Fact label="Delivery type">{deliveryTypeLabel(order)}</Fact>
        <Fact label="Wanted">{order.scheduledFor ? formatWhen(order.scheduledFor) : 'As soon as possible'}</Fact>
      </Facts>
      <CustomerNote order={order} />
      {lowStock.length > 0 && (
        <p className="text-[12px] text-amber-700">
          Low stock: {lowStock.map((i) => `${i.title} (${i.stockRemaining} left)`).join(', ')}
        </p>
      )}
      {!declineOpen && <InlineError message={error} />}
      {declineOpen && (
        <ReasonDialog
          open
          onOpenChange={(o) => !o && setDeclineOpen(false)}
          title="Decline this order?"
          description="The customer is told the order was declined. Any online payment becomes a refund due."
          confirmLabel="Decline order"
          destructive
          pending={pending}
          error={error}
          onConfirm={(reason) => run('rejectOrder', { reason }, () => setDeclineOpen(false))}
        />
      )}
    </OrderCardFrame>
  );
}
