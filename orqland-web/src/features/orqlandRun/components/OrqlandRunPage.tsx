'use client';

import '@/styles/ops-theme.css';
import { Bike } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { ErrorNote } from '@/components/ui/panel';
import { Skeleton } from '@/components/ui/skeleton';
import { gqlErrorMessage } from '@/features/dashboard/common/utils/gqlError';
import { useMyAgentProfile } from '../hooks/useRun';
import { ApplicationStatus } from './ApplicationStatus';
import { RegistrationWizard } from './RegistrationWizard';
import { RunShell } from './RunShell';

/**
 * Orqland Run entry in the account centre (guide p.7): the "Delivery Executive — Register" card for
 * non-agents, the application status while verification runs, and the Run app once verified.
 */
export function OrqlandRunPage() {
  const profile = useMyAgentProfile();
  const [registering, setRegistering] = useState(false);
  const p = profile.data;
  const runAccess = p && ['ACTIVE', 'KYC_BLOCKED', 'SUSPENDED'].includes(p.agentStatus);

  return (
    <div className="ops-theme">
      {!runAccess && <h1 className="mb-4 hidden text-2xl font-semibold tracking-tight md:block">Orqland Run</h1>}
      {profile.isLoading ? (
        <Skeleton className="mx-auto h-64 w-full max-w-[460px]" />
      ) : profile.error ? (
        <ErrorNote message={gqlErrorMessage(profile.error)} onRetry={() => void profile.refetch()} />
      ) : registering ? (
        <RegistrationWizard onCancel={() => setRegistering(false)} onDone={() => setRegistering(false)} />
      ) : !p ? (
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-border bg-card p-5">
          <div className="flex items-start gap-3">
            <span className="flex size-10 items-center justify-center rounded-full bg-foreground text-background">
              <Bike className="size-5" />
            </span>
            <div>
              <p className="text-[15px] font-semibold">Delivery Executive</p>
              <p className="text-[13px] text-muted-foreground">Register, go active, and start delivering orders to nearby workspaces.</p>
              <p className="mt-1 text-[12px] text-muted-foreground">You’ll need your driving licence (front and back photo) and vehicle registration number.</p>
            </div>
          </div>
          <Button onClick={() => setRegistering(true)}>Register</Button>
        </div>
      ) : runAccess ? (
        <RunShell />
      ) : (
        <ApplicationStatus profile={p} onReapply={() => setRegistering(true)} />
      )}
    </div>
  );
}
