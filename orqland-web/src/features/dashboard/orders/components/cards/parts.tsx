'use client';

import { cn } from '@/lib/utils';
import { formatMoney } from '@/features/dashboard/common/utils/format';
import type { Order } from '../../types/order.types';
import { addressLine1, addressLine2, paymentLabel } from '../../utils/order-display';

/** Two-column order card from the design: status & product on the left, customer & actions on the right. */
export function SplitCard({ left, right, className, urgent, label }: { left: React.ReactNode; right: React.ReactNode; className?: string; urgent?: 'low' | 'overdue' | null; label: string }) {
  return (
    <article
      aria-label={label}
      className={cn(
        '@container w-full overflow-hidden rounded-2xl border-2 bg-white shadow-sm',
        urgent === 'overdue' ? 'border-red-500 bg-red-50/40' : urgent === 'low' ? 'order-urgent border-red-500' : 'border-transparent',
        className,
      )}
    >
      <div className="grid h-full @min-[540px]:grid-cols-[1.05fr_1fr]">
        <div className="flex min-w-0 flex-col gap-4 p-5">{left}</div>
        <div className="flex min-w-0 flex-col gap-3 border-t border-gray-200 p-5 @min-[540px]:border-l @min-[540px]:border-t-0">{right}</div>
      </div>
    </article>
  );
}

/** Standard card body: heading, product, quantity/cost and destination on the left; order id, customer and the status-specific part on the right. */
export function OrderCardFrame({
  order,
  onOpen,
  heading,
  leftExtra,
  urgent,
  children,
  actions,
}: {
  order: Order;
  onOpen: (orderId: string) => void;
  heading: React.ReactNode;
  leftExtra?: React.ReactNode;
  urgent?: 'low' | 'overdue' | null;
  children?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <SplitCard
      label={`Order ${order.orderNumber}`}
      urgent={urgent}
      left={
        <>
          {heading}
          <ProductBlock order={order} />
          <Facts>
            <Fact label="Quantity">{order.items.reduce((n, i) => n + i.quantity, 0)}</Fact>
            <Fact label="Cost">{formatMoney(order.totalAmount)}</Fact>
          </Facts>
          {leftExtra}
          <DestinationBlock order={order} />
        </>
      }
      right={
        <>
          <div className="flex items-center justify-between gap-2">
            <OrderIdLine order={order} />
            <button type="button" onClick={() => onOpen(order.id)} className="shrink-0 text-[12px] font-semibold text-gray-950 underline-offset-2 hover:underline">
              View order →
            </button>
          </div>
          <CustomerBox order={order} />
          {children}
          {actions && <div className="mt-auto flex flex-wrap justify-end gap-2 pt-1 [&>*]:flex-1 sm:[&>*]:flex-none">{actions}</div>}
        </>
      }
    />
  );
}

export type ChipTone = 'green' | 'red' | 'blue' | 'amber' | 'gray';
const CHIP: Record<ChipTone, string> = {
  green: 'bg-green-100 text-green-700',
  red: 'bg-red-100 text-red-600',
  blue: 'bg-sky-100 text-sky-800',
  amber: 'bg-amber-100 text-amber-700',
  gray: 'bg-gray-100 text-gray-700',
};

export function Chip({ tone, children, className }: { tone: ChipTone; children: React.ReactNode; className?: string }) {
  return <span className={cn('inline-flex items-center rounded-md px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-wide', CHIP[tone], className)}>{children}</span>;
}

/** STATUS chip + large status title + time line. */
export function StatusHeading({ tone, title, sub }: { tone: ChipTone; title: string; sub?: string }) {
  return (
    <div>
      <Chip tone={tone}>Status</Chip>
      <h3 className="mt-2 text-[22px] font-extrabold uppercase leading-tight tracking-tight text-gray-950">{title}</h3>
      {sub && <p className="text-[11.5px] text-gray-500">{sub}</p>}
    </div>
  );
}

export function ProductBlock({ order }: { order: Order }) {
  const item = order.items[0];
  const more = order.items.length - 1;
  return (
    <div>
      <p className="text-[10.5px] font-semibold uppercase tracking-wide text-gray-500">Product name</p>
      <p className="truncate text-[19px] font-bold leading-tight text-gray-950">{item?.title ?? 'Order'}</p>
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {item?.variantLabel && <Chip tone="blue">{item.variantLabel}</Chip>}
        {item?.sku && <Chip tone="blue">SKU {item.sku}</Chip>}
        {more > 0 && <Chip tone="gray">+{more} more item{more > 1 ? 's' : ''}</Chip>}
      </div>
    </div>
  );
}

export function DestinationBlock({ order, label }: { order: Order; label?: string }) {
  return (
    <div className="mt-auto rounded-xl bg-gray-950 px-4 py-3 text-white">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-white/60">{label ?? (order.deliveryAddressSnapshot ? 'Destination' : 'Pickup')}</p>
      <p className="truncate text-[16px] font-semibold">{addressLine1(order)}</p>
      {addressLine2(order) && <p className="truncate text-[11px] text-white/60">{addressLine2(order)}</p>}
    </div>
  );
}

const PAYMENT_DOT: Record<string, string> = { PAID: 'bg-green-600', PENDING: 'bg-blue-600', FAILED: 'bg-red-600', REFUND_PENDING: 'bg-amber-500', PARTIALLY_REFUNDED: 'bg-amber-500', REFUNDED: 'bg-gray-400' };

export function CustomerBox({ order, showPayment = true, label = 'Customer details' }: { order: Order; showPayment?: boolean; label?: string | null }) {
  const initials = order.buyerSnapshot.name
    .split(' ')
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
  return (
    <div>
      {label && <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-gray-500">{label}</p>}
      <div className="flex items-center gap-3 rounded-xl bg-gray-100 p-2.5 shadow-[inset_0_0_0_1px_rgba(0,0,0,0.04)]">
        <span aria-hidden className="flex size-11 shrink-0 items-center justify-center rounded-md bg-gray-950 text-[13px] font-semibold text-white">
          {initials}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[14px] font-semibold text-gray-950">{order.buyerSnapshot.name}</span>
          {order.buyerSnapshot.phone ? (
            <a href={`tel:${order.buyerSnapshot.phone}`} className="block text-[12px] text-gray-500 hover:underline">
              {order.buyerSnapshot.phone}
            </a>
          ) : (
            <span className="block text-[12px] text-gray-400">No phone</span>
          )}
          {showPayment && (
            <span className="mt-0.5 flex items-center gap-1 text-[11px] font-semibold text-gray-800">
              <span aria-hidden className={cn('size-1.5 rounded-full', PAYMENT_DOT[order.paymentStatus] ?? 'bg-gray-400')} />
              {paymentLabel(order)}
            </span>
          )}
        </span>
      </div>
    </div>
  );
}

export function OrderIdLine({ order }: { order: Order }) {
  return (
    <p className="text-[12px] font-semibold uppercase tracking-wide text-gray-500">
      Order ID - <span className="font-mono text-gray-950">{order.orderNumber}</span>
    </p>
  );
}

export function Facts({ children }: { children: React.ReactNode }) {
  return <dl className="grid grid-cols-2 gap-2">{children}</dl>;
}

export function Fact({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('rounded-lg bg-gray-100 px-3 py-2', className)}>
      <dt className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">{label}</dt>
      <dd className="text-[13.5px] font-semibold text-gray-950">{children}</dd>
    </div>
  );
}

/** Pie (filled = time left) used for the return window on completed orders. */
export function PieTimer({ fraction, label, ariaLabel }: { fraction: number; label: string; ariaLabel: string }) {
  const f = Math.max(0, Math.min(1, fraction));
  return (
    <div
      role="img"
      aria-label={ariaLabel}
      className="flex size-[88px] shrink-0 items-center justify-center rounded-full text-center text-[13px] font-bold leading-tight text-white"
      style={{ background: `conic-gradient(from 0deg, #2563eb ${f * 360}deg, #dbeafe ${f * 360}deg)` }}
    >
      <span className="rounded-full px-1 drop-shadow">{label}</span>
    </div>
  );
}

export function ActionButton({ children, className, variant = 'ink', ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'ink' | 'accept' | 'decline' | 'soft' }) {
  return (
    <button
      type="button"
      className={cn(
        'inline-flex h-10 items-center justify-center gap-1.5 rounded-lg px-4 text-[13.5px] font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-900 disabled:opacity-50',
        variant === 'ink' && 'bg-gray-950 text-white hover:bg-gray-800',
        variant === 'accept' && 'border-2 border-green-500 bg-green-100 text-green-700 hover:bg-green-200',
        variant === 'decline' && 'border-2 border-red-200 bg-white text-red-600 hover:bg-red-50',
        variant === 'soft' && 'bg-gray-200 text-gray-900 hover:bg-gray-300',
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

export function InlineError({ message }: { message: string | null | undefined }) {
  if (!message) return null;
  return (
    <p role="alert" className="rounded-md bg-red-50 px-2.5 py-1.5 text-[12px] text-red-700">
      {message}
    </p>
  );
}

export function CustomerNote({ order }: { order: Order }) {
  if (!order.customerNote) return null;
  return (
    <p className="rounded-lg bg-amber-50 px-3 py-2 text-[12.5px] text-amber-900">
      <span className="font-semibold">Customer note: </span>
      {order.customerNote}
    </p>
  );
}

export function SectionLabel({ children }: { children: React.ReactNode }) {
  return <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-gray-500">{children}</p>;
}
