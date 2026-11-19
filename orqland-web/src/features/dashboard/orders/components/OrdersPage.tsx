'use client';

import '@/styles/ops-theme.css';
import '@/styles/order-cards.css';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowDownRight, ArrowRight, ArrowUpRight, CheckCircle2, ChevronLeft, ChevronRight, IndianRupee, RefreshCw, Search, Timer } from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { useActiveOrqspaceId } from '@/features/dashboard/common/hooks/useActiveOrqspaceId';
import { formatMoney } from '@/features/dashboard/common/utils/format';
import { gqlErrorMessage } from '@/features/dashboard/common/utils/gqlError';
import { cn } from '@/lib/utils';
import { orderKeys, useOrderSummary, useOrqspaceOrders } from '../hooks/useOrders';
import { ordersService } from '../services/orders.service';
import { ORDER_TABS, type Order, type OrderQueue, type OrderStatus } from '../types/order.types';
import { OrderCard, OrderCardSkeleton } from './cards/OrderCard';
import { OrderView } from './OrderView';

const PAGE_SIZE = 12;
const SECTION_SIZE = 4;

/** Links from elsewhere (e.g. Delivery overview) may still pass ?status=…; map them to a tab. */
const STATUS_TO_TAB: Partial<Record<OrderStatus, OrderQueue>> = {
  PLACED: 'UPCOMING',
  ACCEPTED: 'UPCOMING',
  PREPARING: 'PROCESSING',
  READY_FOR_FULFILMENT: 'ONGOING',
  AWAITING_CUSTOMER_PICKUP: 'ONGOING',
  OUT_FOR_DELIVERY: 'ONGOING',
  DELIVERED: 'COMPLETED',
  PICKED_UP: 'COMPLETED',
  CANCELLED: 'CANCELLED',
  REJECTED: 'CANCELLED',
  RETURN_REQUESTED: 'SUPPORT',
  DELIVERY_FAILED: 'SUPPORT',
  RETURNED: 'SUPPORT',
};

/** "All" tab: what needs attention first, each section linking to its tab. */
const SECTIONS: { queue: OrderQueue; title: string; tab: OrderQueue; statuses?: OrderStatus[]; hint: string }[] = [
  { queue: 'NEW', title: 'New entries', tab: 'UPCOMING', hint: 'Accept or decline' },
  { queue: 'CANCEL_REQUESTS', title: 'Cancel requests', tab: 'CANCELLED', hint: 'The customer asked to cancel' },
  { queue: 'PROCESSING', title: 'Processing', tab: 'PROCESSING', hint: 'Preparation timers running' },
  { queue: 'ONGOING', title: 'Ongoing', tab: 'ONGOING', hint: 'Prepared, on the way or waiting for pickup' },
  { queue: 'UPCOMING', title: 'Upcoming', tab: 'UPCOMING', statuses: ['ACCEPTED'], hint: 'Accepted — start preparing on time' },
  { queue: 'SUPPORT', title: 'Support', tab: 'SUPPORT', hint: 'Returns, failed deliveries and refunds' },
  { queue: 'COMPLETED', title: 'Recently completed', tab: 'COMPLETED', hint: 'Return window and invoices' },
];

const isTab = (v: string | null): v is OrderQueue => !!v && ORDER_TABS.some((t) => t.key === v);

/** Orders (Figma): sales summary, status tabs starting with All, and a card per order that follows its status. */
export function OrdersPage() {
  const orqspaceId = useActiveOrqspaceId();
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const tabParam = params.get('tab');
  const tab: OrderQueue = isTab(tabParam) ? tabParam : (STATUS_TO_TAB[(params.get('status') ?? '') as OrderStatus] ?? 'ALL');
  const openOrderId = params.get('order');
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [page, setPage] = useState(1);
  const summary = useOrderSummary(orqspaceId);
  const queryClient = useQueryClient();

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);
  useEffect(() => setPage(1), [tab, debounced]);

  const setParams = (next: Record<string, string | null>) => {
    const p = new URLSearchParams(params.toString());
    p.delete('status');
    for (const [k, v] of Object.entries(next)) {
      if (v === null) p.delete(k);
      else p.set(k, v);
    }
    router.replace(`${pathname}?${p.toString()}`, { scroll: false });
  };
  const setTab = (t: OrderQueue) => setParams({ tab: t === 'ALL' ? null : t });
  const openOrder = (id: string | null) => setParams({ order: id });

  if (!orqspaceId) {
    return <p className="rounded-2xl bg-white p-10 text-center text-[14px] text-gray-600 shadow-sm">Open a workspace to manage its orders.</p>;
  }

  const count = (q: OrderQueue) => summary.data?.tabs.find((t) => t.queue === q)?.count ?? 0;
  const showSections = tab === 'ALL' && !debounced;

  return (
    <div className="-m-4 min-h-[calc(100vh-68px)] bg-[#f3f4f6] p-4 text-gray-950 md:-m-6 md:p-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[24px] font-extrabold tracking-tight">Orders</h1>
          <p className="text-[12.5px] text-gray-500">Accept, prepare, assign delivery and follow every order to the door.</p>
        </div>
        <div className="flex w-full gap-2 sm:w-auto">
          <div className="relative flex-1 sm:w-72">
            <Search aria-hidden className="absolute left-3 top-3 size-4 text-gray-400" />
            <input
              type="search"
              aria-label="Search orders"
              placeholder="Order no., customer or phone"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-10 w-full rounded-xl border-0 bg-white pl-9 pr-3 text-[13px] shadow-sm focus-visible:outline-2 focus-visible:outline-gray-900"
            />
          </div>
          <button
            type="button"
            aria-label="Refresh"
            onClick={() => void queryClient.invalidateQueries({ queryKey: orderKeys.all })}
            className="flex size-10 items-center justify-center rounded-xl bg-white shadow-sm hover:bg-gray-50 focus-visible:outline-2 focus-visible:outline-gray-900"
          >
            <RefreshCw className={cn('size-4', summary.isFetching && 'animate-spin')} />
          </button>
        </div>
      </header>

      <section aria-label="Summary" className="mt-5 grid gap-4 sm:grid-cols-3">
        <SummaryCard
          icon={<IndianRupee className="size-5" />}
          iconClass="bg-green-100 text-green-700"
          label="Total Sales"
          value={summary.data ? formatMoney(summary.data.totalSales) : '—'}
          change={summary.data?.totalSalesChangePercent ?? null}
          foot="this month"
          loading={summary.isLoading}
        />
        <SummaryCard
          icon={<Timer className="size-5" />}
          iconClass="bg-sky-100 text-sky-700"
          label="Ongoing Orders"
          value={summary.data?.ongoingOrders ?? '—'}
          foot={summary.data ? `${summary.data.newOrdersToday} new today` : ''}
          loading={summary.isLoading}
          onClick={() => setTab('ONGOING')}
        />
        <SummaryCard
          icon={<CheckCircle2 className="size-5" />}
          iconClass="bg-violet-100 text-violet-700"
          label="Completed Orders"
          value={summary.data?.completedOrders ?? '—'}
          change={summary.data?.completedChangePercent ?? null}
          foot="this month"
          loading={summary.isLoading}
          onClick={() => setTab('COMPLETED')}
        />
      </section>
      {summary.error && <p className="mt-3 text-[12.5px] text-red-700">{gqlErrorMessage(summary.error)}</p>}

      <nav aria-label="Order status" className="-mx-4 mt-6 overflow-x-auto px-4 md:mx-0 md:px-0">
        <div role="tablist" className="flex w-max gap-2">
          {ORDER_TABS.map((t) => {
            const selected = tab === t.key;
            const n = count(t.key);
            return (
              <button
                key={t.key}
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => setTab(t.key)}
                className={cn(
                  'flex h-10 items-center gap-2 rounded-full px-4 text-[13.5px] font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-900',
                  selected ? 'bg-gray-950 text-white' : 'bg-white text-gray-700 shadow-sm hover:bg-gray-50',
                )}
              >
                {t.label}
                {t.key !== 'ALL' && n > 0 && (
                  <span className={cn('min-w-5 rounded-full px-1.5 text-center text-[11px] tabular-nums', selected ? 'bg-white/20' : t.key === 'CANCELLED' && count('CANCEL_REQUESTS') ? 'bg-red-100 text-red-700' : 'bg-gray-100')}>
                    {n}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </nav>

      <div className="mt-5">
        {showSections ? (
          <AllSections orqspaceId={orqspaceId} count={count} onTab={setTab} onOpen={openOrder} loadingSummary={summary.isLoading} />
        ) : (
          <QueueGrid orqspaceId={orqspaceId} queue={tab} search={debounced} page={page} onPage={setPage} onOpen={openOrder} />
        )}
      </div>

      <OrderView orderId={openOrderId} orqspaceId={orqspaceId} onClose={() => openOrder(null)} />
    </div>
  );
}

function SummaryCard({
  icon,
  iconClass,
  label,
  value,
  change,
  foot,
  loading,
  onClick,
}: {
  icon: React.ReactNode;
  iconClass: string;
  label: string;
  value: React.ReactNode;
  change?: number | null;
  foot: string;
  loading: boolean;
  onClick?: () => void;
}) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag
      {...(onClick ? { type: 'button' as const, onClick } : {})}
      className={cn('flex items-start gap-4 rounded-2xl bg-white p-5 text-left shadow-sm', onClick && 'transition-shadow hover:shadow-md focus-visible:outline-2 focus-visible:outline-gray-900')}
    >
      <span aria-hidden className={cn('flex size-11 shrink-0 items-center justify-center rounded-xl', iconClass)}>
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block text-[12.5px] font-medium text-gray-500">{label}</span>
        {loading ? <span className="mt-1 block h-8 w-28 animate-pulse rounded bg-gray-100" /> : <span className="block text-[28px] font-extrabold leading-tight tabular-nums">{value}</span>}
        <span className="mt-0.5 flex items-center gap-1.5 text-[12px] text-gray-500">
          {change !== null && change !== undefined && (
            <span className={cn('inline-flex items-center font-semibold', change >= 0 ? 'text-green-700' : 'text-red-600')}>
              {change >= 0 ? <ArrowUpRight className="size-3.5" /> : <ArrowDownRight className="size-3.5" />}
              {Math.abs(change)}%
            </span>
          )}
          {change !== null && change !== undefined ? `vs last month` : foot}
        </span>
      </span>
    </Tag>
  );
}

function CardGrid({ orders, loading, orqspaceId, onOpen, skeletons = 2 }: { orders: Order[]; loading: boolean; orqspaceId: string; onOpen: (id: string) => void; skeletons?: number }) {
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      {loading && orders.length === 0
        ? Array.from({ length: skeletons }, (_, i) => <OrderCardSkeleton key={i} />)
        : orders.map((o) => <OrderCard key={o.id} order={o} orqspaceId={orqspaceId} onOpen={onOpen} />)}
    </div>
  );
}

function AllSections({
  orqspaceId,
  count,
  onTab,
  onOpen,
  loadingSummary,
}: {
  orqspaceId: string;
  count: (q: OrderQueue) => number;
  onTab: (t: OrderQueue) => void;
  onOpen: (id: string) => void;
  loadingSummary: boolean;
}) {
  const sectionCount = (s: (typeof SECTIONS)[number]) => (s.queue === 'UPCOMING' ? Math.max(0, count('UPCOMING') - count('NEW')) : count(s.queue));
  const visible = SECTIONS.filter((s) => sectionCount(s) > 0);
  if (loadingSummary) return <CardGrid orders={[]} loading orqspaceId={orqspaceId} onOpen={onOpen} />;
  if (visible.length === 0) {
    return (
      <div className="rounded-2xl bg-white p-10 text-center shadow-sm">
        <p className="text-[16px] font-semibold">No orders yet</p>
        <p className="mt-1 text-[13px] text-gray-500">Orders placed on your listings appear here, newest first.</p>
      </div>
    );
  }
  return (
    <div className="space-y-8">
      {visible.map((s) => (
        <Section key={s.queue} section={s} total={sectionCount(s)} orqspaceId={orqspaceId} onTab={onTab} onOpen={onOpen} />
      ))}
    </div>
  );
}

function Section({
  section,
  total,
  orqspaceId,
  onTab,
  onOpen,
}: {
  section: (typeof SECTIONS)[number];
  total: number;
  orqspaceId: string;
  onTab: (t: OrderQueue) => void;
  onOpen: (id: string) => void;
}) {
  const filter = useMemo(() => ({ orqspaceId, queue: section.queue, statuses: section.statuses, page: 1, pageSize: SECTION_SIZE }), [orqspaceId, section]);
  const list = useOrqspaceOrders(filter);
  const headingId = `section-${section.queue}`;
  return (
    <section aria-labelledby={headingId}>
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 id={headingId} className="text-[17px] font-bold">
            {section.title} <span className="font-semibold text-gray-400 tabular-nums">({total})</span>
          </h2>
          <p className="text-[12px] text-gray-500">{section.hint}</p>
        </div>
        <div className="flex items-center gap-3">
          {section.queue === 'NEW' && <AcceptAll orqspaceId={orqspaceId} total={total} />}
          <button type="button" onClick={() => onTab(section.tab)} className="inline-flex items-center gap-1 text-[13px] font-semibold text-gray-950 hover:underline">
            View all <ArrowRight className="size-4" />
          </button>
        </div>
      </div>
      {list.error ? (
        <p className="rounded-xl bg-red-50 px-4 py-3 text-[13px] text-red-700">{gqlErrorMessage(list.error)}</p>
      ) : (
        <CardGrid orders={list.data?.items ?? []} loading={list.isLoading} orqspaceId={orqspaceId} onOpen={onOpen} skeletons={Math.min(2, total)} />
      )}
    </section>
  );
}

/** Accepts every new order (oldest first), one by one, so a single failure doesn't block the rest. */
function AcceptAll({ orqspaceId, total }: { orqspaceId: string; total: number }) {
  const queryClient = useQueryClient();
  const [state, setState] = useState<{ done: number; failed: number; running: boolean } | null>(null);
  const run = async () => {
    setState({ done: 0, failed: 0, running: true });
    let done = 0;
    let failed = 0;
    try {
      const page = await ordersService.list({ orqspaceId, queue: 'NEW', page: 1, pageSize: 50 });
      for (const o of page.items) {
        try {
          await ordersService.action('acceptOrder', { orderId: o.id });
          done++;
        } catch {
          failed++;
        }
        setState({ done, failed, running: true });
      }
    } catch {
      failed++;
    }
    setState({ done, failed, running: false });
    void queryClient.invalidateQueries({ queryKey: orderKeys.all });
  };
  return (
    <span className="flex items-center gap-2">
      {state && (
        <span role="status" className={cn('text-[12px]', state.failed ? 'text-red-700' : 'text-gray-500')}>
          {state.running ? `Accepting… ${state.done}` : `${state.done} accepted${state.failed ? ` · ${state.failed} could not be accepted` : ''}`}
        </span>
      )}
      <button
        type="button"
        disabled={state?.running || total === 0}
        onClick={() => void run()}
        className="h-9 rounded-lg border-2 border-green-500 bg-green-100 px-3 text-[13px] font-semibold text-green-700 hover:bg-green-200 disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-900"
      >
        Accept all
      </button>
    </span>
  );
}

function QueueGrid({ orqspaceId, queue, search, page, onPage, onOpen }: { orqspaceId: string; queue: OrderQueue; search: string; page: number; onPage: (p: number) => void; onOpen: (id: string) => void }) {
  const filter = useMemo(() => ({ orqspaceId, queue, search: search || undefined, page, pageSize: PAGE_SIZE }), [orqspaceId, queue, search, page]);
  const list = useOrqspaceOrders(filter);
  const total = list.data?.total ?? 0;
  const last = Math.max(1, Math.ceil(total / PAGE_SIZE));
  if (list.error) return <p className="rounded-xl bg-red-50 px-4 py-3 text-[13px] text-red-700">{gqlErrorMessage(list.error)}</p>;
  if (!list.isLoading && total === 0) {
    return (
      <div className="rounded-2xl bg-white p-10 text-center shadow-sm">
        <p className="text-[16px] font-semibold">{search ? 'No matching orders' : 'Nothing here right now'}</p>
        <p className="mt-1 text-[13px] text-gray-500">{search ? 'Try an order number, customer name or phone.' : 'Orders move into this tab as their status changes.'}</p>
      </div>
    );
  }
  return (
    <>
      <CardGrid orders={list.data?.items ?? []} loading={list.isLoading} orqspaceId={orqspaceId} onOpen={onOpen} />
      {total > PAGE_SIZE && (
        <div className="mt-5 flex items-center justify-end gap-2 text-[12.5px] text-gray-600">
          <span className="tabular-nums">
            {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} of {total}
          </span>
          <PagerButton label="Previous page" disabled={page <= 1} onClick={() => onPage(page - 1)}>
            <ChevronLeft className="size-4" />
          </PagerButton>
          <PagerButton label="Next page" disabled={page >= last} onClick={() => onPage(page + 1)}>
            <ChevronRight className="size-4" />
          </PagerButton>
        </div>
      )}
    </>
  );
}

function PagerButton({ label, disabled, onClick, children }: { label: string; disabled: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="flex size-9 items-center justify-center rounded-lg bg-white shadow-sm hover:bg-gray-50 disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-gray-900"
    >
      {children}
    </button>
  );
}
