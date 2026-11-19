'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Lock } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';
import { FormField, Select } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { ErrorNote } from '@/components/ui/panel';
import { Skeleton } from '@/components/ui/skeleton';
import { StatusDot } from '@/components/ui/status-dot';
import { Switch } from '@/components/ui/switch';
import { ProtectedFileLink } from '@/features/dashboard/common/components/ProtectedFileLink';
import { formatDate, formatDateTime, humanize } from '@/features/dashboard/common/utils/format';
import { gqlErrorMessage } from '@/features/dashboard/common/utils/gqlError';
import { AGENT_STATUS, KYC_CHECK, metaOf } from '@/features/dashboard/common/utils/status';
import { useFullAgentProfile, useNotificationPreferences, useRunAction } from '../hooks/useRun';
import { VEHICLE_OPTIONS, type FullAgentProfile, type NotificationPreference } from '../types/run.types';
import { BigAction, PhotoCapture, RunCard } from './RunPrimitives';
import type { RunViewProps } from './RunShell';
import { NewTicketDialog } from './SupportTickets';

const GROUP_LABEL: Record<NotificationPreference['group'], string> = {
  OFFERS: 'Delivery requests',
  DELIVERY_UPDATES: 'Delivery updates',
  WORKSPACES: 'Workspaces',
  EARNINGS_COD: 'Earnings & COD',
  ACCOUNT_KYC: 'Account & verification',
  SUPPORT: 'Support',
};

/** Screen 5 — Profile & verification: identity, KYC schedule and documents, vehicle change, preferences, privacy. */
export function ProfileView({ tracking }: RunViewProps) {
  const profile = useFullAgentProfile();
  const params = useSearchParams();
  const [deactivate, setDeactivate] = useState(false);
  const section = params.get('section');
  useEffect(() => {
    if (section) document.getElementById(`profile-${section}`)?.scrollIntoView({ block: 'start' });
  }, [section, profile.data]);

  if (profile.isError) return <ErrorNote message={gqlErrorMessage(profile.error)} onRetry={() => void profile.refetch()} />;
  if (!profile.data) return <Skeleton className="h-96 w-full rounded-2xl" />;
  const p = profile.data;
  const status = metaOf(AGENT_STATUS, p.agentStatus);

  return (
    <div className="space-y-4">
      <RunCard>
        <p className="text-[18px] font-semibold tracking-tight">{p.displayName}</p>
        <p className="font-mono text-[12px] text-muted-foreground">{p.orqUserId}</p>
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px]">
          <span className="rounded-full border border-border px-2.5 py-0.5 text-[12px] font-medium">Delivery Agent</span>
          <StatusDot tone={status.tone} label={status.label} />
          <span className="text-muted-foreground">since {formatDate(p.activatedAt)}</span>
        </div>
        {p.suspendedReason && <p className="mt-2 text-[13px]">Suspended: {p.suspendedReason}</p>}
      </RunCard>

      <section id="profile-verification" className="scroll-mt-20 space-y-3" aria-label="Verification">
        {p.kycAlerts.map((a) => (
          <p key={a} role="alert" className="flex items-start gap-2 rounded-xl border-2 border-foreground bg-card px-3 py-2.5 text-[13px] font-medium">
            <StatusDot tone="warning" /> {a}
          </p>
        ))}
        <CheckCard
          title={`Driving licence ••${p.licenceNumberLast4}`}
          checkType="DRIVING_LICENCE"
          status={p.licenceStatus}
          rows={[
            ['Valid until', formatDate(p.licenceValidTo)],
            ['Last verified', formatDate(p.licenceVerifiedAt)],
            ['Next re-verification', `${formatDate(p.licenceNextDueAt)} · every 12 months`],
          ]}
          files={[
            ['Licence front', p.licenceFrontFileId],
            ['Licence back', p.licenceBackFileId],
          ]}
        />
        <CheckCard
          title={`Vehicle ${p.vehicleNumberMasked}`}
          subtitle={VEHICLE_OPTIONS.find((o) => o.value === p.vehicleCategory)?.label}
          checkType="VEHICLE_RC"
          status={p.vehicleStatus}
          rows={[
            ['RC valid until', formatDate(p.vehicleRcValidTo)],
            ['Last verified', formatDate(p.vehicleVerifiedAt)],
            ['Next re-verification', `${formatDate(p.vehicleNextDueAt)} · every 4 months`],
          ]}
          files={[['Registration certificate', p.vehicleRcFileId]]}
        >
          <ChangeVehicle profile={p} />
        </CheckCard>
        {p.verifications.length > 0 && (
          <RunCard className="p-0">
            <p className="px-4 pt-3 text-[11px] font-medium uppercase tracking-[0.1em] text-muted-foreground">Verification attempts</p>
            <ul className="divide-y divide-border text-[12.5px]">
              {p.verifications.slice(0, 6).map((v) => (
                <li key={v.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                  <span>
                    {v.checkType === 'DRIVING_LICENCE' ? 'Licence' : 'Vehicle'} · {humanize(v.trigger)}
                    <span className="block text-[11.5px] text-muted-foreground">{formatDateTime(v.requestedAt)}</span>
                  </span>
                  <span className="text-right">{humanize(v.status)}</span>
                </li>
              ))}
            </ul>
          </RunCard>
        )}
      </section>

      <Preferences />

      <RunCard id="profile-location" className="scroll-mt-20 space-y-2 text-[13px]">
        <p className="text-[11px] font-medium uppercase tracking-[0.1em] text-muted-foreground">Location & privacy</p>
        <StatusDot
          tone={tracking.state === 'active' ? 'live' : tracking.state === 'denied' || tracking.state === 'unavailable' ? 'critical' : 'idle'}
          label={
            tracking.state === 'active'
              ? `Sharing now${tracking.lastSentAt ? ` · last sent ${Math.round((Date.now() - tracking.lastSentAt) / 1000)}s ago` : ''}${tracking.position?.accuracy ? ` · ±${Math.round(tracking.position.accuracy)} m` : ''}`
              : tracking.state === 'denied'
                ? 'Blocked in your browser settings'
                : tracking.state === 'unavailable'
                  ? 'GPS unavailable'
                  : 'Not sharing (you are offline with no active delivery)'
          }
          className="font-medium"
        />
        {tracking.lastRejected && <p className="text-[12px]">The last position was rejected as inaccurate — move to open sky.</p>}
        <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
          <li>Shared only while you are online or carrying a delivery, at most every 15 seconds.</li>
          <li>Visible only to workspaces you are connected to, for their own deliveries.</li>
          <li>Used for live tracking and the distance on your earnings; kept for 90 days.</li>
          <li>Going offline stops sharing immediately (an active delivery keeps it on until finished).</li>
        </ul>
      </RunCard>

      <RunCard className="space-y-2 text-[13px]">
        <p className="text-[11px] font-medium uppercase tracking-[0.1em] text-muted-foreground">Account</p>
        <a href="#" className="block underline underline-offset-2">
          Delivery agent terms
        </a>
        <a href="#" className="block underline underline-offset-2">
          Privacy policy
        </a>
        <button type="button" className="block text-left underline underline-offset-2" onClick={() => setDeactivate(true)}>
          Request account deactivation
        </button>
        <p className="text-[12px] text-muted-foreground">Deactivation removes the Delivery Agent role after your active deliveries and earnings are settled. Your Orqland account stays.</p>
      </RunCard>
      {deactivate && (
        <NewTicketDialog
          onClose={() => setDeactivate(false)}
          preset={{ category: 'ACCOUNT_SECURITY', subject: 'Deactivate my delivery agent account', description: 'Please deactivate my delivery agent account. Reason: ' }}
        />
      )}
    </div>
  );
}

function CheckCard({
  title,
  subtitle,
  checkType,
  status,
  rows,
  files,
  children,
}: {
  title: string;
  subtitle?: string;
  checkType: 'DRIVING_LICENCE' | 'VEHICLE_RC';
  status: string;
  rows: [string, string][];
  files: [string, string | null][];
  children?: React.ReactNode;
}) {
  const reverify = useRunAction('reverify');
  const st = metaOf(KYC_CHECK, status);
  return (
    <RunCard className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[15px] font-semibold">{title}</p>
          {subtitle && <p className="text-[12px] text-muted-foreground">{subtitle}</p>}
        </div>
        <StatusDot tone={st.tone} label={st.label} className="text-[12px]" />
      </div>
      <dl className="space-y-1 text-[13px]">
        {rows.map(([k, v]) => (
          <div key={k} className="flex justify-between gap-3">
            <dt className="text-muted-foreground">{k}</dt>
            <dd className="tabular text-right">{v}</dd>
          </div>
        ))}
      </dl>
      {files.some(([, id]) => id) && (
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          {files.map(([label, id]) => id && <ProtectedFileLink key={label} fileId={id} label={label} />)}
        </div>
      )}
      <p className="text-[11.5px] text-muted-foreground">Verified through Surepass. Re-verification is due on schedule; new deliveries stop if it lapses, but an active delivery is never taken away.</p>
      {reverify.error && <ErrorNote message={gqlErrorMessage(reverify.error)} />}
      {reverify.isSuccess && <p className="text-[12px]">Re-verification finished — see the status above.</p>}
      <BigAction variant="outline" disabled={reverify.isPending} onClick={() => reverify.mutate([checkType])}>
        {reverify.isPending ? 'Verifying…' : 'Re-verify now'}
      </BigAction>
      {children}
    </RunCard>
  );
}

const vehicleSchema = z.object({
  vehicleNumber: z.string().trim().min(6, 'Enter the full registration number').max(16).regex(/^[A-Za-z0-9 -]+$/, 'Letters, numbers, spaces or hyphens only'),
  vehicleCategory: z.enum(['SCOOTER', 'MOTORCYCLE', 'THREE_WHEELER', 'CAR', 'VAN']),
  rc: z.object({ id: z.string(), name: z.string(), previewUrl: z.string().nullable() }).nullable(),
});

function ChangeVehicle({ profile }: { profile: FullAgentProfile }) {
  const [open, setOpen] = useState(false);
  const change = useRunAction('changeVehicle');
  const form = useForm<z.input<typeof vehicleSchema>, unknown, z.output<typeof vehicleSchema>>({
    resolver: zodResolver(vehicleSchema),
    defaultValues: { vehicleNumber: '', vehicleCategory: profile.vehicleCategory === 'OTHER' ? 'MOTORCYCLE' : profile.vehicleCategory, rc: null },
  });
  const e = form.formState.errors;
  if (!open)
    return (
      <button type="button" className="text-[12.5px] underline underline-offset-2" onClick={() => setOpen(true)}>
        Changed your vehicle?
      </button>
    );
  return (
    <form
      noValidate
      className="space-y-3 border-t border-border pt-3"
      onSubmit={form.handleSubmit((v) =>
        change.mutate({ vehicleNumber: v.vehicleNumber, vehicleCategory: v.vehicleCategory, vehicleRcFileId: v.rc?.id }, { onSuccess: () => setOpen(false) }),
      )}
    >
      <p className="text-[12.5px] text-muted-foreground">The new vehicle is verified before it replaces the old one. Finish active deliveries first.</p>
      <FormField id="newVehicle" label="New registration number" error={e.vehicleNumber?.message}>
        <Input className="h-11 font-mono uppercase" {...form.register('vehicleNumber')} />
      </FormField>
      <FormField id="newCategory" label="Vehicle type">
        <Select className="h-11" {...form.register('vehicleCategory')}>
          {VEHICLE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>
      </FormField>
      <Controller control={form.control} name="rc" render={({ field }) => <PhotoCapture purpose="VEHICLE_RC" label="RC document" optional accept="image/jpeg,image/png,image/webp,application/pdf" value={field.value} onChange={field.onChange} />} />
      {change.error && <ErrorNote message={gqlErrorMessage(change.error)} />}
      <div className="grid grid-cols-2 gap-2">
        <BigAction variant="outline" onClick={() => setOpen(false)}>
          Cancel
        </BigAction>
        <BigAction type="submit" disabled={change.isPending}>
          {change.isPending ? 'Verifying…' : 'Verify & switch'}
        </BigAction>
      </div>
    </form>
  );
}

function Preferences() {
  const prefs = useNotificationPreferences();
  const set = useRunAction('setPreference');
  if (prefs.isError) return <ErrorNote message={gqlErrorMessage(prefs.error)} />;
  if (!prefs.data) return <Skeleton className="h-40 w-full rounded-2xl" />;
  const groups = Object.keys(GROUP_LABEL) as NotificationPreference['group'][];
  return (
    <RunCard className="p-0" aria-label="Notification preferences">
      <p className="px-4 pt-3 text-[11px] font-medium uppercase tracking-[0.1em] text-muted-foreground">Push notifications</p>
      {groups.map((g) => (
        <div key={g} className="border-b border-border px-4 py-3 last:border-b-0">
          <p className="mb-1 text-[12.5px] font-semibold">{GROUP_LABEL[g]}</p>
          <ul className="space-y-1.5">
            {prefs.data!.filter((p) => p.group === g).map((p) => (
              <li key={p.type} className="flex min-h-9 items-center justify-between gap-3 text-[13px]">
                <span>{p.label}</span>
                {p.locked ? (
                  <span className="inline-flex items-center gap-1 text-[11.5px] text-muted-foreground">
                    <Lock className="size-3" /> Always on
                  </span>
                ) : (
                  <Switch aria-label={p.label} checked={p.enabled} disabled={set.isPending} onCheckedChange={(enabled) => set.mutate({ type: p.type, enabled })} />
                )}
              </li>
            ))}
          </ul>
        </div>
      ))}
      {set.error && <ErrorNote className="m-4" message={gqlErrorMessage(set.error)} />}
      <p className="px-4 pb-3 text-[11.5px] text-muted-foreground">Safety and account alerts can’t be turned off. Everything stays in your notification history.</p>
    </RunCard>
  );
}
