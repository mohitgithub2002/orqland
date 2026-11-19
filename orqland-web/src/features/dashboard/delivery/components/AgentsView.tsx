'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { ChevronDown, Search } from 'lucide-react';
import { Fragment, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { EmptyState, ErrorNote, Panel, SectionLabel } from '@/components/ui/panel';
import { Skeleton } from '@/components/ui/skeleton';
import { StatusDot } from '@/components/ui/status-dot';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { ReasonDialog } from '@/features/dashboard/common/components/ReasonDialog';
import { formatDate, formatDateTime, formatMoney, timeAgo } from '@/features/dashboard/common/utils/format';
import { gqlErrorMessage } from '@/features/dashboard/common/utils/gqlError';
import { AGENT_STATUS, AVAILABILITY, CONNECTION_STATUS, metaOf } from '@/features/dashboard/common/utils/status';
import { useAgentSearch, useDeliveryAction, useDeliveryAgents } from '../hooks/useDelivery';
import type { AgentConnection } from '../types/delivery.types';

const RATE = z.string().trim().regex(/^\d{1,6}(\.\d{1,2})?$/, 'Enter a rate like 12 or 12.50').refine((v) => Number(v) > 0, 'The rate must be more than ₹0');
const searchSchema = z.object({ orqUserId: z.string().trim().regex(/^[A-Za-z0-9]{4,14}$/, 'Orq IDs are 4–14 letters and numbers') });
const inviteSchema = z.object({ ratePerKm: RATE, message: z.string().max(280, 'Keep the message under 280 characters').optional() });
const rateSchema = z.object({ ratePerKm: RATE, reason: z.string().trim().min(3, 'Explain the change (shown to the agent)').max(280) });

/** Agent directory & Orq ID search, connection management, per-km rates and disconnect requests (guide §4). */
export function AgentsView({ orqspaceId }: { orqspaceId: string }) {
  const live = useDeliveryAgents(orqspaceId);
  const history = useDeliveryAgents(orqspaceId, ['DISCONNECTED', 'DECLINED', 'EXPIRED', 'CANCELLED']);
  const [rateFor, setRateFor] = useState<AgentConnection | null>(null);
  const [disconnectFor, setDisconnectFor] = useState<AgentConnection | null>(null);
  const [cancelFor, setCancelFor] = useState<AgentConnection | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const cancel = useDeliveryAction('cancelInvite');
  const withdraw = useDeliveryAction('withdrawDisconnect');

  if (live.isError) return <ErrorNote message={gqlErrorMessage(live.error)} onRetry={() => void live.refetch()} />;
  const active = live.data?.filter((c) => c.status === 'ACTIVE') ?? [];
  const pending = live.data?.filter((c) => c.status === 'PENDING') ?? [];

  return (
    <div className="space-y-5">
      <OrqIdSearch orqspaceId={orqspaceId} />

      <Panel title="Connected agents" description="Each agent has their own per-km rate for this workspace. Completed deliveries keep the rate they were accepted at." actions={<span className="tabular text-[12px] text-muted-foreground">{active.length} active</span>}>
        {!live.data ? (
          <Skeleton className="m-4 h-32" />
        ) : active.length === 0 ? (
          <EmptyState title="No connected agents" body="Search an agent by Orq ID above and invite them. They accept from Orqland Run." />
        ) : (
          <Table>
            <THead>
              <tr>
                <TH>Agent</TH>
                <TH>Availability</TH>
                <TH>Verification</TH>
                <TH align="right">Rate / km</TH>
                <TH align="right">Active</TH>
                <TH>Connected</TH>
                <TH />
              </tr>
            </THead>
            <TBody>
              {active.map((c) => {
                const av = metaOf(AVAILABILITY, c.agent.availability);
                const kyc = metaOf(AGENT_STATUS, c.agent.kycValid ? 'ACTIVE' : c.agent.agentStatus === 'ACTIVE' ? 'KYC_BLOCKED' : c.agent.agentStatus);
                const pendingDisconnect = c.disconnectRequestStatus === 'REQUESTED';
                return (
                  <Fragment key={c.id}>
                    <TR>
                      <TD>
                        <button type="button" className="flex items-center gap-1.5 text-left" aria-expanded={expanded === c.id} onClick={() => setExpanded(expanded === c.id ? null : c.id)}>
                          <ChevronDown className={`size-3.5 shrink-0 text-muted-foreground transition-transform ${expanded === c.id ? '' : '-rotate-90'}`} />
                          <span>
                            <span className="block font-medium">{c.agent.displayName}</span>
                            <span className="block font-mono text-[11px] text-muted-foreground">
                              {c.agent.orqUserId} · {c.agent.vehicleNumberMasked}
                            </span>
                          </span>
                        </button>
                      </TD>
                      <TD>
                        <StatusDot tone={av.tone} label={av.label} className="text-[12.5px]" />
                        <span className="block pl-3.5 text-[11px] text-muted-foreground">seen {timeAgo(c.agent.lastLocationAt)}</span>
                      </TD>
                      <TD>
                        <StatusDot tone={kyc.tone} label={kyc.label} className="text-[12.5px]" />
                      </TD>
                      <TD align="right" className="font-medium">
                        {formatMoney(c.currentRatePerKm)}
                      </TD>
                      <TD align="right">{c.activeTaskCount}</TD>
                      <TD className="text-[12.5px]">
                        {formatDate(c.activatedAt)}
                        {pendingDisconnect && (
                          <span className="mt-0.5 block">
                            <StatusDot tone="warning" label={`Disconnect pending (${c.disconnectRequestedByRole === 'AGENT' ? 'agent' : 'workspace'})`} className="text-[11.5px]" />
                          </span>
                        )}
                      </TD>
                      <TD align="right">
                        <div className="flex justify-end gap-1.5">
                          <Button size="sm" variant="outline" onClick={() => setRateFor(c)}>
                            Rate
                          </Button>
                          {pendingDisconnect ? (
                            c.disconnectRequestedByRole !== 'AGENT' && (
                              <Button size="sm" variant="ghost" disabled={withdraw.isPending} onClick={() => withdraw.mutate({ connectionId: c.id })}>
                                Keep agent
                              </Button>
                            )
                          ) : (
                            <Button size="sm" variant="ghost" onClick={() => setDisconnectFor(c)}>
                              Disconnect
                            </Button>
                          )}
                        </div>
                      </TD>
                    </TR>
                    {expanded === c.id && (
                      <tr className="border-b border-border bg-muted/40">
                        <td colSpan={7} className="px-4 py-3">
                          <div className="grid gap-4 text-[12.5px] md:grid-cols-3">
                            <div>
                              <SectionLabel className="mb-1">Rate history</SectionLabel>
                              <ul className="space-y-0.5">
                                {(c.rateHistory ?? []).map((r) => (
                                  <li key={r.id} className="tabular">
                                    {formatMoney(r.ratePerKm)}/km from {formatDateTime(r.effectiveFrom)}
                                    {r.reason && <span className="text-muted-foreground"> · {r.reason}</span>}
                                  </li>
                                ))}
                              </ul>
                            </div>
                            <div>
                              <SectionLabel className="mb-1">Contact</SectionLabel>
                              <p>{c.agent.phone ?? '—'}</p>
                              <p className="text-muted-foreground">Vehicle {c.agent.vehicleCategory.toLowerCase().replace('_', ' ')}</p>
                            </div>
                            <div>
                              <SectionLabel className="mb-1">Disconnection</SectionLabel>
                              {pendingDisconnect ? (
                                <p>
                                  Requested {formatDateTime(c.disconnectRequestedAt)} — “{c.disconnectRequestReason}”. No new offers are sent; it completes when the agent’s {c.activeTaskCount} active
                                  deliver{c.activeTaskCount === 1 ? 'y' : 'ies'} finish.
                                </p>
                              ) : (
                                <p className="text-muted-foreground">None requested. Completed deliveries and earnings are kept after a disconnection.</p>
                              )}
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </TBody>
          </Table>
        )}
        {withdraw.error && <ErrorNote className="m-4" message={gqlErrorMessage(withdraw.error)} />}
      </Panel>

      <Panel title="Invitations" description="Waiting for the agent to accept in Orqland Run" actions={<span className="tabular text-[12px] text-muted-foreground">{pending.length}</span>}>
        {pending.length === 0 ? (
          <EmptyState title="No pending invitations" />
        ) : (
          <Table>
            <THead>
              <tr>
                <TH>Agent</TH>
                <TH align="right">Offered rate</TH>
                <TH>Sent</TH>
                <TH>Expires</TH>
                <TH />
              </tr>
            </THead>
            <TBody>
              {pending.map((c) => (
                <TR key={c.id}>
                  <TD>
                    <span className="font-medium">{c.agent.displayName}</span> <span className="font-mono text-[11px] text-muted-foreground">{c.agent.orqUserId}</span>
                  </TD>
                  <TD align="right">{formatMoney(c.currentRatePerKm)}/km</TD>
                  <TD className="text-[12.5px]">{formatDateTime(c.invitedAt)}</TD>
                  <TD className="text-[12.5px]">{formatDateTime(c.inviteExpiresAt)}</TD>
                  <TD align="right">
                    <Button size="sm" variant="ghost" onClick={() => setCancelFor(c)}>
                      Withdraw
                    </Button>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Panel>

      <div>
        <button type="button" className="inline-flex items-center gap-1 text-[12.5px] text-muted-foreground hover:text-foreground" aria-expanded={showHistory} onClick={() => setShowHistory(!showHistory)}>
          <ChevronDown className={`size-3.5 transition-transform ${showHistory ? '' : '-rotate-90'}`} /> Connection history ({history.data?.length ?? 0})
        </button>
        {showHistory && (
          <Panel className="mt-2">
            <Table>
              <THead>
                <tr>
                  <TH>Agent</TH>
                  <TH>Status</TH>
                  <TH>Ended</TH>
                  <TH>Reason</TH>
                </tr>
              </THead>
              <TBody>
                {(history.data ?? []).map((c) => {
                  const st = metaOf(CONNECTION_STATUS, c.status);
                  return (
                    <TR key={c.id}>
                      <TD>
                        {c.agent.displayName} <span className="font-mono text-[11px] text-muted-foreground">{c.agent.orqUserId}</span>
                      </TD>
                      <TD>
                        <StatusDot tone={st.tone} label={st.label} className="text-[12.5px]" />
                      </TD>
                      <TD className="text-[12.5px]">{formatDateTime(c.disconnectedAt ?? c.inviteExpiresAt)}</TD>
                      <TD className="max-w-[320px] truncate text-[12.5px] text-muted-foreground">{c.disconnectReason ?? '—'}</TD>
                    </TR>
                  );
                })}
              </TBody>
            </Table>
          </Panel>
        )}
      </div>

      {rateFor && <RateDialog connection={rateFor} onClose={() => setRateFor(null)} />}
      {disconnectFor && <DisconnectDialog connection={disconnectFor} onClose={() => setDisconnectFor(null)} />}
      {cancelFor && (
        <ReasonDialog
          open
          onOpenChange={(o) => !o && setCancelFor(null)}
          title={`Withdraw the invitation to ${cancelFor.agent.displayName}?`}
          confirmLabel="Withdraw invitation"
          pending={cancel.isPending}
          error={cancel.error ? gqlErrorMessage(cancel.error) : null}
          onConfirm={(reason) => cancel.mutate({ connectionId: cancelFor.id, reason }, { onSuccess: () => setCancelFor(null) })}
        />
      )}
    </div>
  );
}

function OrqIdSearch({ orqspaceId }: { orqspaceId: string }) {
  const search = useAgentSearch(orqspaceId);
  const invite = useDeliveryAction('inviteAgent');
  const form = useForm<z.infer<typeof searchSchema>>({ resolver: zodResolver(searchSchema), defaultValues: { orqUserId: '' } });
  const inviteForm = useForm<z.infer<typeof inviteSchema>>({ resolver: zodResolver(inviteSchema), defaultValues: { ratePerKm: '', message: '' } });
  const r = search.data;
  const kyc = r?.agent ? metaOf(AGENT_STATUS, r.agent.kycValid ? 'ACTIVE' : r.agent.agentStatus) : null;

  return (
    <Panel title="Agent directory" description="Search by Orq ID only — agents cannot be looked up by phone, licence or vehicle number.">
      <div className="grid gap-4 p-4 lg:grid-cols-[minmax(0,360px)_minmax(0,1fr)]">
        <form
          noValidate
          onSubmit={form.handleSubmit((v) => {
            invite.reset();
            search.mutate(v.orqUserId.toUpperCase());
          })}
          className="space-y-2"
        >
          <FormField id="orqId" label="Orq ID" error={form.formState.errors.orqUserId?.message}>
            <Input placeholder="e.g. ORQRAVI00003" autoComplete="off" className="font-mono uppercase" {...form.register('orqUserId')} />
          </FormField>
          <Button type="submit" disabled={search.isPending} className="w-full sm:w-auto">
            <Search /> {search.isPending ? 'Searching…' : 'Find agent'}
          </Button>
          {search.error && <ErrorNote message={gqlErrorMessage(search.error)} />}
        </form>

        <div className="min-w-0 rounded-md border border-dashed border-border p-4" aria-live="polite">
          {!r ? (
            <p className="text-[12.5px] text-muted-foreground">The agent’s verification status, availability and connection limits appear here before you invite them.</p>
          ) : !r.agent ? (
            <p className="text-[13px]">{r.reason ?? 'No delivery agent with this Orq ID.'}</p>
          ) : (
            <div className="space-y-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="text-[15px] font-semibold">{r.agent.displayName}</p>
                  <p className="font-mono text-[11.5px] text-muted-foreground">
                    {r.agent.orqUserId} · {r.agent.vehicleCategory.toLowerCase().replace('_', ' ')} {r.agent.vehicleNumberMasked}
                  </p>
                </div>
                <div className="text-right text-[12px]">
                  {kyc && <StatusDot tone={kyc.tone} label={kyc.label} />}
                  <p className="tabular text-muted-foreground">
                    Workspace {r.workspaceActiveConnections}/{r.workspaceConnectionLimit} agents
                  </p>
                </div>
              </div>
              {r.canInvite ? (
                <form
                  noValidate
                  onSubmit={inviteForm.handleSubmit((v) =>
                    invite.mutate(
                      { orqspaceId, orqUserId: r.agent!.orqUserId, ratePerKm: v.ratePerKm, message: v.message || undefined },
                      {
                        onSuccess: () => {
                          inviteForm.reset();
                          search.reset();
                          form.reset();
                        },
                      },
                    ),
                  )}
                  className="grid gap-3 sm:grid-cols-[140px_minmax(0,1fr)_auto] sm:items-start"
                >
                  <FormField id="inviteRate" label="Rate per km (₹)" error={inviteForm.formState.errors.ratePerKm?.message}>
                    <Input inputMode="decimal" placeholder="12.00" {...inviteForm.register('ratePerKm')} />
                  </FormField>
                  <FormField id="inviteMessage" label="Message" optional error={inviteForm.formState.errors.message?.message}>
                    <Input maxLength={280} placeholder="Shown with the invitation" {...inviteForm.register('message')} />
                  </FormField>
                  <Button type="submit" className="sm:mt-[22px]" disabled={invite.isPending}>
                    {invite.isPending ? 'Sending…' : 'Send invitation'}
                  </Button>
                </form>
              ) : (
                <p className="flex items-start gap-2 text-[13px]">
                  <StatusDot tone="warning" />
                  {r.reason}
                </p>
              )}
              {invite.error && <ErrorNote message={gqlErrorMessage(invite.error)} />}
              {invite.isSuccess && <p className="text-[12.5px] text-muted-foreground">Invitation sent. It expires in 7 days.</p>}
            </div>
          )}
        </div>
      </div>
    </Panel>
  );
}

function RateDialog({ connection: c, onClose }: { connection: AgentConnection; onClose: () => void }) {
  const update = useDeliveryAction('updateRate');
  const form = useForm<z.infer<typeof rateSchema>>({ resolver: zodResolver(rateSchema), defaultValues: { ratePerKm: c.currentRatePerKm, reason: '' } });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="ops-theme">
        <form noValidate onSubmit={form.handleSubmit((v) => update.mutate({ connectionId: c.id, ...v }, { onSuccess: onClose }))} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>Rate for {c.agent.displayName}</DialogTitle>
            <DialogDescription>Applies to deliveries accepted from now on. Accepted and completed deliveries keep their original rate.</DialogDescription>
          </DialogHeader>
          <FormField id="rate" label="Rate per km (₹)" error={form.formState.errors.ratePerKm?.message}>
            <Input inputMode="decimal" {...form.register('ratePerKm')} />
          </FormField>
          <FormField id="rateReason" label="Reason" hint="The agent is notified with this reason." error={form.formState.errors.reason?.message}>
            <Textarea {...form.register('reason')} />
          </FormField>
          {update.error && <ErrorNote message={gqlErrorMessage(update.error)} />}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Back
            </Button>
            <Button type="submit" disabled={update.isPending}>
              {update.isPending ? 'Saving…' : 'Update rate'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DisconnectDialog({ connection: c, onClose }: { connection: AgentConnection; onClose: () => void }) {
  const disconnect = useDeliveryAction('disconnect');
  const busy = c.activeTaskCount > 0;
  return (
    <ReasonDialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={busy ? `Schedule disconnection of ${c.agent.displayName}` : `Disconnect ${c.agent.displayName}?`}
      description={
        busy
          ? `${c.agent.displayName} has ${c.activeTaskCount} active deliver${c.activeTaskCount === 1 ? 'y' : 'ies'}. They stop receiving new offers now, and the connection closes automatically when those deliveries finish. You can also reassign them first from Live map.`
          : 'The agent stops receiving this workspace’s deliveries. Their completed deliveries and earnings are kept.'
      }
      confirmLabel={busy ? 'Schedule disconnection' : 'Disconnect'}
      destructive
      pending={disconnect.isPending}
      error={disconnect.error ? gqlErrorMessage(disconnect.error) : null}
      onConfirm={(reason) => disconnect.mutate({ connectionId: c.id, reason, afterActiveDeliveries: busy }, { onSuccess: onClose })}
    />
  );
}
