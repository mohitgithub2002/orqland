'use client';

import { ArrowRight, Inbox, PackageCheck } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { EmptyState, ErrorNote } from '@/components/ui/panel';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { StatusDot } from '@/components/ui/status-dot';
import { Timeline } from '@/components/ui/timeline';
import { ProtectedFileLink } from '@/features/dashboard/common/components/ProtectedFileLink';
import { formatDateTime, formatKm, formatMoney } from '@/features/dashboard/common/utils/format';
import { gqlErrorMessage } from '@/features/dashboard/common/utils/gqlError';
import { metaOf, TASK_STATUS } from '@/features/dashboard/common/utils/status';
import { cn } from '@/lib/utils';
import { useRunAction, useRunHistory, useRunTask } from '../hooks/useRun';
import { ActiveJob } from './ActiveJob';
import { OfferCard } from './OfferCard';
import { BigAction, Fact, RunCard } from './RunPrimitives';
import type { RunViewProps } from './RunShell';

type View = 'requests' | 'active' | 'history';

/** Screen 2 — Deliveries: requests (offer & acceptance), the active job workflow, and history with timelines. */
export function DeliveriesView({ home, tracking, go }: RunViewProps) {
  const params = useSearchParams();
  const fallback: View = home.activeTasks.length ? 'active' : home.openOffers.length ? 'requests' : 'history';
  const view = (['requests', 'active', 'history'].includes(params.get('view') ?? '') ? params.get('view') : fallback) as View;
  const taskParam = params.get('task');
  const active = home.activeTasks.find((t) => t.id === taskParam) ?? home.activeTasks[0] ?? null;

  return (
    <div className="space-y-4">
      <div role="tablist" aria-label="Deliveries" className="grid grid-cols-3 rounded-xl bg-muted p-1">
        {(
          [
            ['requests', `Requests${home.openOffers.length ? ` · ${home.openOffers.length}` : ''}`],
            ['active', `Active${home.activeTasks.length ? ` · ${home.activeTasks.length}` : ''}`],
            ['history', 'History'],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            role="tab"
            type="button"
            aria-selected={view === key}
            onClick={() => go('deliveries', { view: key })}
            className={cn('h-10 rounded-lg text-[13px] font-medium transition-colors', view === key ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground')}
          >
            {label}
          </button>
        ))}
      </div>

      {view === 'requests' &&
        (home.openOffers.length === 0 ? (
          <RunCard>
            <EmptyState
              icon={Inbox}
              title={home.profile.availability === 'OFFLINE' ? 'You’re offline' : 'No requests right now'}
              body={home.profile.availability === 'OFFLINE' ? 'Go online on Home to receive delivery requests from your connected workspaces.' : 'Requests only come from workspaces you are connected to.'}
            />
          </RunCard>
        ) : (
          home.openOffers.map(({ offer, task }) => <OfferCard key={offer.id} offer={offer} task={task} onAccepted={(id) => go('deliveries', { view: 'active', task: id })} />)
        ))}

      {view === 'active' &&
        (active ? (
          <>
            {home.activeTasks.length > 1 && (
              <div className="flex gap-2 overflow-x-auto">
                {home.activeTasks.map((t) => (
                  <button key={t.id} type="button" onClick={() => go('deliveries', { view: 'active', task: t.id })} className={cn('shrink-0 rounded-full border px-3 py-1.5 text-[12px]', t.id === active.id ? 'border-foreground bg-foreground text-background' : 'border-border')}>
                    {t.taskNumber}
                  </button>
                ))}
              </div>
            )}
            <ActiveJob task={active} tracking={tracking} onFinished={() => go('deliveries', { view: 'history' })} />
          </>
        ) : (
          <RunCard>
            <EmptyState icon={PackageCheck} title="No active delivery" body="Accepted deliveries appear here with the route, the next step and payment to collect." />
          </RunCard>
        ))}

      {view === 'history' && <History />}
    </div>
  );
}

function History() {
  const history = useRunHistory();
  const [openId, setOpenId] = useState<string | null>(null);
  if (history.isError) return <ErrorNote message={gqlErrorMessage(history.error)} onRetry={() => void history.refetch()} />;
  if (!history.data) return <Skeleton className="h-48 w-full rounded-2xl" />;
  if (history.data.length === 0) return <RunCard><EmptyState title="No deliveries yet" body="Completed, failed and cancelled deliveries are listed here." /></RunCard>;
  return (
    <>
      <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
        {history.data.map((t) => {
          const st = metaOf(TASK_STATUS, t.status);
          return (
            <li key={t.id}>
              <button type="button" onClick={() => setOpenId(t.id)} className="flex min-h-[64px] w-full items-center gap-3 px-4 py-3 text-left hover:bg-muted/60">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] font-medium">{t.orqspaceName}</span>
                  <span className="flex items-center gap-2 text-[12px] text-muted-foreground">
                    <StatusDot tone={st.tone} label={st.label} />
                    <span>· {formatDateTime(t.deliveredAt ?? t.updatedAt)}</span>
                  </span>
                </span>
                <span className="tabular text-right text-[13px] font-semibold">
                  {t.status === 'DELIVERED' ? formatMoney(t.estimatedEarnings) : '—'}
                  <span className="block text-[11px] font-normal text-muted-foreground">{formatKm(t.measuredDistanceKm ?? t.estimatedDistanceKm)}</span>
                </span>
                <ArrowRight className="size-4 text-muted-foreground" />
              </button>
            </li>
          );
        })}
      </ul>
      {openId && <HistoryDetail taskId={openId} onClose={() => setOpenId(null)} />}
    </>
  );
}

const EVENT_TITLE: Record<string, string> = {
  PENDING_ASSIGNMENT: 'Waiting for an agent',
  OFFERED: 'Offered to you',
  ACCEPTED: 'You accepted',
  ARRIVING_AT_PICKUP: 'On the way to pickup',
  PICKED_UP: 'Picked up',
  IN_TRANSIT: 'On the way to customer',
  DELIVERED: 'Delivered',
  FAILED: 'Delivery failed',
  CANCELLED: 'Cancelled',
  RETURNED_TO_ORIGIN: 'Returned to workspace',
};

function HistoryDetail({ taskId, onClose }: { taskId: string; onClose: () => void }) {
  const task = useRunTask(taskId);
  const returned = useRunAction('returnToOrigin');
  const t = task.data;
  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="ops-theme max-w-md">
        {!t ? (
          <div className="p-6">
            <SheetTitle className="sr-only">Loading delivery</SheetTitle>
            <Skeleton className="h-48 w-full" />
          </div>
        ) : (
          <div className="flex-1 space-y-5 overflow-y-auto p-6">
            <div className="pr-8">
              <SheetTitle className="text-lg">{t.orqspaceName}</SheetTitle>
              <SheetDescription className="font-mono">
                {t.taskNumber} · order {t.orderNumber}
              </SheetDescription>
            </div>
            <dl className="grid grid-cols-3 gap-3 rounded-xl border border-border p-3">
              <Fact label="Distance">{formatKm(t.measuredDistanceKm ?? t.estimatedDistanceKm)}</Fact>
              <Fact label="Rate">{t.ratePerKmSnapshot ? formatMoney(t.ratePerKmSnapshot) : '—'}</Fact>
              <Fact label="Earning">{t.status === 'DELIVERED' ? formatMoney(t.estimatedEarnings) : '—'}</Fact>
            </dl>
            <p className="text-[12px] text-muted-foreground">Earnings shown are estimates until the workspace approves the distance — see Earnings for the final amount.</p>
            {t.podFileId && <ProtectedFileLink fileId={t.podFileId} label="Your proof-of-delivery photo" />}
            {t.failureReason && <p className="rounded-lg bg-muted px-3 py-2 text-[13px]">Failure reason: {t.failureReason}</p>}
            <Timeline
              items={(t.events ?? []).map((e, i, all) => ({
                id: e.id,
                title: EVENT_TITLE[e.toStatus] ?? e.toStatus,
                meta: [e.actorName, e.reason].filter(Boolean).join(' · '),
                time: formatDateTime(e.createdAt),
                state: ['FAILED', 'CANCELLED'].includes(e.toStatus) ? 'problem' : i === all.length - 1 ? 'current' : 'done',
              }))}
            />
            {t.status === 'FAILED' && (
              <>
                {returned.error && <ErrorNote message={gqlErrorMessage(returned.error)} />}
                <BigAction disabled={returned.isPending} onClick={() => returned.mutate({ taskId: t.id })}>
                  I returned the parcel to the workspace
                </BigAction>
              </>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
