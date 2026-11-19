'use client';

import { CheckCircle2, Store, Truck } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { ErrorNote, SectionLabel } from '@/components/ui/panel';
import { formatAddress, formatMoney, humanize } from '@/features/dashboard/common/utils/format';
import { gqlErrorMessage } from '@/features/dashboard/common/utils/gqlError';
import { cn } from '@/lib/utils';
import { useCheckoutAddresses, useMyOrderAction } from '../hooks/useMyOrders';
import type { CartLine } from '../types/my-orders.types';

/** "My orders" page route — adjust if your account-centre routes differ. */
export const MY_ORDERS_HREF = '/my-orders';

interface CheckoutSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lines: CartLine[];
  onPlaced?: (orderIds: string[]) => void;
}

/**
 * Checkout for product listings. Open it from your listing / cart page with the cart lines.
 * Prices shown here are indicative — the server prices every line from the listing at order time.
 * Items from several workspaces become one order per workspace.
 */
export function CheckoutSheet({ open, onOpenChange, lines, onPlaced }: CheckoutSheetProps) {
  const addresses = useCheckoutAddresses(open);
  const place = useMyOrderAction('place');
  const [fulfilment, setFulfilment] = useState<'DELIVERY' | 'PICKUP'>('DELIVERY');
  const [payment, setPayment] = useState<'COD' | 'ONLINE'>('COD');
  const [addressId, setAddressId] = useState<string | null>(null);
  const [note, setNote] = useState('');
  // One idempotency key per checkout attempt: double taps and retries never create duplicate orders.
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());

  useEffect(() => {
    if (open) {
      setIdempotencyKey(crypto.randomUUID());
      place.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  useEffect(() => {
    if (!addressId && addresses.data?.length) setAddressId((addresses.data.find((a) => a.isPrimary) ?? addresses.data[0]).id);
  }, [addresses.data, addressId]);

  const total = useMemo(() => lines.reduce((sum, l) => sum + Number(l.unitTotalPrice) * l.quantity, 0), [lines]);
  const shops = new Set(lines.map((l) => l.orqspaceName).filter(Boolean));
  const result = place.data;

  const submit = () =>
    place.mutate(
      {
        idempotencyKey,
        items: lines.map((l) => ({ listingId: l.listingId, variantId: l.variantId, quantity: l.quantity })),
        paymentMethod: payment,
        requestedFulfilment: fulfilment,
        addressId: fulfilment === 'DELIVERY' ? addressId : undefined,
        customerNote: note.trim() || undefined,
      },
      { onSuccess: (r) => onPlaced?.(r.orders.map((o) => o.id)) },
    );

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="ops-theme max-w-md">
        {result ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
            <CheckCircle2 className="size-12 text-success" />
            <SheetTitle>Order placed</SheetTitle>
            <SheetDescription>The shop will confirm your order shortly.</SheetDescription>
            <div className="w-full space-y-2">
              {result.orders.map((o) => (
                <div key={o.id} className="flex justify-between rounded-lg border border-border px-3 py-2 text-sm">
                  <span>
                    <span className="block font-mono text-xs">{o.orderNumber}</span>
                    <span className="text-muted-foreground">{o.orqspaceName}</span>
                  </span>
                  <span className="font-medium">{formatMoney(o.totalAmount)}</span>
                </div>
              ))}
            </div>
            <Button asChild className="w-full">
              <Link href={MY_ORDERS_HREF}>View my orders</Link>
            </Button>
          </div>
        ) : (
          <>
            <div className="border-b border-border p-5 pr-12">
              <SheetTitle>Checkout</SheetTitle>
              <SheetDescription>{shops.size > 1 ? `${shops.size} shops — you get one order per shop.` : 'Review and place your order.'}</SheetDescription>
            </div>
            <div className="flex-1 space-y-6 overflow-y-auto p-5">
              <Section title="Items">
                <div className="divide-y divide-border rounded-lg border border-border">
                  {lines.map((l) => (
                    <div key={`${l.listingId}:${l.variantId ?? ''}`} className="flex justify-between gap-3 px-3 py-2 text-sm">
                      <span>
                        {l.quantity}× {l.title}
                        {l.variantLabel && <span className="text-muted-foreground"> · {l.variantLabel}</span>}
                      </span>
                      <span className="tabular-nums">{formatMoney(Number(l.unitTotalPrice) * l.quantity)}</span>
                    </div>
                  ))}
                </div>
              </Section>

              <Section title="How do you want it?">
                <div className="grid grid-cols-2 gap-2">
                  {(
                    [
                      { v: 'DELIVERY', label: 'Delivery', icon: Truck },
                      { v: 'PICKUP', label: 'Pick up', icon: Store },
                    ] as const
                  ).map((o) => (
                    <button
                      key={o.v}
                      onClick={() => setFulfilment(o.v)}
                      className={cn('flex items-center gap-2 rounded-lg border px-3 py-3 text-sm', fulfilment === o.v ? 'border-foreground bg-muted' : 'border-border')}
                    >
                      <o.icon className="size-4" /> {o.label}
                    </button>
                  ))}
                </div>
              </Section>

              {fulfilment === 'DELIVERY' && (
                <Section title="Deliver to">
                  {!addresses.data && <Skeleton className="h-16 w-full" />}
                  {addresses.data?.length === 0 && <p className="text-sm text-muted-foreground">Add an address in Manage Addresses first.</p>}
                  <div className="space-y-2">
                    {addresses.data?.map((a) => (
                      <label key={a.id} className={cn('flex cursor-pointer gap-3 rounded-lg border px-3 py-2.5 text-sm', addressId === a.id ? 'border-foreground bg-muted' : 'border-border')}>
                        <input type="radio" name="address" checked={addressId === a.id} onChange={() => setAddressId(a.id)} className="mt-1" />
                        <span>
                          <span className="font-medium">
                            {humanize(a.addressType)} · {a.recipientName}
                          </span>
                          <span className="block text-muted-foreground">{formatAddress(a)}</span>
                        </span>
                      </label>
                    ))}
                  </div>
                </Section>
              )}

              <Section title="Payment">
                <div className="grid grid-cols-2 gap-2">
                  {(
                    [
                      { v: 'COD', label: fulfilment === 'DELIVERY' ? 'Cash on delivery' : 'Pay at pickup' },
                      { v: 'ONLINE', label: 'Pay the shop online' },
                    ] as const
                  ).map((o) => (
                    <button
                      key={o.v}
                      onClick={() => setPayment(o.v)}
                      className={cn('rounded-lg border px-3 py-3 text-left text-sm', payment === o.v ? 'border-foreground bg-muted' : 'border-border')}
                    >
                      {o.label}
                    </button>
                  ))}
                </div>
              </Section>

              <Section title="Note for the shop">
                <Textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} placeholder="Optional" />
              </Section>
            </div>
            <div className="space-y-3 border-t border-border p-5">
              <KeyValue label="Estimated total (incl. GST)" value={<span className="text-base">{formatMoney(total)}</span>} />
              {place.error && <ErrorNote message={gqlErrorMessage(place.error)} />}
              <Button size="lg" className="w-full" disabled={place.isPending || (fulfilment === 'DELIVERY' && !addressId) || !lines.length} onClick={submit}>
                {place.isPending ? 'Placing order…' : 'Place order'}
              </Button>
            </div>
          </>
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
