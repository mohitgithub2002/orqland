'use client';

import { AlertTriangle, ArrowRight, Bell, Building2, Inbox } from 'lucide-react';
import { MapView, type MapPoint } from '@/components/ui/map-view';
import { ErrorNote } from '@/components/ui/panel';
import { StatusDot } from '@/components/ui/status-dot';
import { Switch } from '@/components/ui/switch';
import { formatMoney } from '@/features/dashboard/common/utils/format';
import { gqlErrorMessage } from '@/features/dashboard/common/utils/gqlError';
import { metaOf, TASK_STATUS } from '@/features/dashboard/common/utils/status';
import type { DeliveryTask } from '@/features/dashboard/delivery/types/delivery.types';
import { cn } from '@/lib/utils';
import { useRunAction } from '../hooks/useRun';
import type { Tracking } from '../hooks/useLocationTracking';
import { NEXT_STEP, STEPS } from './ActiveJob';
import { OfferCard } from './OfferCard';
import { BigAction, Fact, RunCard, StepTracker } from './RunPrimitives';
import type { RunViewProps } from './RunShell';

/** Screen 1 — Run Home: availability, the active job and its next action, offers, today, warnings. */
export function RunHomeView({ home, tracking, go }: RunViewProps) {
  const p = home.profile;
  const active = home.activeTasks[0] ?? null;
  const todayTotal = Number(home.today.estimated) + Number(home.today.approved) + Number(home.today.paid);

  return (
    <div className="space-y-4">
      <AvailabilityCard home={home} tracking={tracking} />

      {active && <ActiveJobCard task={active} tracking={tracking} onOpen={() => go('deliveries', { view: 'active', task: active.id })} />}

      {home.openOffers.length > 0 && (
        <section aria-label="Delivery requests" className="space-y-3">
          <OfferCard offer={home.openOffers[0].offer} task={home.openOffers[0].task} onAccepted={(id) => go('deliveries', { view: 'active', task: id })} />
          {home.openOffers.length > 1 && (
            <button type="button" onClick={() => go('deliveries', { view: 'requests' })} className="flex w-full items-center justify-between rounded-xl border border-border bg-card px-4 py-3 text-[13px] font-medium">
              {home.openOffers.length - 1} more request{home.openOffers.length > 2 ? 's' : ''} <ArrowRight className="size-4" />
            </button>
          )}
        </section>
      )}

      <RunCard>
        <p className="text-[11px] font-medium uppercase tracking-[0.1em] text-muted-foreground">Today</p>
        <dl className="mt-2 grid grid-cols-3 gap-3">
          <Fact label="Delivered">{home.today.deliveries}</Fact>
          <Fact label="Distance">{Number(home.today.billableKm).toFixed(1)} km</Fact>
          <Fact label="Earned">{formatMoney(todayTotal)}</Fact>
        </dl>
        <button type="button" onClick={() => go('earnings')} className="mt-3 inline-flex items-center gap-1 text-[12.5px] underline underline-offset-2">
          Earnings & statements <ArrowRight className="size-3.5" />
        </button>
      </RunCard>

      {(p.kycAlerts.length > 0 || !p.eligibleForAssignments || home.invitations.length > 0 || home.unreadNotifications > 0) && (
        <RunCard className="space-y-0 p-0">
          <p className="px-4 pt-3 text-[11px] font-medium uppercase tracking-[0.1em] text-muted-foreground">Needs your attention</p>
          <ul className="divide-y divide-border">
            {p.kycAlerts.map((a) => (
              <AttentionRow key={a} icon={AlertTriangle} text={a} action="Re-verify" onClick={() => go('profile', { section: 'verification' })} />
            ))}
            {!p.eligibleForAssignments && p.kycAlerts.length === 0 && (
              <AttentionRow icon={AlertTriangle} text={p.suspendedReason ?? p.lastFailureReason ?? 'You cannot receive new deliveries right now.'} action="Details" onClick={() => go('profile', { section: 'verification' })} />
            )}
            {home.invitations.length > 0 && (
              <AttentionRow icon={Inbox} text={`${home.invitations.length} workspace invitation${home.invitations.length > 1 ? 's' : ''} waiting`} action="Review" onClick={() => go('workspaces')} />
            )}
            {home.unreadNotifications > 0 && <AttentionRow icon={Bell} text={`${home.unreadNotifications} unread notification${home.unreadNotifications > 1 ? 's' : ''}`} action="Open" onClick={() => go('help')} />}
          </ul>
        </RunCard>
      )}

      <RunCard>
        <div className="flex items-center justify-between">
          <p className="text-[11px] font-medium uppercase tracking-[0.1em] text-muted-foreground">
            Workspaces · {home.connections.length}/{home.connectionLimit}
          </p>
          <button type="button" onClick={() => go('workspaces')} className="text-[12.5px] underline underline-offset-2">
            Manage
          </button>
        </div>
        {home.connections.length === 0 ? (
          <p className="mt-2 text-[13px] text-muted-foreground">You’re not connected to any workspace yet. Share your Orq ID ({p.orqUserId}) with a workspace so they can invite you — you only receive their deliveries.</p>
        ) : (
          <ul className="mt-2 space-y-1.5">
            {home.connections.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-3 text-[13px]">
                <span className="flex min-w-0 items-center gap-2">
                  <Building2 className="size-4 shrink-0 text-muted-foreground" />
                  <span className="truncate font-medium">{c.orqspaceName}</span>
                  {c.disconnectRequestStatus === 'REQUESTED' && <StatusDot tone="warning" label="leaving" className="text-[11px] text-muted-foreground" />}
                </span>
                <span className="tabular shrink-0 text-muted-foreground">{formatMoney(c.currentRatePerKm)}/km</span>
              </li>
            ))}
          </ul>
        )}
      </RunCard>

      {!active && home.openOffers.length === 0 && p.availability !== 'OFFLINE' && (
        <p className="px-2 text-center text-[13px] text-muted-foreground">No deliveries right now. Stay online — new requests from your workspaces appear here instantly.</p>
      )}
    </div>
  );
}

function AttentionRow({ icon: Icon, text, action, onClick }: { icon: React.ComponentType<{ className?: string }>; text: string; action: string; onClick: () => void }) {
  return (
    <li>
      <button type="button" onClick={onClick} className="flex w-full items-center gap-3 px-4 py-3 text-left text-[13px] hover:bg-muted/60">
        <Icon className="size-4 shrink-0" />
        <span className="min-w-0 flex-1">{text}</span>
        <span className="shrink-0 text-[12px] font-medium underline underline-offset-2">{action}</span>
      </button>
    </li>
  );
}

/** The prominent ONLINE / OFFLINE control (guide Screen 1), with the reason when it is unavailable. */
function AvailabilityCard({ home, tracking }: { home: RunViewProps['home']; tracking: Tracking }) {
  const p = home.profile;
  const setAvailability = useRunAction('setAvailability');
  const online = p.availability !== 'OFFLINE';
  const blocked = !p.eligibleForAssignments && !online;
  const busy = p.availability === 'BUSY';
  const subtitle = busy
    ? 'On a delivery — new offers wait until you have capacity'
    : online
      ? home.connections.length
        ? `Receiving offers from ${home.connections.length} workspace${home.connections.length > 1 ? 's' : ''}`
        : 'Online, but not connected to any workspace yet'
      : blocked
        ? (p.kycAlerts[0] ?? p.suspendedReason ?? 'Verification needs attention before you can go online')
        : 'Go online to receive delivery requests';

  return (
    <RunCard className={cn('transition-colors', online ? 'border-foreground bg-foreground text-background' : '')}>
      <div className="flex items-center gap-4">
        <div className="min-w-0 flex-1">
          <p className={cn('text-[11px] font-medium uppercase tracking-[0.1em]', online ? 'text-background/60' : 'text-muted-foreground')}>Availability</p>
          <p className="mt-0.5 flex items-center gap-2 text-[22px] font-semibold tracking-tight">
            <span className={cn('relative inline-flex size-3 rounded-full', online ? 'bg-success' : 'bg-muted-foreground/50')} aria-hidden>
              {online && <span className="ops-ping absolute inset-0 rounded-full bg-success" />}
            </span>
            {busy ? 'On a delivery' : online ? 'You’re online' : 'You’re offline'}
          </p>
          <p className={cn('mt-0.5 text-[12.5px] leading-5', online ? 'text-background/75' : 'text-muted-foreground')}>{subtitle}</p>
        </div>
        <Switch
          aria-label={online ? 'Go offline' : 'Go online'}
          checked={online}
          disabled={setAvailability.isPending || blocked || busy}
          onCheckedChange={(next) => setAvailability.mutate(next ? 'ONLINE' : 'OFFLINE')}
          className={cn('h-8 w-14 [&>span]:size-7 [&>span]:data-[state=checked]:translate-x-6', online && 'data-[state=checked]:bg-success')}
        />
      </div>
      {online && tracking.state !== 'active' && (
        <p className={cn('mt-3 rounded-lg px-3 py-2 text-[12px]', 'bg-background/10')} role="status">
          {tracking.state === 'denied'
            ? 'Location permission is blocked. Workspaces can’t see you and distance-based offers may skip you. Allow location in your browser settings.'
            : tracking.state === 'unavailable'
              ? 'GPS signal unavailable. We’ll keep trying.'
              : 'Starting location sharing…'}
        </p>
      )}
      {setAvailability.error && <ErrorNote className="mt-3 bg-card text-foreground" message={gqlErrorMessage(setAvailability.error)} />}
    </RunCard>
  );
}

function ActiveJobCard({ task: t, tracking, onOpen }: { task: DeliveryTask; tracking: Tracking; onOpen: () => void }) {
  const st = metaOf(TASK_STATUS, t.status);
  const points: MapPoint[] = [];
  if (t.pickupLat !== null && t.pickupLng !== null) points.push({ id: 'p', lat: t.pickupLat, lng: t.pickupLng, kind: 'pickup', label: 'Pickup' });
  if (t.dropoffLat !== null && t.dropoffLng !== null) points.push({ id: 'd', lat: t.dropoffLat, lng: t.dropoffLng, kind: 'dropoff', label: 'Drop-off' });
  if (tracking.position) points.push({ id: 'me', lat: tracking.position.lat, lng: tracking.position.lng, kind: 'me', label: 'You' });

  return (
    <RunCard className="space-y-3 p-0">
      <MapView className="h-44 rounded-b-none rounded-t-2xl border-0" ariaLabel={`Route for ${t.taskNumber}`} interactive={false} points={points} plannedRoute={points.length >= 2 && t.pickupLat !== null && t.dropoffLat !== null ? [[t.pickupLat, t.pickupLng!], [t.dropoffLat, t.dropoffLng!]] : undefined} />
      <div className="space-y-3 px-4 pb-4">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-medium uppercase tracking-[0.1em] text-muted-foreground">Active job</p>
            <p className="truncate text-[15px] font-semibold">{t.orqspaceName}</p>
          </div>
          <StatusDot tone={st.tone} label={st.label} className="text-[12px]" />
        </div>
        <StepTracker steps={STEPS} current={t.status} />
        <BigAction onClick={onOpen}>
          {NEXT_STEP[t.status]?.label ?? 'Open job'} <ArrowRight />
        </BigAction>
      </div>
    </RunCard>
  );
}
