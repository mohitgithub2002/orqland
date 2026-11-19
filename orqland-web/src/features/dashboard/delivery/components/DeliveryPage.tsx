'use client';

import '@/styles/ops-theme.css';
import { RefreshCw } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/panel';
import { StatusDot } from '@/components/ui/status-dot';
import { UnderlineTabs } from '@/components/ui/underline-tabs';
import { useActiveOrqspaceId } from '@/features/dashboard/common/hooks/useActiveOrqspaceId';
import { useNow } from '@/features/dashboard/common/hooks/useNow';
import { formatAddress } from '@/features/dashboard/common/utils/format';
import { NotificationsButton } from '@/features/orqlandRun/components/NotificationsButton';
import { useDeliveryOperations, useDeliverySettings, useLiveDeliveries } from '../hooks/useDelivery';
import { AgentsView } from './AgentsView';
import { AssignmentView } from './AssignmentView';
import { CodView } from './CodView';
import { CostsView } from './CostsView';
import { LiveMonitor } from './LiveMonitor';
import { OverviewView } from './OverviewView';
import { SettingsView } from './SettingsView';

const TABS = ['overview', 'live', 'assign', 'agents', 'cod', 'costs', 'settings'] as const;
export type DeliveryTab = (typeof TABS)[number];

/**
 * Workspace delivery operations console (guide §6–§9, §11): overview & order queue, live monitoring,
 * manual/automatic assignment, agent directory & connections, COD reconciliation, costs & statements.
 */
export function DeliveryPage() {
  const orqspaceId = useActiveOrqspaceId();
  const params = useSearchParams();
  const router = useRouter();
  const initial = (TABS as readonly string[]).includes(params.get('tab') ?? '') ? (params.get('tab') as DeliveryTab) : 'overview';
  const [tab, setTab] = useState<DeliveryTab>(initial);
  const [taskId, setTaskId] = useState<string | null>(params.get('task'));
  const ops = useDeliveryOperations(orqspaceId);
  const live = useLiveDeliveries(orqspaceId);
  const settings = useDeliverySettings(orqspaceId);
  const now = useNow(5_000);

  useEffect(() => {
    const t = params.get('task');
    if (t) {
      setTaskId(t);
      setTab('live');
    }
  }, [params]);

  if (!orqspaceId) return <EmptyState title="Open a workspace" body="Delivery operations are managed per workspace." />;

  const go = (key: DeliveryTab, task?: string) => {
    setTab(key);
    if (task !== undefined) setTaskId(task);
    router.replace(`?tab=${key}${task ? `&task=${task}` : ''}`, { scroll: false });
  };
  const o = ops.data;
  const s = settings.data;
  const updatedSeconds = ops.dataUpdatedAt ? Math.max(0, Math.round((now - ops.dataUpdatedAt) / 1000)) : null;
  const awaiting = o ? o.queue.readyForFulfilment + o.deliveries.unassigned : null;

  return (
    <div className="ops-theme -m-4 min-h-[calc(100vh-68px)] bg-background p-4 md:-m-6 md:p-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-[22px] font-semibold tracking-tight">Delivery operations</h1>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px] text-muted-foreground">
            <span>Pickup: {s?.pickupAddress ? formatAddress(s.pickupAddress) : 'not set'}</span>
            <span aria-hidden>·</span>
            <span>{s ? (s.autoAssignEnabled ? `Auto-assign on (${s.assignmentStrategy.toLowerCase().replace('_', ' ')})` : 'Manual assignment') : '—'}</span>
            <span aria-hidden>·</span>
            <span>{o?.timezone ?? s?.timezone ?? ''}</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[12px] text-muted-foreground" aria-live="polite">
            {ops.isError ? (
              <StatusDot tone="critical" label="Live data unavailable" />
            ) : (
              <StatusDot tone="live" label={updatedSeconds === null ? 'Connecting…' : `Live · updated ${updatedSeconds}s ago`} />
            )}
          </span>
          <NotificationsButton />
          <Button variant="outline" size="sm" onClick={() => void Promise.all([ops.refetch(), live.refetch(), settings.refetch()])} aria-label="Refresh">
            <RefreshCw className={ops.isFetching ? 'animate-spin' : undefined} />
          </Button>
        </div>
      </header>

      <UnderlineTabs
        label="Delivery sections"
        className="mt-4"
        value={tab}
        onChange={(k) => go(k)}
        items={[
          { key: 'overview', label: 'Overview' },
          { key: 'live', label: 'Live map', count: live.data?.length ?? null },
          { key: 'assign', label: 'Assignment', count: awaiting },
          { key: 'agents', label: 'Agents', count: null },
          { key: 'cod', label: 'COD', count: o?.cod.discrepancies || null },
          { key: 'costs', label: 'Costs & statements' },
          { key: 'settings', label: 'Settings' },
        ]}
      />

      <div className="mt-5" role="tabpanel" aria-labelledby={`tab-${tab}`}>
        {tab === 'overview' && <OverviewView orqspaceId={orqspaceId} onOpenTask={(id) => go('live', id)} onGo={go} />}
        {tab === 'live' && <LiveMonitor orqspaceId={orqspaceId} selectedId={taskId} onSelect={(id) => go('live', id ?? '')} />}
        {tab === 'assign' && <AssignmentView orqspaceId={orqspaceId} onOpenTask={(id) => go('live', id)} />}
        {tab === 'agents' && <AgentsView orqspaceId={orqspaceId} />}
        {tab === 'cod' && <CodView orqspaceId={orqspaceId} />}
        {tab === 'costs' && <CostsView orqspaceId={orqspaceId} />}
        {tab === 'settings' && <SettingsView orqspaceId={orqspaceId} />}
      </div>
    </div>
  );
}
