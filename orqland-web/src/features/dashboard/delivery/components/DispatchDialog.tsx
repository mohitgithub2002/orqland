'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { ErrorNote } from '@/components/ui/panel';
import { StatusDot } from '@/components/ui/status-dot';
import { Textarea } from '@/components/ui/textarea';
import { formatMoney, timeAgo } from '@/features/dashboard/common/utils/format';
import { haversineKm } from '@/features/dashboard/common/utils/geo';
import { gqlErrorMessage } from '@/features/dashboard/common/utils/gqlError';
import { AVAILABILITY, metaOf } from '@/features/dashboard/common/utils/status';
import { cn } from '@/lib/utils';
import { useDeliveryAction, useDeliveryAgents, useDeliverySettings } from '../hooks/useDelivery';
import type { AgentConnection, DeliverySettings } from '../types/delivery.types';

export type DispatchTarget = { kind: 'dispatch'; orderId: string; orderNumber: string } | { kind: 'reassign'; taskId: string; taskNumber: string };

const schema = z
  .object({
    mode: z.enum(['AGENT', 'SELF']),
    assignmentType: z.enum(['AUTO', 'MANUAL']),
    agentUserId: z.string().optional(),
    selfStaffName: z.string().max(150).optional(),
    selfStaffPhone: z.string().regex(/^[+\d][\d\s-]{6,18}$/, 'Enter a valid phone number').or(z.literal('')).optional(),
    reason: z.string().max(500).optional(),
    reassign: z.boolean(),
  })
  .superRefine((v, ctx) => {
    if (v.mode === 'AGENT' && v.assignmentType === 'MANUAL' && !v.agentUserId) ctx.addIssue({ code: 'custom', path: ['agentUserId'], message: 'Choose an available agent' });
    if (v.reassign && (v.reason ?? '').trim().length < 3) ctx.addIssue({ code: 'custom', path: ['reason'], message: 'Give a reason for the reassignment' });
  });
type Values = z.infer<typeof schema>;

/** Why an agent cannot take a new delivery right now (mirrors the engine's eligibility rules). */
export function agentBlocker(c: AgentConnection): string | null {
  if (c.disconnectRequestStatus === 'REQUESTED') return 'Disconnection pending';
  if (!c.agent.kycValid) return 'Verification not valid';
  if (c.agent.availability === 'OFFLINE') return 'Offline';
  if (c.agent.availability === 'BUSY') return 'At capacity';
  return null;
}

export function distanceFromPickup(c: AgentConnection, s: DeliverySettings | undefined): number | null {
  if (!s?.pickupLat || !s.pickupLng || c.agent.lastLat === null || c.agent.lastLng === null) return null;
  return haversineKm({ lat: s.pickupLat, lng: s.pickupLng }, { lat: c.agent.lastLat, lng: c.agent.lastLng });
}

/** Manual & automatic assignment: who delivers this order (own staff, the engine's pick, or a chosen connected agent). */
export function DispatchDialog({
  open,
  onOpenChange,
  orqspaceId,
  target,
  presetAgentUserId,
  onDone,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orqspaceId: string;
  target: DispatchTarget;
  presetAgentUserId?: string;
  onDone?: () => void;
}) {
  const reassign = target.kind === 'reassign';
  const settings = useDeliverySettings(open ? orqspaceId : null);
  const agents = useDeliveryAgents(open ? orqspaceId : null, ['ACTIVE']);
  const dispatch = useDeliveryAction('dispatch');
  const reassignAction = useDeliveryAction('reassign');
  const mutation = reassign ? reassignAction : dispatch;
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { mode: 'AGENT', assignmentType: presetAgentUserId ? 'MANUAL' : 'AUTO', agentUserId: presetAgentUserId, selfStaffName: '', selfStaffPhone: '', reason: '', reassign },
  });
  const mode = form.watch('mode');
  const assignment = form.watch('assignmentType');
  const agentUserId = form.watch('agentUserId');
  const agentMode = reassign || mode === 'AGENT';
  const noPickup = agentMode && settings.data && !settings.data.readyForAgentDispatch;
  const e = form.formState.errors;

  const submit = (v: Values) => {
    const onSuccess = () => {
      onOpenChange(false);
      onDone?.();
    };
    if (target.kind === 'reassign') {
      reassignAction.mutate({ taskId: target.taskId, assignmentType: v.assignmentType, agentUserId: v.assignmentType === 'MANUAL' ? v.agentUserId : undefined, reason: v.reason?.trim() }, { onSuccess });
    } else if (v.mode === 'SELF') {
      dispatch.mutate({ orderId: target.orderId, mode: 'SELF', selfStaffName: v.selfStaffName || undefined, selfStaffPhone: v.selfStaffPhone || undefined }, { onSuccess });
    } else {
      dispatch.mutate({ orderId: target.orderId, mode: 'AGENT', assignmentType: v.assignmentType, agentUserId: v.assignmentType === 'MANUAL' ? v.agentUserId : undefined }, { onSuccess });
    }
  };

  const sorted = [...(agents.data ?? [])].sort((a, b) => Number(!!agentBlocker(a)) - Number(!!agentBlocker(b)) || (distanceFromPickup(a, settings.data) ?? 99) - (distanceFromPickup(b, settings.data) ?? 99));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="ops-theme max-w-xl">
        <form onSubmit={form.handleSubmit(submit)} className="grid gap-4" noValidate>
          <DialogHeader>
            <DialogTitle>{reassign ? `Reassign ${target.taskNumber}` : `Dispatch ${target.orderNumber}`}</DialogTitle>
            <DialogDescription>
              {reassign ? 'The current agent is released and the delivery is offered again.' : 'Only agents connected to this workspace can receive the delivery.'}
            </DialogDescription>
          </DialogHeader>

          {!reassign && (
            <Segmented
              label="Delivered by"
              value={mode}
              onChange={(v) => form.setValue('mode', v as Values['mode'])}
              options={[
                { value: 'AGENT', label: 'Delivery agent', hint: 'Orqland Run' },
                { value: 'SELF', label: 'Own staff', hint: 'Self-delivery' },
              ]}
            />
          )}

          {agentMode && (
            <>
              {noPickup && <ErrorNote message="Set the pickup location in Settings before assigning agents — distance and earnings are calculated from it." />}
              <Segmented
                label="Assignment"
                value={assignment}
                onChange={(v) => form.setValue('assignmentType', v as Values['assignmentType'])}
                options={[
                  { value: 'AUTO', label: 'Automatic', hint: `Engine picks (${settings.data?.assignmentStrategy.toLowerCase().replace('_', ' ') ?? 'nearest'})` },
                  { value: 'MANUAL', label: 'Choose agent', hint: 'Send to one agent' },
                ]}
              />
              {assignment === 'AUTO' ? (
                <p className="rounded-md bg-muted px-3 py-2 text-[12.5px] leading-5 text-muted-foreground">
                  Online, verified agents with capacity are ranked by distance and workload. If the offer is declined or expires after{' '}
                  {settings.data?.offerTimeoutSeconds ?? 90}s, the next agent is tried (up to {settings.data?.maxOfferAttempts ?? 5}).
                </p>
              ) : (
                <fieldset className="space-y-1.5">
                  <legend className="sr-only">Choose an agent</legend>
                  {agents.data?.length === 0 && <p className="text-[12.5px] text-muted-foreground">No connected agents yet — invite one from Agents.</p>}
                  <div className="max-h-64 space-y-1.5 overflow-y-auto">
                    {sorted.map((c) => {
                      const blocker = agentBlocker(c);
                      const km = distanceFromPickup(c, settings.data);
                      const av = metaOf(AVAILABILITY, c.agent.availability);
                      return (
                        <label
                          key={c.id}
                          className={cn(
                            'flex cursor-pointer items-center gap-3 rounded-md border px-3 py-2 transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-foreground',
                            agentUserId === c.agentUserId ? 'border-foreground bg-muted' : 'border-border hover:bg-muted/60',
                            blocker && 'cursor-not-allowed opacity-50',
                          )}
                        >
                          <input type="radio" className="sr-only" value={c.agentUserId} disabled={!!blocker} {...form.register('agentUserId')} />
                          <StatusDot tone={blocker ? 'idle' : av.tone} />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[13px] font-medium">{c.agent.displayName}</span>
                            <span className="block truncate text-[11.5px] text-muted-foreground">
                              <span className="font-mono">{c.agent.orqUserId}</span> · {formatMoney(c.currentRatePerKm)}/km · seen {timeAgo(c.agent.lastLocationAt)}
                            </span>
                          </span>
                          <span className="tabular text-right text-[12px]">
                            {blocker ?? (km !== null ? `${km.toFixed(1)} km` : 'No location')}
                            <span className="block text-[11px] text-muted-foreground">{c.agent.activeTaskCount} active</span>
                          </span>
                        </label>
                      );
                    })}
                  </div>
                  {e.agentUserId && (
                    <p role="alert" className="text-[12px] text-destructive">
                      {e.agentUserId.message}
                    </p>
                  )}
                </fieldset>
              )}
            </>
          )}

          {!reassign && mode === 'SELF' && (
            <div className="grid gap-3 sm:grid-cols-2">
              <FormField id="staff" label="Staff member" optional error={e.selfStaffName?.message}>
                <Input {...form.register('selfStaffName')} />
              </FormField>
              <FormField id="staffPhone" label="Phone" optional error={e.selfStaffPhone?.message}>
                <Input type="tel" {...form.register('selfStaffPhone')} />
              </FormField>
            </div>
          )}

          {reassign && (
            <FormField id="reassignReason" label="Reason" hint="Recorded in the delivery timeline." error={e.reason?.message}>
              <Textarea {...form.register('reason')} />
            </FormField>
          )}

          {mutation.error && <ErrorNote message={gqlErrorMessage(mutation.error)} />}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Back
            </Button>
            <Button type="submit" disabled={mutation.isPending || !!noPickup}>
              {mutation.isPending ? 'Sending…' : reassign ? 'Reassign' : mode === 'SELF' ? 'Start self-delivery' : assignment === 'AUTO' ? 'Auto-assign' : 'Send offer'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Segmented({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string; hint: string }[] }) {
  return (
    <div role="radiogroup" aria-label={label} className="grid grid-cols-2 gap-2">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            'rounded-md border px-3 py-2 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground',
            value === o.value ? 'border-foreground bg-foreground text-background' : 'border-border hover:bg-muted/60',
          )}
        >
          <span className="block text-[13px] font-medium">{o.label}</span>
          <span className={cn('block text-[11.5px]', value === o.value ? 'text-background/70' : 'text-muted-foreground')}>{o.hint}</span>
        </button>
      ))}
    </div>
  );
}
