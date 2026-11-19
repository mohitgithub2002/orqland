'use client';

import { Building2, CircleUser, Home, LifeBuoy, LocateFixed, LocateOff, Package, Wallet } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ErrorNote } from '@/components/ui/panel';
import { Skeleton } from '@/components/ui/skeleton';
import { StatusDot } from '@/components/ui/status-dot';
import { gqlErrorMessage } from '@/features/dashboard/common/utils/gqlError';
import { AVAILABILITY, metaOf } from '@/features/dashboard/common/utils/status';
import { cn } from '@/lib/utils';
import { useLocationTracking, type Tracking } from '../hooks/useLocationTracking';
import { useRunHome } from '../hooks/useRun';
import type { RunHome } from '../types/run.types';
import { DeliveriesView } from './DeliveriesView';
import { EarningsView } from './EarningsView';
import { HelpView } from './HelpView';
import { NotificationsButton } from './NotificationsButton';
import { ProfileView } from './ProfileView';
import { RunHomeView } from './RunHomeView';
import { WorkspacesView } from './WorkspacesView';

const TABS = [
  { key: 'home', label: 'Home', icon: Home },
  { key: 'deliveries', label: 'Deliveries', icon: Package },
  { key: 'earnings', label: 'Earnings', icon: Wallet },
  { key: 'workspaces', label: 'Workspaces', icon: Building2 },
  { key: 'profile', label: 'Profile', icon: CircleUser },
  { key: 'help', label: 'Help', icon: LifeBuoy },
] as const;
export type RunTab = (typeof TABS)[number]['key'];
export type RunNavigate = (tab: RunTab, params?: Record<string, string>) => void;

export interface RunViewProps {
  home: RunHome;
  tracking: Tracking;
  go: RunNavigate;
}

/**
 * Orqland Run — a phone-first app frame: identity + availability + GPS state on top, six screens behind a
 * thumb-reachable bottom bar (guide §5, screens 1–6). Location is shared only while online or delivering.
 */
export function RunShell() {
  const params = useSearchParams();
  const router = useRouter();
  const tab = (TABS.some((t) => t.key === params.get('tab')) ? params.get('tab') : 'home') as RunTab;
  const home = useRunHome(true);
  const working = !!home.data && (home.data.profile.availability !== 'OFFLINE' || home.data.activeTasks.length > 0);
  const tracking = useLocationTracking(working);
  const go: RunNavigate = (key, extra = {}) => {
    const q = new URLSearchParams({ tab: key, ...extra });
    router.replace(`?${q.toString()}`, { scroll: false });
    window.scrollTo({ top: 0 });
  };

  const p = home.data?.profile;
  const av = metaOf(AVAILABILITY, p?.availability);
  const initials = (p?.displayName ?? '?')
    .split(' ')
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <div className="mx-auto flex min-h-[calc(100dvh-56px)] w-full max-w-[460px] flex-col bg-background md:min-h-[760px] md:rounded-[28px] md:border md:border-border md:shadow-sm">
      <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-border bg-background/95 px-4 py-3 backdrop-blur md:rounded-t-[28px]">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-foreground text-[13px] font-semibold text-background" aria-hidden>
          {initials}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[14px] font-semibold leading-tight">{p?.displayName ?? 'Orqland Run'}</p>
          <p className="flex items-center gap-2 text-[11.5px] text-muted-foreground">
            <span className="font-mono">{p?.orqUserId}</span>
            {p && <StatusDot tone={p.agentStatus === 'ACTIVE' ? av.tone : 'critical'} label={p.agentStatus === 'ACTIVE' ? av.label : p.agentStatus === 'SUSPENDED' ? 'Suspended' : 'KYC blocked'} />}
          </p>
        </div>
        <GpsChip tracking={tracking} onClick={() => go('profile', { section: 'location' })} />
        <NotificationsButton />
      </header>

      <main className="flex-1 px-4 pb-28 pt-4">
        {home.isError ? (
          <ErrorNote message={gqlErrorMessage(home.error)} onRetry={() => void home.refetch()} />
        ) : !home.data ? (
          <div className="space-y-3">
            <Skeleton className="h-28 w-full rounded-2xl" />
            <Skeleton className="h-48 w-full rounded-2xl" />
          </div>
        ) : (
          <>
            {tab === 'home' && <RunHomeView home={home.data} tracking={tracking} go={go} />}
            {tab === 'deliveries' && <DeliveriesView home={home.data} tracking={tracking} go={go} />}
            {tab === 'earnings' && <EarningsView home={home.data} tracking={tracking} go={go} />}
            {tab === 'workspaces' && <WorkspacesView home={home.data} tracking={tracking} go={go} />}
            {tab === 'profile' && <ProfileView home={home.data} tracking={tracking} go={go} />}
            {tab === 'help' && <HelpView home={home.data} tracking={tracking} go={go} />}
          </>
        )}
      </main>

      <nav aria-label="Orqland Run" className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:sticky md:rounded-b-[28px]">
        <div className="mx-auto grid max-w-[460px] grid-cols-6">
          {TABS.map((t) => {
            const active = tab === t.key;
            const badge = t.key === 'deliveries' ? (home.data?.openOffers.length ?? 0) : t.key === 'workspaces' ? (home.data?.invitations.length ?? 0) : 0;
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => go(t.key)}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'relative flex min-h-[56px] flex-col items-center justify-center gap-0.5 text-[10.5px] focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-foreground',
                  active ? 'font-semibold text-foreground' : 'text-muted-foreground',
                )}
              >
                {active && <span aria-hidden className="absolute inset-x-4 top-0 h-0.5 rounded-full bg-foreground" />}
                <t.icon className="size-5" strokeWidth={active ? 2.25 : 1.75} />
                {t.label}
                {badge > 0 && (
                  <span className="absolute right-[18%] top-1.5 min-w-4 rounded-full bg-foreground px-1 text-[10px] font-semibold leading-4 text-background">
                    {badge}
                    <span className="sr-only"> pending</span>
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}

function GpsChip({ tracking, onClick }: { tracking: Tracking; onClick: () => void }) {
  const label =
    tracking.state === 'active' ? 'GPS on' : tracking.state === 'starting' ? 'GPS…' : tracking.state === 'denied' ? 'GPS blocked' : tracking.state === 'unavailable' ? 'No GPS' : 'GPS off';
  const problem = tracking.state === 'denied' || tracking.state === 'unavailable';
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`Location sharing: ${label}`}
      className={cn('inline-flex h-8 items-center gap-1 rounded-full border px-2.5 text-[11px] font-medium', problem ? 'border-destructive/50 text-destructive' : 'border-border text-foreground')}
    >
      {tracking.state === 'active' ? <LocateFixed className="size-3.5" /> : <LocateOff className="size-3.5" />}
      {label}
    </button>
  );
}
