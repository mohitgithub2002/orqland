'use client';

import { useNow } from '@/features/dashboard/common/hooks/useNow';
import { formatWhen } from '../../utils/order-display';
import { InvoiceUpload } from './InvoiceUpload';
import { OrderCardFrame, PieTimer, StatusHeading } from './parts';
import type { OrderCardProps } from './types';

/** Delivered or collected: the return window and the invoice. */
export function CompletedCard({ order, onOpen }: OrderCardProps) {
  const now = useNow(60_000);
  const done = order.completedAt ?? order.deliveredAt;
  const ends = order.returnWindowEndsAt ? new Date(order.returnWindowEndsAt).getTime() : null;
  const start = done ? new Date(done).getTime() : null;
  const hoursLeft = ends ? Math.max(0, (ends - now) / 3_600_000) : 0;
  const fraction = ends && start ? (ends - now) / (ends - start) : 0;

  return (
    <OrderCardFrame
      order={order}
      onOpen={onOpen}
      heading={<StatusHeading tone="green" title={order.orderStatus === 'PICKED_UP' ? 'Collected' : 'Delivered'} sub={formatWhen(done)} />}
    >
      <div className="flex items-center gap-4 rounded-xl bg-gray-100 p-3">
        {ends ? (
          <>
            <PieTimer
              fraction={fraction}
              label={hoursLeft > 0 ? `${Math.ceil(hoursLeft)} hrs` : 'Closed'}
              ariaLabel={hoursLeft > 0 ? `${Math.ceil(hoursLeft)} hours left to request a return` : 'Return window closed'}
            />
            <div className="min-w-0">
              <p className="text-[14px] font-semibold text-gray-950">{order.orderStatus === 'PICKED_UP' ? 'Order collected' : 'Order delivered'}</p>
              <p className="text-[12px] text-gray-600">{hoursLeft > 0 ? `The customer can ask for a return until ${formatWhen(order.returnWindowEndsAt)}.` : 'The return window has closed.'}</p>
            </div>
          </>
        ) : (
          <p className="text-[12.5px] text-gray-700">{order.orderStatus === 'PICKED_UP' ? 'Order collected.' : 'Order delivered.'} Returns are not limited by a time window.</p>
        )}
      </div>
      <InvoiceUpload order={order} />
    </OrderCardFrame>
  );
}
