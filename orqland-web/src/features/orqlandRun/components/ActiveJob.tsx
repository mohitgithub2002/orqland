'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Banknote, Navigation, Phone, Store, UserRound } from 'lucide-react';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { FormField, Select } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { MapView, type MapPoint } from '@/components/ui/map-view';
import { ErrorNote } from '@/components/ui/panel';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import { StatusDot } from '@/components/ui/status-dot';
import { formatAddress, formatKm, formatMoney } from '@/features/dashboard/common/utils/format';
import { haversineKm } from '@/features/dashboard/common/utils/geo';
import { gqlErrorMessage } from '@/features/dashboard/common/utils/gqlError';
import { metaOf, TASK_STATUS } from '@/features/dashboard/common/utils/status';
import type { DeliveryTask } from '@/features/dashboard/delivery/types/delivery.types';
import type { Tracking } from '../hooks/useLocationTracking';
import { useRunAction, useRunTrace } from '../hooks/useRun';
import { CameraCapture } from './CameraCapture';
import { BigAction, Fact, OtpInput, PhotoCapture, RunCard, StepTracker } from './RunPrimitives';

export const STEPS = [
  { key: 'ACCEPTED', label: 'Accepted' },
  { key: 'ARRIVING_AT_PICKUP', label: 'To pickup' },
  { key: 'PICKED_UP', label: 'Picked up' },
  { key: 'IN_TRANSIT', label: 'On the way' },
  { key: 'DELIVERED', label: 'Delivered' },
];

type StepAction = 'markArriving' | 'confirmPickup' | 'startTransit' | 'complete';
export const NEXT_STEP: Record<string, { label: string; action: StepAction; hint: string }> = {
  ACCEPTED: { label: 'I’m heading to pickup', action: 'markArriving', hint: 'Lets the workspace know you are on your way.' },
  ARRIVING_AT_PICKUP: { label: 'Confirm pickup', action: 'confirmPickup', hint: 'Check the order number with the workspace before you leave.' },
  PICKED_UP: { label: 'Start trip to customer', action: 'startTransit', hint: 'Your route is recorded for distance and earnings.' },
  IN_TRANSIT: { label: 'Complete delivery', action: 'complete', hint: 'Get the customer’s 4-digit code and collect payment if due.' },
};

/** Mirrors DELIVERY_PICKUP_GEOFENCE_METERS / DELIVERY_PICKUP_GEOFENCE_MAX_ACCURACY_M on the engine. */
export const PICKUP_GEOFENCE_M = 50;
export const PICKUP_MAX_ACCURACY_M = 100;

/** Whether the agent may confirm pickup here: within 50 m of the pickup point with a usable GPS fix. */
export function pickupGate(t: DeliveryTask, tracking: Tracking): { ok: boolean; distanceM: number | null; message: string } {
  if (t.pickupLat === null || t.pickupLng === null) return { ok: true, distanceM: null, message: 'Check the order number with the workspace before you leave.' };
  if (!tracking.position) {
    return {
      ok: false,
      distanceM: null,
      message: tracking.state === 'denied' ? 'Turn on location for Orqland Run — pickup can only be confirmed at the workspace.' : 'Getting your location… pickup can only be confirmed at the workspace.',
    };
  }
  const distanceM = Math.round(haversineKm(tracking.position, { lat: t.pickupLat, lng: t.pickupLng }) * 1000);
  if (tracking.position.accuracy !== null && tracking.position.accuracy > PICKUP_MAX_ACCURACY_M) {
    return { ok: false, distanceM, message: `GPS is too weak (±${Math.round(tracking.position.accuracy)} m). Step outside or wait a moment.` };
  }
  if (distanceM > PICKUP_GEOFENCE_M) return { ok: false, distanceM, message: `You are ${distanceM} m from the pickup point. Move within ${PICKUP_GEOFENCE_M} m to confirm pickup.` };
  return { ok: true, distanceM, message: 'You’re at the pickup point. Check the order number with the workspace before you leave.' };
}

const mapsLink = (lat: number | null, lng: number | null) => (lat !== null && lng !== null ? `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving` : null);

/** Pickup & drop-off workflow for the accepted job: map, progress, contacts, COD and the one next action. */
export function ActiveJob({ task: t, tracking, onFinished }: { task: DeliveryTask; tracking: Tracking; onFinished: () => void }) {
  const markArriving = useRunAction('markArriving');
  const confirmPickup = useRunAction('confirmPickup');
  const startTransit = useRunAction('startTransit');
  const trace = useRunTrace(['PICKED_UP', 'IN_TRANSIT'].includes(t.status) ? t.id : null);
  const [completing, setCompleting] = useState(false);
  const [failing, setFailing] = useState(false);
  const next = NEXT_STEP[t.status];
  const st = metaOf(TASK_STATUS, t.status);
  const beforePickup = ['ACCEPTED', 'ARRIVING_AT_PICKUP'].includes(t.status);
  const here = tracking.position ? { lat: Number(tracking.position.lat.toFixed(6)), lng: Number(tracking.position.lng.toFixed(6)) } : {};
  const accuracy = tracking.position?.accuracy;
  const gate = next?.action === 'confirmPickup' ? pickupGate(t, tracking) : null;
  const pending = markArriving.isPending || confirmPickup.isPending || startTransit.isPending;
  const error = markArriving.error ?? confirmPickup.error ?? startTransit.error;

  const points: MapPoint[] = [];
  if (t.pickupLat !== null && t.pickupLng !== null) points.push({ id: 'p', lat: t.pickupLat, lng: t.pickupLng, kind: 'pickup', label: 'Pickup', selected: beforePickup });
  if (t.dropoffLat !== null && t.dropoffLng !== null) points.push({ id: 'd', lat: t.dropoffLat, lng: t.dropoffLng, kind: 'dropoff', label: 'Drop-off', selected: !beforePickup });
  if (tracking.position) points.push({ id: 'me', lat: tracking.position.lat, lng: tracking.position.lng, kind: 'me', label: 'You' });
  const navigateTo = beforePickup ? mapsLink(t.pickupLat, t.pickupLng) : mapsLink(t.dropoffLat, t.dropoffLng);

  const runNext = () => {
    if (!next) return;
    if (next.action === 'complete') return setCompleting(true);
    const m = next.action === 'markArriving' ? markArriving : next.action === 'confirmPickup' ? confirmPickup : startTransit;
    m.mutate({ taskId: t.id, ...here, ...(accuracy !== null && accuracy !== undefined ? { accuracyM: Math.round(accuracy) } : {}) });
  };

  return (
    <div className="space-y-3">
      <div className="relative">
        <MapView
          className="h-64 rounded-2xl"
          ariaLabel={`Map for ${t.taskNumber}`}
          points={points}
          plannedRoute={t.pickupLat !== null && t.dropoffLat !== null ? [[t.pickupLat, t.pickupLng!], [t.dropoffLat, t.dropoffLng!]] : undefined}
          trace={trace.data?.map((p) => [p.lat, p.lng] as [number, number])}
        />
        {navigateTo && (
          <a href={navigateTo} target="_blank" rel="noreferrer" className="absolute right-3 top-3 z-[400] inline-flex h-10 items-center gap-1.5 rounded-full bg-foreground px-4 text-[13px] font-semibold text-background shadow-md">
            <Navigation className="size-4" /> Navigate
          </a>
        )}
      </div>

      <RunCard className="space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-[17px] font-semibold tracking-tight">{t.orqspaceName}</p>
            <p className="font-mono text-[11.5px] text-muted-foreground">
              {t.taskNumber} · order {t.orderNumber}
            </p>
          </div>
          <StatusDot tone={st.tone} label={st.label} className="text-[12px]" />
        </div>
        <StepTracker steps={STEPS} current={t.status} />

        <ul className="divide-y divide-border rounded-xl border border-border text-[13px]">
          <li className="flex items-start gap-3 p-3">
            <Store className="mt-0.5 size-4 shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="font-medium">Pickup</p>
              <p className="text-muted-foreground">{formatAddress(t.pickupSnapshot)}</p>
            </div>
            {t.pickupSnapshot?.recipientPhone && <CallButton phone={t.pickupSnapshot.recipientPhone} label="Call workspace" />}
          </li>
          <li className="flex items-start gap-3 p-3">
            <UserRound className="mt-0.5 size-4 shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="font-medium">{t.dropoffSnapshot?.recipientName ?? 'Customer'}</p>
              <p className="text-muted-foreground">{t.dropoffSnapshot ? formatAddress(t.dropoffSnapshot) : t.dropoffArea}</p>
              {t.dropoffSnapshot?.landmark && <p className="text-[12px]">Landmark: {t.dropoffSnapshot.landmark}</p>}
            </div>
            {t.dropoffSnapshot?.recipientPhone && <CallButton phone={t.dropoffSnapshot.recipientPhone} label="Call customer" />}
          </li>
        </ul>

        {Number(t.codAmount) > 0 && (
          <p className="flex items-center gap-2 rounded-xl border-2 border-foreground px-3 py-2.5 text-[14px] font-semibold">
            <Banknote className="size-5" /> Collect {formatMoney(t.codAmount)} cash on delivery
          </p>
        )}

        <dl className="grid grid-cols-3 gap-3 border-t border-border pt-3">
          <Fact label="Trip">{formatKm(t.estimatedDistanceKm)}</Fact>
          <Fact label="Rate">{t.ratePerKmSnapshot ? `${formatMoney(t.ratePerKmSnapshot)}/km` : '—'}</Fact>
          <Fact label="Est. earning">{formatMoney(t.estimatedEarnings)}</Fact>
        </dl>
        {tracking.state !== 'active' && (
          <p role="status" className="rounded-lg bg-muted px-3 py-2 text-[12px]">
            {tracking.state === 'denied' ? 'Location is blocked — your distance can’t be recorded, so earnings fall back to the route estimate.' : 'Waiting for GPS…'}
          </p>
        )}
      </RunCard>

      {error && <ErrorNote message={gqlErrorMessage(error)} />}
      {next && (
        <div className="space-y-1.5">
          {gate && (
            <p
              role="status"
              className={`flex items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-[13px] ${gate.ok ? 'bg-muted' : 'border-2 border-foreground font-medium'}`}
            >
              <span>{gate.message}</span>
              {gate.distanceM !== null && <span className="tabular shrink-0 rounded-full bg-foreground px-2.5 py-1 text-[12px] font-semibold text-background">{gate.distanceM} m</span>}
            </p>
          )}
          <BigAction disabled={pending || (gate !== null && !gate.ok)} onClick={runNext}>
            {pending ? 'Updating…' : next.label}
          </BigAction>
          {!gate && <p className="text-center text-[12px] text-muted-foreground">{next.hint}</p>}
        </div>
      )}
      {t.status === 'PICKED_UP' && (
        <BigAction variant="outline" onClick={() => setCompleting(true)}>
          Complete delivery now
        </BigAction>
      )}
      {['PICKED_UP', 'IN_TRANSIT'].includes(t.status) && (
        <BigAction variant="danger" onClick={() => setFailing(true)}>
          Can’t deliver
        </BigAction>
      )}
      {beforePickup && <p className="text-center text-[12px] text-muted-foreground">Need to give this job back? Ask the workspace to reassign it — it stays with you until they do.</p>}

      {completing && (
        <CompleteDeliverySheet
          task={t}
          here={here}
          onClose={(done) => {
            setCompleting(false);
            if (done) onFinished();
          }}
        />
      )}
      {failing && (
        <FailDialog
          task={t}
          here={here}
          onClose={(done) => {
            setFailing(false);
            if (done) onFinished();
          }}
        />
      )}
    </div>
  );
}

function CallButton({ phone, label }: { phone: string; label: string }) {
  return (
    <a href={`tel:${phone}`} aria-label={`${label} ${phone}`} className="flex size-10 shrink-0 items-center justify-center rounded-full border border-border hover:bg-muted">
      <Phone className="size-4" />
    </a>
  );
}

const money = z.string().trim().regex(/^\d{1,10}(\.\d{1,2})?$/, 'Enter the amount like 420 or 420.50');

/** Delivery completion: customer code, proof photo, and COD collection with method + proof. */
function CompleteDeliverySheet({ task: t, here, onClose }: { task: DeliveryTask; here: { lat?: number; lng?: number }; onClose: (done: boolean) => void }) {
  const complete = useRunAction('complete');
  const hasCod = Number(t.codAmount) > 0;
  const schema = z
    .object({
      otp: z.string(),
      recipientName: z.string().max(150).optional(),
      photo: z.object({ id: z.string(), name: z.string(), previewUrl: z.string().nullable() }).nullable(),
      codCollectedAmount: z.string(),
      codMethod: z.enum(['CASH', 'UPI_TO_SELLER', 'OTHER']),
      codProof: z.object({ id: z.string(), name: z.string(), previewUrl: z.string().nullable() }).nullable(),
    })
    .superRefine((v, ctx) => {
      if (t.requiresOtp && !/^\d{4}$/.test(v.otp)) ctx.addIssue({ code: 'custom', path: ['otp'], message: 'Enter the 4-digit code from the customer’s order screen' });
      if (!t.requiresOtp && !v.photo && !(v.recipientName ?? '').trim()) ctx.addIssue({ code: 'custom', path: ['recipientName'], message: 'Add who received it or a photo of the handover' });
      if (hasCod) {
        const r = money.safeParse(v.codCollectedAmount);
        if (!r.success) ctx.addIssue({ code: 'custom', path: ['codCollectedAmount'], message: r.error.issues[0].message });
        if (v.codMethod !== 'CASH' && !v.codProof) ctx.addIssue({ code: 'custom', path: ['codProof'], message: 'Add a photo of the payment confirmation' });
      }
    });
  type Values = z.infer<typeof schema>;
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { otp: '', recipientName: '', photo: null, codCollectedAmount: hasCod ? t.codAmount : '', codMethod: 'CASH', codProof: null },
  });
  const e = form.formState.errors;
  const method = form.watch('codMethod');
  const collected = Number(form.watch('codCollectedAmount'));
  const mismatch = hasCod && Number.isFinite(collected) && collected !== Number(t.codAmount);

  const submit = (v: Values) =>
    complete.mutate(
      {
        taskId: t.id,
        otp: t.requiresOtp ? v.otp : undefined,
        recipientName: v.recipientName?.trim() || undefined,
        photoFileId: v.photo?.id,
        codCollectedAmount: hasCod ? v.codCollectedAmount : undefined,
        codMethod: hasCod ? v.codMethod : undefined,
        codProofFileId: hasCod ? v.codProof?.id : undefined,
        ...here,
      },
      { onSuccess: () => onClose(true) },
    );

  return (
    <Sheet open onOpenChange={(o) => !o && onClose(false)}>
      <SheetContent className="ops-theme inset-x-0 bottom-0 top-auto max-h-[92dvh] max-w-none rounded-t-3xl border-l-0 border-t md:left-1/2 md:max-w-[460px] md:-translate-x-1/2">
        <form noValidate onSubmit={form.handleSubmit(submit)} className="flex min-h-0 flex-1 flex-col">
          <div className="space-y-1 px-5 pb-2 pt-5">
            <SheetTitle className="text-lg">Complete delivery</SheetTitle>
            <SheetDescription>{t.taskNumber} · {t.dropoffSnapshot?.recipientName ?? 'Customer'}</SheetDescription>
          </div>
          <div className="flex-1 space-y-5 overflow-y-auto px-5 pb-4">
            {t.requiresOtp && (
              <div className="space-y-2">
                <p className="text-[13px] font-medium">Customer’s delivery code</p>
                <Controller control={form.control} name="otp" render={({ field }) => <OtpInput value={field.value} onChange={field.onChange} invalid={!!e.otp} describedBy={e.otp ? 'otp-error' : undefined} />} />
                {e.otp ? (
                  <p id="otp-error" role="alert" className="text-[12px] text-destructive">
                    {e.otp.message}
                  </p>
                ) : (
                  <p className="text-[12px] text-muted-foreground">The customer sees it in their Orqland order.</p>
                )}
              </div>
            )}

            {hasCod && (
              <fieldset className="space-y-3 rounded-2xl border-2 border-foreground p-4">
                <legend className="px-1 text-[13px] font-semibold">Cash on delivery · {formatMoney(t.codAmount)}</legend>
                <FormField id="codAmount" label="Amount collected (₹)" error={e.codCollectedAmount?.message}>
                  <Input inputMode="decimal" className="tabular h-12 text-lg font-semibold" {...form.register('codCollectedAmount')} />
                </FormField>
                {mismatch && <p className="text-[12px]">This differs from the expected amount — the workspace will review it.</p>}
                <FormField id="codMethod" label="Paid by">
                  <Select className="h-11" {...form.register('codMethod')}>
                    <option value="CASH">Cash</option>
                    <option value="UPI_TO_SELLER">UPI to the seller</option>
                    <option value="OTHER">Other</option>
                  </Select>
                </FormField>
                <Controller
                  control={form.control}
                  name="codProof"
                  render={({ field }) => (
                    <PhotoCapture purpose="COD_PROOF" label="Payment proof" optional={method === 'CASH'} hint="Screenshot or photo of the UPI confirmation" value={field.value} onChange={field.onChange} error={e.codProof?.message} />
                  )}
                />
              </fieldset>
            )}

            <Controller
              control={form.control}
              name="photo"
              render={({ field }) => (
                <CameraCapture purpose="PROOF_OF_DELIVERY" label="Proof-of-delivery photo" optional hint="Photo of the parcel at the door or with the customer" value={field.value} onChange={field.onChange} />
              )}
            />
            <FormField id="recipientName" label="Received by" optional={t.requiresOtp} error={e.recipientName?.message}>
              <Input className="h-11" autoComplete="off" {...form.register('recipientName')} />
            </FormField>
            {complete.error && <ErrorNote message={gqlErrorMessage(complete.error)} />}
          </div>
          <div className="border-t border-border p-4">
            <BigAction type="submit" disabled={complete.isPending}>
              {complete.isPending ? 'Completing…' : 'Mark as delivered'}
            </BigAction>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}

const FAIL_REASONS = ['Customer not reachable', 'Customer refused the order', 'Incorrect or incomplete address', 'Cannot access the location', 'Vehicle breakdown', 'Accident or emergency', 'Other'] as const;

function FailDialog({ task: t, here, onClose }: { task: DeliveryTask; here: { lat?: number; lng?: number }; onClose: (done: boolean) => void }) {
  const fail = useRunAction('fail');
  const schema = z.object({ reason: z.enum(FAIL_REASONS), detail: z.string().max(300).optional() }).superRefine((v, ctx) => {
    if (v.reason === 'Other' && !(v.detail ?? '').trim()) ctx.addIssue({ code: 'custom', path: ['detail'], message: 'Describe what happened' });
  });
  const form = useForm<z.infer<typeof schema>>({ resolver: zodResolver(schema), defaultValues: { reason: 'Customer not reachable', detail: '' } });
  const reason = form.watch('reason');
  return (
    <Dialog open onOpenChange={(o) => !o && onClose(false)}>
      <DialogContent className="ops-theme">
        <form
          noValidate
          onSubmit={form.handleSubmit((v) => fail.mutate({ taskId: t.id, reason: [v.reason, v.detail?.trim()].filter(Boolean).join(' — '), ...here }, { onSuccess: () => onClose(true) }))}
          className="grid gap-4"
        >
          <DialogHeader>
            <DialogTitle>Can’t complete {t.taskNumber}</DialogTitle>
            <DialogDescription>The workspace is alerted and decides whether to retry or return the order. Bring the parcel back if they ask you to.</DialogDescription>
          </DialogHeader>
          {reason === 'Accident or emergency' && <p className="rounded-lg border-2 border-destructive px-3 py-2 text-[13px] font-medium">If anyone is hurt, call 112 first. Then raise an Emergency ticket from Help.</p>}
          <fieldset className="grid gap-2">
            <legend className="sr-only">What happened?</legend>
            {FAIL_REASONS.map((r) => (
              <label key={r} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border border-border px-3 has-[:checked]:border-foreground has-[:checked]:bg-muted">
                <input type="radio" value={r} className="size-4 accent-foreground" {...form.register('reason')} />
                <span className="text-[14px]">{r}</span>
              </label>
            ))}
          </fieldset>
          <FormField id="failDetail" label="Details" optional={reason !== 'Other'} error={form.formState.errors.detail?.message}>
            <Input className="h-11" {...form.register('detail')} />
          </FormField>
          {fail.error && <ErrorNote message={gqlErrorMessage(fail.error)} />}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onClose(false)}>
              Back
            </Button>
            <Button type="submit" variant="destructive" disabled={fail.isPending}>
              Report failed delivery
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
