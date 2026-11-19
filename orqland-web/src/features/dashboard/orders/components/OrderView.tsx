'use client';

import { useState } from 'react';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import { Timeline } from '@/components/ui/timeline';
import { useNow } from '@/features/dashboard/common/hooks/useNow';
import { formatAddress, formatDateTime, formatMoney } from '@/features/dashboard/common/utils/format';
import { gqlErrorMessage } from '@/features/dashboard/common/utils/gqlError';
import { metaOf, ORDER_STATUS } from '@/features/dashboard/common/utils/status';
import { useOrderDetail } from '../hooks/useOrders';
import type { Order } from '../types/order.types';
import { cancelPending, deliveryTypeLabel, formatWhen, PREP_EXTENSION_MINUTES, refundDue } from '../utils/order-display';
import { InvoiceUpload } from './cards/InvoiceUpload';
import { Chip, CustomerBox, CustomerNote, type ChipTone } from './cards/parts';
import { PrepTimer } from './cards/PrepTimer';
import { RefundBox } from './cards/RefundBox';
import { useCardAction } from './cards/useCardAction';
import { OrderActions } from './OrderActions';
import { OrderLiveTracking } from './OrderLiveTracking';
import { RecordPaymentDialog } from './RecordPaymentDialog';

const TONE: Record<string, ChipTone> = {
  PLACED: 'blue',
  ACCEPTED: 'amber',
  PREPARING: 'amber',
  READY_FOR_FULFILMENT: 'green',
  AWAITING_CUSTOMER_PICKUP: 'green',
  OUT_FOR_DELIVERY: 'blue',
  DELIVERED: 'green',
  PICKED_UP: 'green',
  DELIVERY_FAILED: 'red',
  RETURN_REQUESTED: 'amber',
  CANCELLED: 'red',
};

/** Order view: actions, live delivery tracking, customer, items, money, invoice and the timeline. */
export function OrderView({ orderId, orqspaceId, onClose }: { orderId: string | null; orqspaceId: string; onClose: () => void }) {
  const { data: order, isLoading, error } = useOrderDetail(orderId);
  return (
    <Sheet open={!!orderId} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="max-w-3xl border-l-0 bg-[#f3f4f6] text-gray-950">
        {error ? (
          <div className="p-6">
            <SheetTitle className="text-[17px]">Order unavailable</SheetTitle>
            <SheetDescription className="mt-1 text-red-700">{gqlErrorMessage(error)}</SheetDescription>
          </div>
        ) : isLoading || !order ? (
          <div className="space-y-4 p-6" aria-busy>
            <SheetTitle className="sr-only">Loading order</SheetTitle>
            <div className="h-7 w-48 animate-pulse rounded bg-gray-200" />
            <div className="h-72 w-full animate-pulse rounded-2xl bg-white" />
          </div>
        ) : (
          <OrderViewBody order={order} orqspaceId={orqspaceId} />
        )}
      </SheetContent>
    </Sheet>
  );
}

function OrderViewBody({ order, orqspaceId }: { order: Order; orqspaceId: string }) {
  const [paymentOpen, setPaymentOpen] = useState(false);
  const now = useNow(1000);
  const prep = useCardAction(order.id);
  const status = cancelPending(order) ? { label: 'Cancel requested', tone: 'red' as ChipTone } : { label: metaOf(ORDER_STATUS, order.orderStatus).label, tone: TONE[order.orderStatus] ?? 'gray' };
  const payments = order.payments ?? [];

  return (
    <>
      <header className="space-y-3 bg-white px-6 pb-4 pt-6 shadow-sm">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pr-8">
          <SheetTitle className="font-mono text-[18px] tracking-tight">{order.orderNumber}</SheetTitle>
          <Chip tone={status.tone}>{status.label}</Chip>
        </div>
        <SheetDescription className="text-[12.5px] text-gray-500">
          Placed {formatDateTime(order.createdAt)} · {deliveryTypeLabel(order)}
          {order.scheduledFor && ` for ${formatWhen(order.scheduledFor)}`}
        </SheetDescription>
        <OrderActions order={order} orqspaceId={orqspaceId} />
      </header>

      <div className="flex-1 space-y-4 overflow-y-auto p-4 sm:p-6">
        {order.orderStatus === 'PREPARING' && (
          <PrepTimer order={order} now={now} extending={prep.pending} onExtend={() => prep.run('extendOrderPreparation', { minutes: PREP_EXTENSION_MINUTES })} />
        )}

        {order.delivery && <OrderLiveTracking order={order} />}

        {cancelPending(order) && (
          <Block title="Cancel request">
            <p className="text-[13px]">{order.cancelRequestReason ?? 'No reason given'}</p>
            <p className="mt-1 text-[11.5px] text-gray-500">Asked {formatDateTime(order.cancelRequestedAt)}</p>
          </Block>
        )}
        {(order.rejectionReason || order.cancellationReason) && (
          <Block title={order.rejectionReason ? 'Declined' : 'Cancelled'}>
            <p className="text-[13px]">{order.rejectionReason ?? order.cancellationReason}</p>
          </Block>
        )}
        {refundDue(order) && <RefundBox order={order} />}

        <div className="grid gap-4 sm:grid-cols-2">
          <Block title="Customer">
            <CustomerBox order={order} label={null} />
            {order.buyerSnapshot.email && <p className="mt-2 truncate text-[12px] text-gray-500">{order.buyerSnapshot.email}</p>}
          </Block>
          <Block title={order.deliveryAddressSnapshot ? 'Deliver to' : 'Fulfilment'}>
            {order.deliveryAddressSnapshot ? (
              <div className="text-[13px]">
                <p className="font-semibold">{order.deliveryAddressSnapshot.recipientName}</p>
                <p className="text-gray-600">{formatAddress(order.deliveryAddressSnapshot)}</p>
                {order.deliveryAddressSnapshot.recipientPhone && <p className="text-[12px] text-gray-500">{order.deliveryAddressSnapshot.recipientPhone}</p>}
                {order.distanceFromPickupKm !== null && <p className="mt-1 text-[12px] text-gray-500">About {order.distanceFromPickupKm.toFixed(1)} km by road from your workspace</p>}
              </div>
            ) : (
              <p className="text-[13px] text-gray-600">The customer collects from the workspace.</p>
            )}
          </Block>
        </div>
        <CustomerNote order={order} />

        <Block title={`Items · ${order.itemCount}`}>
          <ul className="divide-y divide-gray-100">
            {order.items.map((item) => (
              <li key={item.id} className="flex items-center justify-between gap-4 py-2 text-[13px]">
                <div className="min-w-0">
                  <p className="truncate font-semibold">{item.title}</p>
                  <p className="text-[11.5px] text-gray-500">
                    {[item.variantLabel, item.sku && `SKU ${item.sku}`].filter(Boolean).join(' · ') || 'Standard'} · {formatMoney(item.unitTotalPrice)} × {item.quantity}
                    {item.stockRemaining !== null && ` · ${item.stockRemaining} left in stock`}
                  </p>
                </div>
                <span className="tabular-nums">{formatMoney(item.lineTotal)}</span>
              </li>
            ))}
          </ul>
          <dl className="ml-auto mt-2 max-w-[260px] space-y-0.5 text-[13px] tabular-nums">
            <Row label="Subtotal" value={formatMoney(order.subtotalBase)} />
            <Row label="GST" value={formatMoney(order.totalGst)} />
            {Number(order.deliveryFee) > 0 && <Row label="Delivery" value={formatMoney(order.deliveryFee)} />}
            {Number(order.discountTotal) > 0 && <Row label="Discount" value={`− ${formatMoney(order.discountTotal)}`} />}
            <div className="border-t border-gray-200 pt-1 font-bold">
              <Row label="Total" value={formatMoney(order.totalAmount)} />
            </div>
          </dl>
        </Block>

        {['DELIVERED', 'PICKED_UP', 'RETURN_REQUESTED', 'RETURNED'].includes(order.orderStatus) && (
          <Block title="Invoice">
            <InvoiceUpload order={order} />
          </Block>
        )}

        <Block
          title="Payments"
          action={
            <button type="button" className="text-[12px] font-semibold underline-offset-2 hover:underline" onClick={() => setPaymentOpen(true)}>
              Record payment
            </button>
          }
        >
          {payments.length === 0 ? (
            <p className="text-[12.5px] text-gray-500">
              {order.paymentMethod === 'COD' ? 'Cash on delivery — marked paid once the cash is settled in Delivery → COD.' : 'No payment recorded yet.'}
            </p>
          ) : (
            <ul className="divide-y divide-gray-100 text-[13px]">
              {payments.map((p) => (
                <li key={p.id} className="flex items-center justify-between py-1.5">
                  <span>
                    {p.kind === 'REFUND' ? 'Refund' : 'Payment'} · {p.provider === 'COD' ? 'COD settled' : p.method === 'COD' ? 'Cash' : 'Online'}
                    {p.providerReference && p.provider !== 'COD' && <span className="ml-1 font-mono text-[11.5px] text-gray-500">{p.providerReference}</span>}
                  </span>
                  <span className="tabular-nums">{p.status === 'FAILED' ? <span className="text-red-600">Failed</span> : formatMoney(p.amount)}</span>
                </li>
              ))}
            </ul>
          )}
        </Block>

        <Block title="Timeline">
          <Timeline
            items={order.history.map((h, i, all) => ({
              id: h.id,
              title: metaOf(ORDER_STATUS, h.toStatus).label,
              meta: [h.actorName ?? h.actorRole.toLowerCase(), h.actorRole === 'PLATFORM_ADMIN' ? 'platform override' : null, h.reason].filter(Boolean).join(' · '),
              time: formatDateTime(h.createdAt),
              state: ['REJECTED', 'CANCELLED', 'DELIVERY_FAILED'].includes(h.toStatus) ? 'problem' : i === all.length - 1 ? 'current' : 'done',
            }))}
          />
        </Block>
      </div>
      {paymentOpen && <RecordPaymentDialog order={order} open onOpenChange={setPaymentOpen} />}
    </>
  );
}

function Block({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl bg-white p-4 shadow-sm">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-gray-500">{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
