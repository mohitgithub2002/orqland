'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Banknote, MapPin, Store } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ErrorNote } from '@/components/ui/panel';
import type { DeliveryOffer, DeliveryTask } from '@/features/dashboard/delivery/types/delivery.types';
import { formatKm, formatMoney } from '@/features/dashboard/common/utils/format';
import { gqlErrorMessage } from '@/features/dashboard/common/utils/gqlError';
import { useRunAction } from '../hooks/useRun';
import { BigAction, CountdownRing, Fact, RunCard } from './RunPrimitives';

/** Rough city travel time for display only (≈20 km/h + handover). Clearly labelled as an estimate. */
export const estimateMinutes = (km: number | null) => (km === null ? null : Math.round((km / 20) * 60 + 5));

const DECLINE_REASONS = ['Too far from me', 'Vehicle problem', 'Taking a break', 'Already busy', 'Other'] as const;

/**
 * Delivery offer & acceptance (guide §5 "Delivery request behavior"): workspace, pickup → drop-off area,
 * distances, rate, estimated earnings (marked as an estimate), COD, and the response window.
 */
export function OfferCard({ offer, task, onAccepted }: { offer: DeliveryOffer; task: DeliveryTask; onAccepted?: (taskId: string) => void }) {
  const accept = useRunAction('acceptOffer');
  const [declining, setDeclining] = useState(false);
  const tripKm = task.estimatedDistanceKm ? Number(task.estimatedDistanceKm) : null;
  const toPickupKm = offer.distanceToPickupKm ? Number(offer.distanceToPickupKm) : null;
  const total = Math.max(15, Math.round((new Date(offer.expiresAt).getTime() - new Date(offer.offeredAt).getTime()) / 1000));
  const minutes = estimateMinutes(tripKm === null ? null : tripKm + (toPickupKm ?? 0));

  return (
    <RunCard as="article" className="space-y-4" aria-label={`Delivery offer from ${task.orqspaceName}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-medium uppercase tracking-[0.1em] text-muted-foreground">New delivery request</p>
          <p className="mt-0.5 truncate text-[17px] font-semibold tracking-tight">{task.orqspaceName}</p>
          <p className="font-mono text-[11.5px] text-muted-foreground">{task.taskNumber}</p>
        </div>
        <CountdownRing expiresAt={offer.expiresAt} totalSeconds={total} />
      </div>

      <ol className="relative space-y-3 pl-6 text-[13px]">
        <span aria-hidden className="absolute left-[7px] top-2 h-[calc(100%-16px)] w-px bg-border" />
        <li className="relative">
          <Store aria-hidden className="absolute -left-6 top-0.5 size-4 rounded-sm bg-foreground p-0.5 text-background" />
          <span className="block font-medium">Pickup · {[task.pickupSnapshot?.street, task.pickupSnapshot?.city].filter(Boolean).join(', ') || 'Workspace'}</span>
          <span className="text-[12px] text-muted-foreground">{toPickupKm !== null ? `${formatKm(toPickupKm)} from you` : 'Distance from you unavailable — turn on GPS'}</span>
        </li>
        <li className="relative">
          <MapPin aria-hidden className="absolute -left-6 top-0.5 size-4" />
          <span className="block font-medium">Drop-off · {task.dropoffArea ?? 'Customer area'}</span>
          <span className="text-[12px] text-muted-foreground">Exact address and contact appear after you accept</span>
        </li>
      </ol>

      <dl className="grid grid-cols-3 gap-3 border-y border-border py-3">
        <Fact label="Trip">{formatKm(tripKm)}</Fact>
        <Fact label="Time ≈">{minutes ? `${minutes} min` : '—'}</Fact>
        <Fact label="Rate">{formatMoney(offer.ratePerKmOffered)}/km</Fact>
      </dl>

      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[0.1em] text-muted-foreground">Estimated earnings</p>
          <p className="tabular text-[26px] font-semibold leading-tight tracking-tight">{formatMoney(task.estimatedEarnings)}</p>
          <p className="text-[11.5px] text-muted-foreground">Estimate · final amount uses the approved distance</p>
        </div>
        {Number(task.codAmount) > 0 && (
          <p className="flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-[12.5px] font-medium">
            <Banknote className="size-4" /> Collect {formatMoney(task.codAmount)}
          </p>
        )}
      </div>

      {accept.error && <ErrorNote message={gqlErrorMessage(accept.error)} />}
      <div className="grid grid-cols-[1fr_2fr] gap-2">
        <BigAction variant="outline" onClick={() => setDeclining(true)}>
          Decline
        </BigAction>
        <BigAction disabled={accept.isPending} onClick={() => accept.mutate({ offerId: offer.id }, { onSuccess: () => onAccepted?.(task.id) })}>
          {accept.isPending ? 'Accepting…' : 'Accept delivery'}
        </BigAction>
      </div>
      {declining && <DeclineDialog offerId={offer.id} onClose={() => setDeclining(false)} />}
    </RunCard>
  );
}

const declineSchema = z.object({ reason: z.enum(DECLINE_REASONS), other: z.string().max(200).optional() }).superRefine((v, ctx) => {
  if (v.reason === 'Other' && !(v.other ?? '').trim()) ctx.addIssue({ code: 'custom', path: ['other'], message: 'Tell the workspace why' });
});

function DeclineDialog({ offerId, onClose }: { offerId: string; onClose: () => void }) {
  const decline = useRunAction('declineOffer');
  const form = useForm<z.infer<typeof declineSchema>>({ resolver: zodResolver(declineSchema), defaultValues: { reason: 'Too far from me', other: '' } });
  const reason = form.watch('reason');
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="ops-theme">
        <form noValidate onSubmit={form.handleSubmit((v) => decline.mutate({ offerId, reason: v.reason === 'Other' ? v.other : v.reason }, { onSuccess: onClose }))} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>Decline this delivery?</DialogTitle>
            <DialogDescription>It goes to the next available agent. Your reason is shared with the workspace.</DialogDescription>
          </DialogHeader>
          <fieldset className="grid gap-2">
            <legend className="sr-only">Reason</legend>
            {DECLINE_REASONS.map((r) => (
              <label key={r} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border border-border px-3 has-[:checked]:border-foreground has-[:checked]:bg-muted">
                <input type="radio" value={r} className="size-4 accent-foreground" {...form.register('reason')} />
                <span className="text-[14px]">{r}</span>
              </label>
            ))}
          </fieldset>
          {reason === 'Other' && (
            <div>
              <input aria-label="Other reason" className="h-11 w-full rounded-lg border border-input px-3 text-[14px]" {...form.register('other')} />
              {form.formState.errors.other && (
                <p role="alert" className="mt-1 text-[12px] text-destructive">
                  {form.formState.errors.other.message}
                </p>
              )}
            </div>
          )}
          {decline.error && <ErrorNote message={gqlErrorMessage(decline.error)} />}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Keep offer
            </Button>
            <Button type="submit" disabled={decline.isPending}>
              Decline
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
