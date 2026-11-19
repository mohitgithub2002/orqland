'use client';

import { cancelPending } from '../../utils/order-display';
import { CancelledCard } from './CancelledCard';
import { CompletedCard } from './CompletedCard';
import { NewOrderCard } from './NewOrderCard';
import { OngoingCard } from './OngoingCard';
import { ProcessingCard } from './ProcessingCard';
import { SupportCard } from './SupportCard';
import type { OrderCardProps } from './types';
import { UpcomingCard } from './UpcomingCard';

export type { OrderCardProps } from './types';

/** Picks the card for the order's current state — the card changes as the order moves on. */
export function OrderCard(props: OrderCardProps) {
  const { order } = props;
  if (cancelPending(order)) return <CancelledCard {...props} />;
  switch (order.orderStatus) {
    case 'PLACED':
      return <NewOrderCard {...props} />;
    case 'ACCEPTED':
      return <UpcomingCard {...props} />;
    case 'PREPARING':
      return <ProcessingCard {...props} />;
    case 'READY_FOR_FULFILMENT':
    case 'AWAITING_CUSTOMER_PICKUP':
    case 'OUT_FOR_DELIVERY':
      return <OngoingCard {...props} />;
    case 'DELIVERED':
    case 'PICKED_UP':
      return <CompletedCard {...props} />;
    case 'CANCELLED':
    case 'REJECTED':
      return <CancelledCard {...props} />;
    default:
      return <SupportCard {...props} />;
  }
}

export function OrderCardSkeleton() {
  return (
    <div aria-hidden className="grid h-[320px] animate-pulse overflow-hidden rounded-2xl bg-white shadow-sm md:grid-cols-2">
      <div className="space-y-4 p-5">
        <div className="h-4 w-16 rounded bg-gray-200" />
        <div className="h-6 w-40 rounded bg-gray-200" />
        <div className="h-10 w-full rounded bg-gray-100" />
        <div className="h-16 w-full rounded bg-gray-100" />
      </div>
      <div className="space-y-3 border-l border-gray-100 p-5">
        <div className="h-4 w-32 rounded bg-gray-200" />
        <div className="h-16 w-full rounded bg-gray-100" />
        <div className="h-20 w-full rounded bg-gray-100" />
      </div>
    </div>
  );
}
