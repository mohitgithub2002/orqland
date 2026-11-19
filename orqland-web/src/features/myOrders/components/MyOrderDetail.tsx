'use client';

import { KeyRound } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { ProtectedFileLink } from '@/features/dashboard/common/components/ProtectedFileLink';
import { ReasonDialog } from '@/features/dashboard/common/components/ReasonDialog';
import { SectionLabel } from '@/components/ui/panel';
import { StatusDot } from '@/components/ui/status-dot';
import { Timeline } from '@/components/ui/timeline';
import { formatAddress, formatDate, formatDateTime, formatMoney, humanize } from '@/features/dashboard/common/utils/format';
import { gqlErrorMessage } from '@/features/dashboard/common/utils/gqlError';
import { metaOf, ORDER_STATUS, PAYMENT_STATUS } from '@/features/dashboard/common/utils/status';
import { cn } from '@/lib/utils';
import { useMyOrder, useMyOrderAction } from '../hooks/useMyOrders';
import type { MyOrderDetail as Order } from '../types/my-orders.types';

/** After the shop accepts, the customer can only ask to cancel; the shop approves or declines. */
const CANCEL_REQUESTABLE = ['ACCEPTED', 'PREPARING', 'READY_FOR_FULFILMENT', 'AWAITING_CUSTOMER_PICKUP'];

const DELIVERY_STEPS = ['PLACED', 'ACCEPTED', 'PREPARING', 'READY_FOR_FULFILMENT', 'OUT_FOR_DELIVERY', 'DELIVERED'];
const PICKUP_STEPS = ['PLACED', 'ACCEPTED', 'PREPARING', 'AWAITING_CUSTOMER_PICKUP', 'PICKED_UP'];
const STEP_LABEL: Record<string, string> = {
  PLACED: 'Placed',
  ACCEPTED: 'Confirmed',
  PREPARING: 'Preparing',
  READY_FOR_FULFILMENT: 'Packed',
  OUT_FOR_DELIVERY: 'On the way',
  DELIVERED: 'Delivered',
  AWAITING_CUSTOMER_PICKUP: 'Ready to collect',
  PICKED_UP: 'Collected',
};

function Progress({ order }: { order: Order }) {
  const steps = order.requestedFulfilment === 'PICKUP' || order.fulfilmentMethod === 'PICKUP' ? PICKUP_STEPS : DELIVERY_STEPS;
  const reached = new Set(order.history.map((h) => h.toStatus));
  if (['REJECTED', 'CANCELLED', 'RETURNED'].includes(order.orderStatus)) return null;
  return (
    <ol className="grid gap-1" style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }}>
      {steps.map((s) => (
        <li key={s} className="space-y-1">
          <span className={cn('block h-1 rounded-full', reached.has(s as never) ? 'bg-foreground' : 'bg-border')} />
          <span className={cn('block text-[10px] leading-tight', reached.has(s as never) ? 'text-foreground' : 'text-muted-foreground')}>{STEP_LABEL[s]}</span>
        </li>
      ))}
    </ol>
  );
}

export function MyOrderDetail({ orderId, onClose }: { orderId: string | null; onClose: () => void }) {
  const { data: order } = useMyOrder(orderId);
  const cancel = useMyOrderAction('cancel');
  const requestReturn = useMyOrderAction('requestReturn');
  const [dialog, setDialog] = useState<'cancel' | 'return' | null>(null);
  const action = dialog === 'cancel' ? cancel : requestReturn;
  const canCancel = !!order?.allowedNextStatuses.includes('CANCELLED');
  const cancelAsked = order?.cancelRequestStatus === 'REQUESTED' && CANCEL_REQUESTABLE.includes(order.orderStatus);
  const canAskCancel = !!order && !canCancel && !cancelAsked && CANCEL_REQUESTABLE.includes(order.orderStatus);
  const returnOpen = !order?.returnWindowEndsAt || new Date(order.returnWindowEndsAt).getTime() > Date.now();
  const canReturn = !!order?.allowedNextStatuses.includes('RETURN_REQUESTED') && returnOpen;

  return (
    <Sheet open={!!orderId} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="ops-theme max-w-md overflow-y-auto">
        {!order ? (
          <Skeleton className="m-6 h-64" />
        ) : (
          <div className="space-y-6 p-6">
            <div className="space-y-2 pr-8">
              <SheetTitle>{order.orqspaceName}</SheetTitle>
              <SheetDescription className="font-mono text-xs">
                {order.orderNumber} · {formatDateTime(order.createdAt)}
              </SheetDescription>
              <div className="flex flex-wrap gap-x-4 gap-y-1">
                <StatusDot tone={metaOf(ORDER_STATUS, order.orderStatus).tone} label={metaOf(ORDER_STATUS, order.orderStatus).label} className="text-[12.5px]" />
                <StatusDot
                  tone={metaOf(PAYMENT_STATUS, order.paymentStatus).tone}
                  label={`${order.paymentMethod === 'COD' ? 'Cash' : 'Online'} · ${metaOf(PAYMENT_STATUS, order.paymentStatus).label}`}
                  className="text-[12.5px]"
                />
              </div>
            </div>
            <Progress order={order} />

            {order.scheduledFor && !['DELIVERED', 'PICKED_UP', 'CANCELLED', 'REJECTED'].includes(order.orderStatus) && (
              <p className="rounded-md bg-muted px-3 py-2 text-sm">
                Scheduled for <span className="font-medium">{formatDateTime(order.scheduledFor)}</span>
              </p>
            )}
            {cancelAsked && (
              <p role="status" className="rounded-md border border-border px-3 py-2 text-sm">
                You asked to cancel. The shop will approve or decline your request shortly.
              </p>
            )}
            {order.cancelRequestStatus === 'DECLINED' && CANCEL_REQUESTABLE.includes(order.orderStatus) && (
              <p className="rounded-md border border-border px-3 py-2 text-sm">
                The shop couldn’t cancel this order{order.cancelRequestResolution ? `: ${order.cancelRequestResolution}` : '.'}
              </p>
            )}
            {order.orderStatus === 'RETURN_REQUESTED' && (
              <p className="rounded-md bg-muted px-3 py-2 text-sm">
                Return requested.{order.returnPickupDate ? ` Pickup scheduled for ${formatDate(order.returnPickupDate)}.` : ' The shop will schedule a pickup.'}
              </p>
            )}

            {order.deliveryOtp && (
              <div className="rounded-xl bg-foreground p-4 text-background">
                <p className="flex items-center gap-2 text-xs uppercase tracking-[0.12em] opacity-70">
                  <KeyRound className="size-3.5" /> Delivery code
                </p>
                <p className="mt-1 font-mono text-4xl font-semibold tracking-[0.4em]">{order.deliveryOtp}</p>
                <p className="mt-1 text-xs opacity-70">Share this only when you receive your order.</p>
              </div>
            )}

            {(order.rejectionReason || order.cancellationReason) && (
              <p className="rounded-md bg-muted px-3 py-2 text-sm">{order.rejectionReason ?? order.cancellationReason}</p>
            )}

            <Section title="Items">
              {order.items.map((i) => (
                <div key={i.id} className="flex justify-between text-sm">
                  <span>
                    {i.quantity}× {i.title}
                    {i.variantLabel && <span className="text-muted-foreground"> · {i.variantLabel}</span>}
                  </span>
                  <span className="tabular-nums">{formatMoney(i.lineTotal)}</span>
                </div>
              ))}
              <div className="border-t border-border pt-1">
                <KeyValue label="GST" value={formatMoney(order.totalGst)} />
                <KeyValue label="Total" value={formatMoney(order.totalAmount)} />
              </div>
            </Section>

            {order.invoice && (
              <Section title="Invoice">
                <ProtectedFileLink fileId={order.invoice.id} label={order.invoice.originalName ?? 'Download invoice'} />
              </Section>
            )}

            {order.deliveryAddressSnapshot && (
              <Section title="Delivering to">
                <p className="text-sm">{formatAddress(order.deliveryAddressSnapshot)}</p>
              </Section>
            )}

            <Section title="Updates">
              <Timeline
                items={order.history.map((h, i, all) => ({
                  id: h.id,
                  title: STEP_LABEL[h.toStatus] ?? humanize(h.toStatus),
                  meta: h.reason,
                  time: formatDateTime(h.createdAt),
                  state: ['REJECTED', 'CANCELLED', 'DELIVERY_FAILED'].includes(h.toStatus) ? 'problem' : i === all.length - 1 ? 'current' : 'done',
                }))}
              />
            </Section>

            <div className="flex flex-col gap-2">
              {(canCancel || canAskCancel) && (
                <Button variant="outline" onClick={() => setDialog('cancel')}>
                  {canCancel ? 'Cancel order' : 'Ask to cancel'}
                </Button>
              )}
              {canReturn && (
                <>
                  <Button variant="outline" onClick={() => setDialog('return')}>
                    Request a return
                  </Button>
                  {order.returnWindowEndsAt && <p className="text-center text-[12px] text-muted-foreground">Returns accepted until {formatDateTime(order.returnWindowEndsAt)}</p>}
                </>
              )}
            </div>
            <ReasonDialog
              open={!!dialog}
              onOpenChange={(o) => !o && setDialog(null)}
              title={dialog === 'cancel' ? (canCancel ? 'Cancel this order?' : 'Ask the shop to cancel?') : 'Request a return'}
              description={
                dialog === 'cancel'
                  ? canCancel
                    ? 'The shop hasn’t confirmed it yet, so it is cancelled straight away.'
                    : 'The shop has already started on your order, so it decides whether it can still be cancelled.'
                  : 'The shop reviews your request and arranges the return.'
              }
              confirmLabel={dialog === 'cancel' ? (canCancel ? 'Cancel order' : 'Send request') : 'Send request'}
              destructive={dialog === 'cancel'}
              pending={action.isPending}
              error={action.error ? gqlErrorMessage(action.error) : null}
              onConfirm={(reason) => action.mutate({ orderId: order.id, reason }, { onSuccess: () => setDialog(null) })}
            />
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <SectionLabel>{title}</SectionLabel>
      {children}
    </section>
  );
}

function KeyValue({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 text-[13px]">
      <span className="text-muted-foreground">{label}</span>
      <span className="tabular">{value}</span>
    </div>
  );
}
