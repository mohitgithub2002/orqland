'use client';

import { useState } from 'react';
import { formatMoney } from '@/features/dashboard/common/utils/format';
import type { Order } from '../../types/order.types';
import { ActionButton, InlineError } from './parts';
import { useCardAction } from './useCardAction';

/** Refund due on a cancelled, rejected or returned order that was paid. */
export function RefundBox({ order }: { order: Order }) {
  const { run, pending, error } = useCardAction(order.id);
  const [reference, setReference] = useState('');
  const online = order.paymentMethod === 'ONLINE';
  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
      <p className="text-[13px] font-semibold text-amber-900">
        Refund due · {formatMoney(order.amountPaid)}
      </p>
      <p className="text-[11.5px] text-amber-800">{online ? 'Refund to the customer’s original payment method, then approve it here.' : 'Return the cash collected, then approve it here.'}</p>
      <div className="mt-2 flex flex-col gap-2">
        <input
          aria-label="Refund reference (optional)"
          placeholder="Reference (optional)"
          value={reference}
          maxLength={120}
          onChange={(e) => setReference(e.target.value)}
          className="h-10 w-full rounded-lg border border-amber-200 bg-white px-3 text-[13px] focus-visible:outline-2 focus-visible:outline-gray-900"
        />
        <ActionButton variant="accept" disabled={pending} onClick={() => run('approveOrderRefund', { providerReference: reference.trim() || undefined })}>
          {pending ? 'Saving…' : 'Approve Refund'}
        </ActionButton>
      </div>
      <InlineError message={error} />
    </div>
  );
}
