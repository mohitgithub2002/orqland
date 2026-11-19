'use client';

import { useState } from 'react';
import { ReasonDialog } from '@/features/dashboard/common/components/ReasonDialog';
import { formatDate, timeAgo } from '@/features/dashboard/common/utils/format';
import { MarkReturnedDialog } from '../MarkReturnedDialog';
import { reasonFor, refundDue } from '../../utils/order-display';
import { ActionButton, InlineError, OrderCardFrame, SectionLabel, StatusHeading } from './parts';
import { RefundBox } from './RefundBox';
import type { OrderCardProps } from './types';
import { useCardAction } from './useCardAction';

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** Returns, failed deliveries and refunds due. */
export function SupportCard({ order, onOpen }: OrderCardProps) {
  const { run, pending, error } = useCardAction(order.id);
  const [returnedOpen, setReturnedOpen] = useState(false);
  const [declineOpen, setDeclineOpen] = useState(false);
  const [pickupDate, setPickupDate] = useState(order.returnPickupDate ?? '');
  const [editingDate, setEditingDate] = useState(!order.returnPickupDate);

  if (order.orderStatus === 'RETURN_REQUESTED') {
    const requestedAt = [...order.history].reverse().find((h) => h.toStatus === 'RETURN_REQUESTED')?.createdAt;
    return (
      <OrderCardFrame
        order={order}
        onOpen={onOpen}
        heading={<StatusHeading tone="amber" title="Return requested" sub={`Asked ${timeAgo(requestedAt)}`} />}
        actions={
          <>
            <ActionButton variant="decline" onClick={() => setDeclineOpen(true)}>
              Decline
            </ActionButton>
            <ActionButton disabled={!order.returnPickupDate} onClick={() => setReturnedOpen(true)} title={order.returnPickupDate ? undefined : 'Schedule the pickup first'}>
              Confirm Pickup
            </ActionButton>
          </>
        }
      >
        <div>
          <SectionLabel>Customer’s reason</SectionLabel>
          <p className="rounded-lg bg-gray-100 px-3 py-2 text-[13px] text-gray-900">{reasonFor(order, 'RETURN_REQUESTED') ?? 'No reason given'}</p>
        </div>
        <div>
          <label htmlFor={`return-date-${order.id}`} className="mb-1.5 block text-[11px] font-medium uppercase tracking-wide text-gray-500">
            Return pickup date
          </label>
          {editingDate ? (
            <div className="flex gap-2">
              <input
                id={`return-date-${order.id}`}
                type="date"
                min={today()}
                value={pickupDate}
                onChange={(e) => setPickupDate(e.target.value)}
                className="h-10 min-w-0 flex-1 rounded-lg border border-gray-300 bg-white px-3 text-[13px] focus-visible:outline-2 focus-visible:outline-gray-900"
              />
              <ActionButton
                variant="soft"
                disabled={!pickupDate || pending}
                onClick={() => run('scheduleOrderReturnPickup', { pickupDate }, () => setEditingDate(false))}
              >
                {pending ? 'Saving…' : 'Schedule'}
              </ActionButton>
            </div>
          ) : (
            <p className="flex items-center justify-between rounded-lg bg-gray-100 px-3 py-2 text-[13px] font-semibold text-gray-950">
              {formatDate(order.returnPickupDate)}
              <button type="button" onClick={() => setEditingDate(true)} className="text-[12px] font-normal text-gray-600 underline underline-offset-2">
                Change
              </button>
            </p>
          )}
        </div>
        {!declineOpen && !returnedOpen && <InlineError message={error} />}
        {returnedOpen && <MarkReturnedDialog open onOpenChange={setReturnedOpen} orderId={order.id} />}
        {declineOpen && (
          <ReasonDialog
            open
            onOpenChange={(o) => !o && setDeclineOpen(false)}
            title="Decline the return request?"
            description="The order goes back to completed. The customer sees your reason."
            confirmLabel="Decline return"
            pending={pending}
            error={error}
            onConfirm={(reason) => run('declineOrderReturn', { reason }, () => setDeclineOpen(false))}
          />
        )}
      </OrderCardFrame>
    );
  }

  if (order.orderStatus === 'DELIVERY_FAILED') {
    return (
      <OrderCardFrame
        order={order}
        onOpen={onOpen}
        heading={<StatusHeading tone="red" title="Delivery failed" sub={`${timeAgo([...order.history].reverse().find((h) => h.toStatus === 'DELIVERY_FAILED')?.createdAt)}`} />}
        actions={
          <>
            <ActionButton variant="soft" onClick={() => setReturnedOpen(true)}>
              Mark returned
            </ActionButton>
            <ActionButton disabled={pending} onClick={() => run('reopenOrderForFulfilment')}>
              {pending ? 'Saving…' : 'Try again'}
            </ActionButton>
          </>
        }
      >
        <div>
          <SectionLabel>What happened</SectionLabel>
          <p className="rounded-lg bg-gray-100 px-3 py-2 text-[13px] text-gray-900">{reasonFor(order, 'DELIVERY_FAILED') ?? 'No reason recorded'}</p>
        </div>
        <p className="text-[11.5px] text-gray-500">“Try again” puts the order back to prepared so you can assign a partner or switch to customer pickup.</p>
        {!returnedOpen && <InlineError message={error} />}
        {returnedOpen && <MarkReturnedDialog open onOpenChange={setReturnedOpen} orderId={order.id} />}
      </OrderCardFrame>
    );
  }

  // Returned (or other closed orders) with money still to give back.
  return (
    <OrderCardFrame order={order} onOpen={onOpen} heading={<StatusHeading tone="gray" title={order.orderStatus === 'RETURNED' ? 'Returned' : 'Closed'} sub={timeAgo(order.completedAt ?? order.cancelledAt)} />}>
      {reasonFor(order, order.orderStatus) && <p className="rounded-lg bg-gray-100 px-3 py-2 text-[13px] text-gray-900">{reasonFor(order, order.orderStatus)}</p>}
      {refundDue(order) ? <RefundBox order={order} /> : order.paymentStatus === 'REFUNDED' && <p className="text-[12px] font-medium text-green-700">Refunded to the customer.</p>}
    </OrderCardFrame>
  );
}
