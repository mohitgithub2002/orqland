'use client';

import { ChevronDown } from 'lucide-react';
import { useState } from 'react';
import { EmptyState, ErrorNote } from '@/components/ui/panel';
import { Skeleton } from '@/components/ui/skeleton';
import { StatusDot } from '@/components/ui/status-dot';
import { ReasonDialog } from '@/features/dashboard/common/components/ReasonDialog';
import { formatDate, formatDateTime, formatMoney } from '@/features/dashboard/common/utils/format';
import { gqlErrorMessage } from '@/features/dashboard/common/utils/gqlError';
import { CONNECTION_STATUS, metaOf } from '@/features/dashboard/common/utils/status';
import type { AgentConnection } from '@/features/dashboard/delivery/types/delivery.types';
import { useRunAction, useRunConnections } from '../hooks/useRun';
import { BigAction, RunCard } from './RunPrimitives';
import type { RunViewProps } from './RunShell';

/** Screen 3 — Workspaces: invitations, connections with agreed rates, rate history, disconnect requests. */
export function WorkspacesView({ home }: RunViewProps) {
  const connections = useRunConnections();
  const active = connections.data?.filter((c) => c.status === 'ACTIVE') ?? [];
  const past = connections.data?.filter((c) => !['ACTIVE', 'PENDING'].includes(c.status)) ?? [];
  const full = active.length >= home.connectionLimit;
  const [showPast, setShowPast] = useState(false);

  return (
    <div className="space-y-4">
      <RunCard>
        <div className="flex items-end justify-between">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.1em] text-muted-foreground">Connected workspaces</p>
            <p className="tabular text-[28px] font-semibold leading-tight">
              {active.length}
              <span className="text-[16px] font-normal text-muted-foreground">/{home.connectionLimit}</span>
            </p>
          </div>
          <p className="max-w-[60%] text-right text-[12px] text-muted-foreground">Workspaces invite you using your Orq ID <span className="font-mono text-foreground">{home.profile.orqUserId}</span>.</p>
        </div>
        <div className="mt-3 flex gap-1" aria-hidden>
          {Array.from({ length: home.connectionLimit }, (_, i) => (
            <span key={i} className={`h-1.5 flex-1 rounded-full ${i < active.length ? 'bg-foreground' : 'bg-border'}`} />
          ))}
        </div>
      </RunCard>

      {home.invitations.length > 0 && (
        <section aria-label="Invitations" className="space-y-3">
          {home.invitations.map((c) => (
            <Invitation key={c.id} c={c} full={full} />
          ))}
        </section>
      )}

      {connections.isError ? (
        <ErrorNote message={gqlErrorMessage(connections.error)} onRetry={() => void connections.refetch()} />
      ) : !connections.data ? (
        <Skeleton className="h-40 w-full rounded-2xl" />
      ) : active.length === 0 ? (
        <RunCard>
          <EmptyState title="No connected workspaces" body="You only receive deliveries from workspaces you accept. Ask a workspace to invite your Orq ID." />
        </RunCard>
      ) : (
        active.map((c) => <Connection key={c.id} c={c} />)
      )}

      {past.length > 0 && (
        <div>
          <button type="button" aria-expanded={showPast} onClick={() => setShowPast(!showPast)} className="inline-flex items-center gap-1 text-[12.5px] text-muted-foreground">
            <ChevronDown className={`size-4 transition-transform ${showPast ? '' : '-rotate-90'}`} /> Connection history ({past.length})
          </button>
          {showPast && (
            <ul className="mt-2 divide-y divide-border rounded-2xl border border-border bg-card">
              {past.map((c) => {
                const st = metaOf(CONNECTION_STATUS, c.status);
                return (
                  <li key={c.id} className="px-4 py-3 text-[13px]">
                    <span className="flex justify-between gap-2">
                      <span className="font-medium">{c.orqspaceName}</span>
                      <StatusDot tone={st.tone} label={st.label} className="text-[11.5px]" />
                    </span>
                    <span className="block text-[12px] text-muted-foreground">
                      {formatDate(c.disconnectedAt ?? c.invitedAt)}
                      {c.disconnectReason && ` · ${c.disconnectReason}`}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function Invitation({ c, full }: { c: AgentConnection; full: boolean }) {
  const respond = useRunAction('respondInvitation');
  return (
    <RunCard className="space-y-3 border-foreground">
      <div>
        <p className="text-[11px] font-medium uppercase tracking-[0.1em] text-muted-foreground">Invitation</p>
        <p className="text-[16px] font-semibold">{c.orqspaceName}</p>
        <p className="tabular text-[13px]">
          Offers <span className="font-semibold">{formatMoney(c.currentRatePerKm)}/km</span> · expires {formatDateTime(c.inviteExpiresAt)}
        </p>
        {c.inviteMessage && <p className="mt-1 rounded-lg bg-muted px-3 py-2 text-[13px]">“{c.inviteMessage}”</p>}
      </div>
      {full && <p className="text-[12px]">You already have the maximum number of workspaces. Disconnect one to accept.</p>}
      {respond.error && <ErrorNote message={gqlErrorMessage(respond.error)} />}
      <div className="grid grid-cols-[1fr_2fr] gap-2">
        <BigAction variant="outline" disabled={respond.isPending} onClick={() => respond.mutate({ connectionId: c.id, accept: false })}>
          Decline
        </BigAction>
        <BigAction disabled={respond.isPending || full} onClick={() => respond.mutate({ connectionId: c.id, accept: true })}>
          Accept
        </BigAction>
      </div>
    </RunCard>
  );
}

function Connection({ c }: { c: AgentConnection }) {
  const disconnect = useRunAction('disconnect');
  const withdraw = useRunAction('withdrawDisconnect');
  const [open, setOpen] = useState(false);
  const [history, setHistory] = useState(false);
  const pending = c.disconnectRequestStatus === 'REQUESTED';
  const busy = c.activeTaskCount > 0;
  const effective = c.rateHistory?.[0]?.effectiveFrom ?? c.activatedAt;

  return (
    <RunCard className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-[16px] font-semibold">{c.orqspaceName}</p>
          <p className="text-[12px] text-muted-foreground">Connected since {formatDate(c.activatedAt)}</p>
        </div>
        <StatusDot tone={pending ? 'warning' : 'good'} label={pending ? 'Leaving' : 'Connected'} className="text-[12px]" />
      </div>
      <dl className="grid grid-cols-2 gap-3 border-y border-border py-3 text-[13px]">
        <div>
          <dt className="text-[10.5px] font-medium uppercase tracking-[0.08em] text-muted-foreground">Your rate</dt>
          <dd className="tabular text-[17px] font-semibold">{formatMoney(c.currentRatePerKm)}/km</dd>
          <dd className="text-[11.5px] text-muted-foreground">since {formatDate(effective)}</dd>
        </div>
        <div>
          <dt className="text-[10.5px] font-medium uppercase tracking-[0.08em] text-muted-foreground">Active deliveries</dt>
          <dd className="tabular text-[17px] font-semibold">{c.activeTaskCount}</dd>
        </div>
      </dl>
      {(c.rateHistory?.length ?? 0) > 1 && (
        <div>
          <button type="button" aria-expanded={history} onClick={() => setHistory(!history)} className="inline-flex items-center gap-1 text-[12.5px] text-muted-foreground">
            <ChevronDown className={`size-4 transition-transform ${history ? '' : '-rotate-90'}`} /> Previous rates
          </button>
          {history && (
            <ul className="mt-1 space-y-0.5 text-[12.5px]">
              {c.rateHistory!.map((r) => (
                <li key={r.id} className="tabular">
                  {formatMoney(r.ratePerKm)}/km from {formatDate(r.effectiveFrom)}
                  {r.reason && <span className="text-muted-foreground"> · {r.reason}</span>}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {pending ? (
        <div className="space-y-2 rounded-xl bg-muted p-3 text-[12.5px]">
          <p>
            Disconnection requested {formatDateTime(c.disconnectRequestedAt)} by {c.disconnectRequestedByRole === 'AGENT' ? 'you' : 'the workspace'}. No new requests from this workspace; it completes when your{' '}
            {c.activeTaskCount} active deliver{c.activeTaskCount === 1 ? 'y is' : 'ies are'} finished.
          </p>
          {c.disconnectRequestedByRole === 'AGENT' && (
            <button type="button" disabled={withdraw.isPending} className="font-medium underline underline-offset-2" onClick={() => withdraw.mutate(c.id)}>
              Withdraw request — stay connected
            </button>
          )}
          {withdraw.error && <ErrorNote message={gqlErrorMessage(withdraw.error)} />}
        </div>
      ) : (
        <button type="button" onClick={() => setOpen(true)} className="text-[12.5px] underline underline-offset-2">
          {busy ? 'Request disconnection' : 'Disconnect from this workspace'}
        </button>
      )}
      <ReasonDialog
        open={open}
        onOpenChange={setOpen}
        title={busy ? `Request disconnection from ${c.orqspaceName}` : `Disconnect from ${c.orqspaceName}?`}
        description={
          busy
            ? `You have ${c.activeTaskCount} active deliver${c.activeTaskCount === 1 ? 'y' : 'ies'} here. You’ll stop receiving new requests now and be disconnected once they are finished. Your earnings history is kept.`
            : 'You’ll stop receiving this workspace’s deliveries. Completed deliveries and earnings stay in your history.'
        }
        confirmLabel={busy ? 'Request disconnection' : 'Disconnect'}
        destructive
        pending={disconnect.isPending}
        error={disconnect.error ? gqlErrorMessage(disconnect.error) : null}
        onConfirm={(reason) => disconnect.mutate({ connectionId: c.id, reason, afterActiveDeliveries: busy }, { onSuccess: () => setOpen(false) })}
      />
    </RunCard>
  );
}
