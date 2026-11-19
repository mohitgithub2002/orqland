'use client';

import { RefreshCw } from 'lucide-react';
import { ErrorNote } from '@/components/ui/panel';
import { StatusDot } from '@/components/ui/status-dot';
import { Timeline, type TimelineItem } from '@/components/ui/timeline';
import { gqlErrorMessage } from '@/features/dashboard/common/utils/gqlError';
import { KYC_CHECK, metaOf } from '@/features/dashboard/common/utils/status';
import { useRunAction } from '../hooks/useRun';
import type { AgentProfile } from '../types/run.types';
import { BigAction, RunCard } from './RunPrimitives';

const TITLES: Record<string, { title: string; body: (p: AgentProfile) => string }> = {
  PENDING_VERIFICATION: { title: 'Verification pending', body: (p) => p.lastFailureReason ?? 'The verification service did not answer yet. Retry in a few minutes.' },
  MANUAL_REVIEW: { title: 'Under review', body: (p) => p.lastFailureReason ?? 'Our team is checking your documents. You’ll be notified when it’s done.' },
  REJECTED: { title: 'Verification failed', body: (p) => p.lastFailureReason ?? 'Your documents could not be verified.' },
  DEACTIVATED: { title: 'Delivery account deactivated', body: () => 'Contact support to reactivate it.' },
};

/** Application status with a timeline of the checks. The normal Orqland account is unaffected in every case. */
export function ApplicationStatus({ profile: p, onReapply }: { profile: AgentProfile; onReapply: () => void }) {
  const reverify = useRunAction('reverify');
  const config = TITLES[p.agentStatus];
  if (!config) return null;
  const failed = [p.licenceStatus !== 'VERIFIED' && 'DRIVING_LICENCE', p.vehicleStatus !== 'VERIFIED' && 'VEHICLE_RC'].filter(Boolean) as string[];
  const licence = metaOf(KYC_CHECK, p.licenceStatus);
  const vehicle = metaOf(KYC_CHECK, p.vehicleStatus);
  const stateOf = (s: string): TimelineItem['state'] => (s === 'VERIFIED' ? 'done' : ['FAILED', 'EXPIRED'].includes(s) ? 'problem' : 'current');

  return (
    <div className="mx-auto w-full max-w-[460px] space-y-4">
      <RunCard className="space-y-4">
        <div>
          <StatusDot tone={p.agentStatus === 'REJECTED' ? 'critical' : 'warning'} label={config.title} className="text-[15px] font-semibold" size="md" />
          <p className="mt-1.5 text-[13px] leading-5 text-muted-foreground">{config.body(p)}</p>
        </div>
        <Timeline
          items={[
            { id: 'submitted', title: 'Application submitted', meta: 'Licence photos and vehicle details received', state: 'done' },
            { id: 'dl', title: `Driving licence ••${p.licenceNumberLast4}`, meta: licence.label, state: stateOf(p.licenceStatus) },
            { id: 'rc', title: `Vehicle ${p.vehicleNumberMasked}`, meta: vehicle.label, state: stateOf(p.vehicleStatus) },
            { id: 'role', title: 'Delivery Agent role & Orqland Run access', meta: 'Granted only when every check passes', state: 'upcoming' },
          ]}
        />
        {reverify.error && <ErrorNote message={gqlErrorMessage(reverify.error)} />}
      </RunCard>
      {p.agentStatus === 'PENDING_VERIFICATION' && (
        <BigAction disabled={reverify.isPending} onClick={() => reverify.mutate(failed.length ? failed : ['DRIVING_LICENCE', 'VEHICLE_RC'])}>
          <RefreshCw /> {reverify.isPending ? 'Checking…' : 'Retry verification'}
        </BigAction>
      )}
      {p.agentStatus === 'REJECTED' && <BigAction onClick={onReapply}>Correct details and try again</BigAction>}
    </div>
  );
}
