'use client';

import { useState } from 'react';
import { ReasonDialog } from '@/features/dashboard/common/components/ReasonDialog';
import { timeAgo } from '@/features/dashboard/common/utils/format';
import { metaOf, ORDER_STATUS } from '@/features/dashboard/common/utils/status';
import { cancelPending, formatWhen, hasActiveDelivery, refundDue } from '../../utils/order-display';
import { ActionButton, InlineError, OrderCardFrame, SectionLabel, StatusHeading } from './parts';
import { RefundBox } from './RefundBox';
import type { OrderCardProps } from './types';
import { useCardAction } from './useCardAction';

/** Customer cancel requests (approve / decline) and cancelled or rejected orders. */
export function CancelledCard({ order, onOpen }: OrderCardProps) {
  const { run, pending, error } = useCardAction(order.id);
  const [declineOpen, setDeclineOpen] = useState(false);
  const requested = cancelPending(order);

  if (requested) {
    const paid = order.paymentStatus === 'PAID' && Number(order.amountPaid) > 0;
    return (
      <OrderCardFrame
        order={order}
        onOpen={onOpen}
        heading={<StatusHeading tone="red" title="Cancel requested" sub={`Asked ${timeAgo(order.cancelRequestedAt)} · order is ${metaOf(ORDER_STATUS, order.orderStatus).label.toLowerCase()}`} />}
        actions={
          <>
            <ActionButton variant="decline" onClick={() => setDeclineOpen(true)}>
              Decline
            </ActionButton>
            <ActionButton variant="accept" disabled={pending} onClick={() => run('approveOrderCancellation')}>
              {pending ? 'Saving…' : 'Approve Cancel'}
            </ActionButton>
          </>
        }
      >
        <div>
          <SectionLabel>Customer’s reason</SectionLabel>
          <p className="rounded-lg bg-gray-100 px-3 py-2 text-[13px] text-gray-900">{order.cancelRequestReason ?? 'No reason given'}</p>
        </div>
        <p className="text-[11.5px] text-gray-500">
          {[hasActiveDelivery(order) && 'Approving also cancels the delivery in progress.', paid && 'The amount paid becomes a refund due.'].filter(Boolean).join(' ') ||
            'Declining keeps the order going; the customer sees your reason.'}
        </p>
        {!declineOpen && <InlineError message={error} />}
        {declineOpen && (
          <ReasonDialog
            open
            onOpenChange={(o) => !o && setDeclineOpen(false)}
            title="Decline the cancellation?"
            description="The order continues. The customer sees your reason."
            confirmLabel="Decline request"
            pending={pending}
            error={error}
            onConfirm={(reason) => run('declineOrderCancellation', { reason }, () => setDeclineOpen(false))}
          />
        )}
      </OrderCardFrame>
    );
  }

  const rejected = order.orderStatus === 'REJECTED';
  const reason = order.rejectionReason ?? order.cancellationReason;
  return (
    <OrderCardFrame order={order} onOpen={onOpen} heading={<StatusHeading tone={rejected ? 'gray' : 'red'} title={rejected ? 'Declined' : 'Cancelled'} sub={formatWhen(order.cancelledAt ?? order.completedAt)} />}>
      <div>
        <SectionLabel>Reason</SectionLabel>
        <p className="rounded-lg bg-gray-100 px-3 py-2 text-[13px] text-gray-900">{reason ?? 'No reason recorded'}</p>
      </div>
      {refundDue(order) ? (
        <RefundBox order={order} />
      ) : order.paymentStatus === 'REFUNDED' ? (
        <p className="text-[12px] font-medium text-green-700">Refunded to the customer.</p>
      ) : null}
    </OrderCardFrame>
  );
}
