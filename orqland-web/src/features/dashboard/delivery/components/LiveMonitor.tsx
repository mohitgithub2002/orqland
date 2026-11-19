'use client';

import { AlertTriangle, Phone } from 'lucide-react';
import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { UnderlineTabs } from '@/components/ui/underline-tabs';
import { MapView, type MapPoint } from '@/components/ui/map-view';
import { EmptyState, ErrorNote, Panel, SectionLabel } from '@/components/ui/panel';
import { Skeleton } from '@/components/ui/skeleton';
import { StatusDot } from '@/components/ui/status-dot';
import { Timeline, type TimelineItem } from '@/components/ui/timeline';
import { ProtectedFileLink } from '@/features/dashboard/common/components/ProtectedFileLink';
import { useNow } from '@/features/dashboard/common/hooks/useNow';
import { formatAddress, formatDateTime, formatKm, formatMinutes, formatMoney, minutesSince, timeAgo } from '@/features/dashboard/common/utils/format';
import { gqlErrorMessage } from '@/features/dashboard/common/utils/gqlError';
import { metaOf, TASK_STATUS } from '@/features/dashboard/common/utils/status';
import { cn } from '@/lib/utils';
import { useDeliveryTask, useDeliveryTasks, useLiveDeliveries, useTaskTrace } from '../hooks/useDelivery';
import { TERMINAL, type DeliveryTask } from '../types/delivery.types';
import { OfferCountdown } from './OfferCountdown';
import { TaskActions } from './TaskActions';

const STALE_MINUTES = 2;

/** Live delivery monitoring (guide §7): active list, map of agents/pickup/drop-offs, timeline details. */
export function LiveMonitor({ orqspaceId, selectedId, onSelect }: { orqspaceId: string; selectedId: string | null; onSelect: (id: string | null) => void }) {
  const [view, setView] = useState<'active' | 'history'>('active');
  const [search, setSearch] = useState('');
  const live = useLiveDeliveries(orqspaceId);
  const history = useDeliveryTasks(view === 'history' ? orqspaceId : null, TERMINAL, search.trim(), 1);
  const now = useNow(10_000);
  const selected = useDeliveryTask(selectedId || null);
  const trace = useTaskTrace(selectedId || null);

  if (live.isError) return <ErrorNote message={gqlErrorMessage(live.error)} onRetry={() => void live.refetch()} />;
  if (!live.data) return <Skeleton className="h-[560px] w-full" />;
  const tasks = live.data;
  const focus = selected.data && selectedId ? selected.data : null;

  const points: MapPoint[] = focus ? pointsFor(focus, now, true) : tasks.flatMap((t) => pointsFor(t, now, false));
  const dedup = [...new Map(points.map((p) => [p.id, p])).values()];

  return (
    <div className="grid gap-5 lg:grid-cols-[360px_minmax(0,1fr)]">
      <Panel bodyClassName="max-h-[680px] overflow-y-auto">
        <UnderlineTabs
          label="Delivery list"
          className="px-4"
          value={view}
          onChange={setView}
          items={[
            { key: 'active', label: 'Active', count: tasks.length },
            { key: 'history', label: 'Completed & failed' },
          ]}
        />
        {view === 'history' && (
          <div className="border-b border-border p-3">
            <Input aria-label="Search deliveries" placeholder="Search task or order number" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
        )}
        {view === 'active' ? (
          tasks.length === 0 ? (
            <EmptyState title="No active deliveries" body="Dispatched orders appear here with their agent’s live position." />
          ) : (
            <ul className="divide-y divide-border">
              {tasks.map((t) => (
                <li key={t.id}>
                  <TaskRow task={t} now={now} selected={t.id === selectedId} onClick={() => onSelect(t.id === selectedId ? null : t.id)} />
                </li>
              ))}
            </ul>
          )
        ) : !history.data ? (
          <Skeleton className="m-4 h-24" />
        ) : history.data.items.length === 0 ? (
          <EmptyState title="No finished deliveries yet" />
        ) : (
          <ul className="divide-y divide-border">
            {history.data.items.map((t) => (
              <li key={t.id}>
                <TaskRow task={t} now={now} selected={t.id === selectedId} onClick={() => onSelect(t.id === selectedId ? null : t.id)} />
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <div className="min-w-0 space-y-5">
        <MapView
          className="h-[340px] md:h-[420px]"
          ariaLabel={focus ? `Map for delivery ${focus.taskNumber}` : 'Map of active deliveries'}
          points={dedup}
          plannedRoute={focus && focus.pickupLat !== null && focus.dropoffLat !== null ? [[focus.pickupLat, focus.pickupLng!], [focus.dropoffLat, focus.dropoffLng!]] : undefined}
          trace={focus ? trace.data?.map((p) => [p.lat, p.lng] as [number, number]) : undefined}
          onSelect={(id) => {
            const taskId = id.split(':')[1];
            if (taskId) onSelect(taskId);
          }}
        />
        {focus ? <TaskDetail task={focus} now={now} traceCount={trace.data?.length ?? 0} /> : <p className="text-[12.5px] text-muted-foreground">Select a delivery to see its route, timeline and actions.</p>}
      </div>
    </div>
  );
}

function pointsFor(t: DeliveryTask, now: number, focused: boolean): MapPoint[] {
  const out: MapPoint[] = [];
  if (t.pickupLat !== null && t.pickupLng !== null) out.push({ id: `pickup:${focused ? t.id : 'ws'}`, lat: t.pickupLat, lng: t.pickupLng, kind: 'pickup', label: 'Pickup' });
  if (t.dropoffLat !== null && t.dropoffLng !== null) out.push({ id: `drop:${t.id}`, lat: t.dropoffLat, lng: t.dropoffLng, kind: 'dropoff', label: `${t.taskNumber} · ${t.dropoffArea ?? 'Drop-off'}`, selected: focused });
  const a = t.agent;
  if (!TERMINAL.includes(t.status) && a?.lastLat !== null && a?.lastLat !== undefined && a.lastLng !== null) {
    const stale = (minutesSince(a.lastLocationAt, now) ?? 99) > STALE_MINUTES;
    out.push({ id: `agent:${t.id}`, lat: a.lastLat, lng: a.lastLng, kind: stale ? 'agent-stale' : 'agent', label: `${a.displayName} · ${timeAgo(a.lastLocationAt)}` });
  }
  return out;
}

function TaskRow({ task: t, now, selected, onClick }: { task: DeliveryTask; now: number; selected: boolean; onClick: () => void }) {
  const st = metaOf(TASK_STATUS, t.status);
  const since = t.pickedUpAt ?? t.acceptedAt ?? t.createdAt;
  const finished = TERMINAL.includes(t.status);
  const stale = t.agent?.lastLocationAt ? (minutesSince(t.agent.lastLocationAt, now) ?? 0) > STALE_MINUTES : true;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={cn('grid w-full grid-cols-[1fr_auto] gap-x-3 gap-y-1 px-4 py-3 text-left transition-colors hover:bg-muted/60', selected && 'bg-muted')}
    >
      <span className="flex min-w-0 items-center gap-2">
        <StatusDot tone={t.needsAttention ? 'critical' : st.tone} />
        <span className="truncate text-[13px] font-semibold">{t.taskNumber}</span>
        {t.needsAttention && <AlertTriangle aria-label="Needs attention" className="size-3.5 shrink-0" />}
      </span>
      <span className="tabular text-right text-[12px] text-muted-foreground">{finished ? formatDateTime(t.deliveredAt ?? t.updatedAt) : formatMinutes(minutesSince(since, now))}</span>
      <span className="col-span-2 truncate text-[12.5px] text-muted-foreground">
        {st.label}
        {t.mode === 'SELF' ? ' · own staff' : t.agent ? ` · ${t.agent.displayName}` : ''}
        {t.dropoffArea ? ` · ${t.dropoffArea}` : ''}
      </span>
      {t.needsAttention && t.attentionReason && <span className="col-span-2 text-[12px] text-foreground">{t.attentionReason}</span>}
      {t.mode === 'AGENT' && t.agent && ['ACCEPTED', 'ARRIVING_AT_PICKUP', 'PICKED_UP', 'IN_TRANSIT'].includes(t.status) && (
        <span className="col-span-2 text-[11.5px] text-muted-foreground">
          <StatusDot tone={stale ? 'warning' : 'good'} label={stale ? `Location stale · ${timeAgo(t.agent.lastLocationAt)}` : `Location ${timeAgo(t.agent.lastLocationAt)}`} />
        </span>
      )}
    </button>
  );
}

const EVENT_TITLE: Record<string, string> = {
  PENDING_ASSIGNMENT: 'Waiting for an agent',
  OFFERED: 'Offered to agent',
  ACCEPTED: 'Accepted by agent',
  ARRIVING_AT_PICKUP: 'Arriving at pickup',
  PICKED_UP: 'Picked up',
  IN_TRANSIT: 'In transit',
  DELIVERED: 'Delivered',
  FAILED: 'Delivery failed',
  CANCELLED: 'Cancelled',
  RETURNED_TO_ORIGIN: 'Returned to workspace',
};

function TaskDetail({ task: t, now, traceCount }: { task: DeliveryTask; now: number; traceCount: number }) {
  const st = metaOf(TASK_STATUS, t.status);
  const events: TimelineItem[] = (t.events ?? []).map((e, i, all) => ({
    id: e.id,
    title: (
      <>
        {EVENT_TITLE[e.toStatus] ?? e.toStatus}
        {e.isOverride && <span className="ml-1.5 rounded border border-border px-1 text-[10.5px] font-medium uppercase tracking-wide">override</span>}
      </>
    ),
    meta: [e.actorName ?? e.actorRole.toLowerCase(), e.reason].filter(Boolean).join(' · '),
    time: formatDateTime(e.createdAt),
    state: ['FAILED', 'CANCELLED'].includes(e.toStatus) ? 'problem' : i === all.length - 1 ? 'current' : 'done',
  }));

  return (
    <Panel
      title={
        <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
          {t.taskNumber}
          <span className="font-mono text-[11.5px] font-normal text-muted-foreground">order {t.orderNumber}</span>
          <StatusDot tone={st.tone} label={st.label} className="text-[12px] font-normal" />
        </span>
      }
      description={t.needsAttention ? t.attentionReason : `Attempt ${t.attemptNo} · ${t.mode === 'SELF' ? 'self-delivery' : t.assignmentType === 'AUTO' ? 'automatic assignment' : 'manual assignment'}`}
      bodyClassName="grid gap-5 p-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]"
    >
      <div className="space-y-4">
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-[13px]">
          <Fact label="Agent">
            {t.mode === 'SELF' ? (t.selfStaffName ?? 'Own staff') : t.agent ? (
              <>
                {t.agent.displayName}
                <span className="block font-mono text-[11px] text-muted-foreground">{t.agent.orqUserId} · {t.agent.vehicleNumberMasked}</span>
              </>
            ) : (
              'Not assigned'
            )}
          </Fact>
          <Fact label="Last location">
            {t.agent?.lastLocationAt ? (
              <StatusDot tone={(minutesSince(t.agent.lastLocationAt, now) ?? 99) > STALE_MINUTES ? 'warning' : 'good'} label={timeAgo(t.agent.lastLocationAt)} />
            ) : (
              '—'
            )}
          </Fact>
          <Fact label="Distance">
            {formatKm(t.estimatedDistanceKm)} est.
            <span className="block text-[11.5px] text-muted-foreground">{t.measuredDistanceKm ? `${formatKm(t.measuredDistanceKm)} GPS` : `${traceCount} GPS points`}</span>
          </Fact>
          <Fact label="Rate (snapshot)">{t.ratePerKmSnapshot ? `${formatMoney(t.ratePerKmSnapshot)}/km` : '—'}</Fact>
          <Fact label="COD">{Number(t.codAmount) > 0 ? formatMoney(t.codAmount) : 'Prepaid'}</Fact>
          <Fact label="Proof">{t.requiresOtp ? 'Customer OTP' : 'Recipient name'}</Fact>
          <Fact label="Duration">{formatMinutes(minutesSince(t.createdAt, t.deliveredAt ? new Date(t.deliveredAt).getTime() : now))}</Fact>
          {t.currentOffer && (
            <Fact label="Open offer">
              {t.currentOffer.agentName} · <OfferCountdown expiresAt={t.currentOffer.expiresAt} />
            </Fact>
          )}
        </dl>
        <div className="grid gap-3 text-[13px] sm:grid-cols-2">
          <div>
            <SectionLabel>Pickup</SectionLabel>
            <p className="mt-1">{formatAddress(t.pickupSnapshot)}</p>
          </div>
          <div>
            <SectionLabel>Drop-off</SectionLabel>
            <p className="mt-1">{t.dropoffSnapshot ? formatAddress(t.dropoffSnapshot) : t.dropoffArea}</p>
            {t.dropoffSnapshot?.recipientName && (
              <p className="mt-0.5 flex items-center gap-1 text-[12px] text-muted-foreground">
                <Phone className="size-3" /> {t.dropoffSnapshot.recipientName} · {t.dropoffSnapshot.recipientPhone}
              </p>
            )}
          </div>
        </div>
        {t.podFileId && <ProtectedFileLink fileId={t.podFileId} label="Proof-of-delivery photo" />}
        {t.failureReason && <ErrorNote message={`Failed: ${t.failureReason}`} />}
        <TaskActions task={t} />
      </div>
      <div>
        <SectionLabel className="mb-3">Timeline</SectionLabel>
        {events.length ? <Timeline items={events} dense /> : <p className="text-[12.5px] text-muted-foreground">No events yet.</p>}
        {!!t.offers?.length && (
          <div className="mt-4">
            <SectionLabel className="mb-2">Offers</SectionLabel>
            <ul className="space-y-1 text-[12.5px]">
              {t.offers.map((o) => (
                <li key={o.id} className="flex justify-between gap-2">
                  <span>
                    {o.agentName} · {o.assignmentType === 'AUTO' ? 'auto' : 'manual'}
                    {o.declineReason ? ` · “${o.declineReason}”` : ''}
                  </span>
                  <span className="text-muted-foreground">{o.status.toLowerCase()}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Panel>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[10.5px] font-medium uppercase tracking-[0.08em] text-muted-foreground">{label}</dt>
      <dd className="mt-0.5">{children}</dd>
    </div>
  );
}
