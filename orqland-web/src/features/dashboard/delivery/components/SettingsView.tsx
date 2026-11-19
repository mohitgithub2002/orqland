'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { LocateFixed } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { FormField, Select } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { MapView } from '@/components/ui/map-view';
import { ErrorNote, Panel } from '@/components/ui/panel';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { gqlErrorMessage } from '@/features/dashboard/common/utils/gqlError';
import { useDeliveryAction, useDeliverySettings } from '../hooks/useDelivery';

const text = (max: number) => z.string().max(max, `Keep this under ${max} characters`).optional();
const schema = z.object({
  doorNo: text(50),
  street: z.string().trim().min(2, 'Enter the street of the pickup point').max(255),
  landmark: text(255),
  city: z.string().trim().min(2, 'Enter the city').max(100),
  state: text(100),
  pincode: z.string().regex(/^\d{6}$/, 'Enter a 6-digit PIN code').or(z.literal('')).optional(),
  recipientPhone: z.string().regex(/^[+\d][\d\s-]{6,18}$/, 'Enter a valid phone number').or(z.literal('')).optional(),
  pickupLat: z.coerce.number({ message: 'Enter a latitude' }).min(-90, 'Latitude is between -90 and 90').max(90, 'Latitude is between -90 and 90'),
  pickupLng: z.coerce.number({ message: 'Enter a longitude' }).min(-180, 'Longitude is between -180 and 180').max(180, 'Longitude is between -180 and 180'),
  autoAssignEnabled: z.boolean(),
  assignmentStrategy: z.enum(['NEAREST', 'LEAST_LOADED', 'HYBRID']),
  offerTimeoutSeconds: z.coerce.number().int('Whole seconds only').min(15, 'At least 15 seconds').max(900, 'At most 900 seconds'),
  maxOfferAttempts: z.coerce.number().int().min(1, 'At least 1').max(20, 'At most 20'),
  maxPickupRadiusKm: z.coerce.number().min(1, 'At least 1 km').max(200, 'At most 200 km'),
  requireDeliveryOtp: z.boolean(),
});
type Input_ = z.input<typeof schema>;
type Output = z.output<typeof schema>;

/** Pickup point, assignment rules and proof-of-delivery policy for the workspace. */
export function SettingsView({ orqspaceId }: { orqspaceId: string }) {
  const settings = useDeliverySettings(orqspaceId);
  const update = useDeliveryAction('updateSettings');
  const [saved, setSaved] = useState(false);
  const [locError, setLocError] = useState<string | null>(null);
  const form = useForm<Input_, unknown, Output>({ resolver: zodResolver(schema) });
  const e = form.formState.errors;

  useEffect(() => {
    const s = settings.data;
    if (!s) return;
    form.reset({
      doorNo: s.pickupAddress?.doorNo ?? '',
      street: s.pickupAddress?.street ?? '',
      landmark: s.pickupAddress?.landmark ?? '',
      city: s.pickupAddress?.city ?? '',
      state: s.pickupAddress?.state ?? '',
      pincode: s.pickupAddress?.pincode ?? '',
      recipientPhone: s.pickupAddress?.recipientPhone ?? '',
      pickupLat: s.pickupLat ?? '',
      pickupLng: s.pickupLng ?? '',
      autoAssignEnabled: s.autoAssignEnabled,
      assignmentStrategy: s.assignmentStrategy,
      offerTimeoutSeconds: s.offerTimeoutSeconds,
      maxOfferAttempts: s.maxOfferAttempts,
      maxPickupRadiusKm: Number(s.maxPickupRadiusKm),
      requireDeliveryOtp: s.requireDeliveryOtp,
    });
  }, [settings.data, form]);

  if (settings.isError) return <ErrorNote message={gqlErrorMessage(settings.error)} onRetry={() => void settings.refetch()} />;
  if (!settings.data) return <Skeleton className="h-96 w-full" />;

  const lat = Number(form.watch('pickupLat'));
  const lng = Number(form.watch('pickupLng'));
  const hasPoint = Number.isFinite(lat) && Number.isFinite(lng) && !!form.watch('pickupLat') && !!form.watch('pickupLng');

  const locate = () => {
    setLocError(null);
    if (!navigator.geolocation) return setLocError('Location is not available in this browser — enter the coordinates.');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        form.setValue('pickupLat', Number(pos.coords.latitude.toFixed(6)), { shouldDirty: true, shouldValidate: true });
        form.setValue('pickupLng', Number(pos.coords.longitude.toFixed(6)), { shouldDirty: true, shouldValidate: true });
      },
      (err) => setLocError(err.code === err.PERMISSION_DENIED ? 'Location permission was denied — enter the coordinates.' : 'Could not get your location — enter the coordinates.'),
    );
  };

  const submit = form.handleSubmit((v) => {
    setSaved(false);
    update.mutate(
      {
        orqspaceId,
        pickupLat: v.pickupLat,
        pickupLng: v.pickupLng,
        pickupAddress: { street: v.street, doorNo: v.doorNo, landmark: v.landmark, city: v.city, state: v.state, pincode: v.pincode || undefined, recipientPhone: v.recipientPhone || undefined },
        autoAssignEnabled: v.autoAssignEnabled,
        assignmentStrategy: v.assignmentStrategy,
        offerTimeoutSeconds: v.offerTimeoutSeconds,
        maxOfferAttempts: v.maxOfferAttempts,
        maxPickupRadiusKm: v.maxPickupRadiusKm,
        requireDeliveryOtp: v.requireDeliveryOtp,
      },
      { onSuccess: () => setSaved(true) },
    );
  });

  return (
    <form onSubmit={submit} noValidate className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,0.8fr)]">
      <div className="space-y-5">
        <Panel title="Pickup point" description="Where agents collect orders. Required for agent delivery, distance estimates and earnings." bodyClassName="grid gap-3 p-4 sm:grid-cols-2">
          <FormField id="doorNo" label="Shop / door no." optional error={e.doorNo?.message}>
            <Input {...form.register('doorNo')} />
          </FormField>
          <FormField id="street" label="Street" error={e.street?.message}>
            <Input {...form.register('street')} />
          </FormField>
          <FormField id="landmark" label="Landmark" optional>
            <Input {...form.register('landmark')} />
          </FormField>
          <FormField id="city" label="City" error={e.city?.message}>
            <Input {...form.register('city')} />
          </FormField>
          <FormField id="state" label="State" optional>
            <Input {...form.register('state')} />
          </FormField>
          <FormField id="pincode" label="PIN code" optional error={e.pincode?.message}>
            <Input inputMode="numeric" {...form.register('pincode')} />
          </FormField>
          <FormField id="recipientPhone" label="Pickup contact phone" optional error={e.recipientPhone?.message}>
            <Input type="tel" {...form.register('recipientPhone')} />
          </FormField>
          <span className="hidden sm:block" />
          <FormField id="pickupLat" label="Latitude" error={e.pickupLat?.message}>
            <Input inputMode="decimal" {...form.register('pickupLat')} />
          </FormField>
          <FormField id="pickupLng" label="Longitude" error={e.pickupLng?.message}>
            <Input inputMode="decimal" {...form.register('pickupLng')} />
          </FormField>
          <div className="sm:col-span-2">
            <Button type="button" variant="outline" size="sm" onClick={locate}>
              <LocateFixed /> Use this device’s location
            </Button>
            {locError && <ErrorNote className="mt-2" message={locError} />}
          </div>
        </Panel>

        <Panel title="Assignment" bodyClassName="grid gap-4 p-4">
          <ToggleRow
            title="Automatic assignment by default"
            body="Offer each delivery to the best available connected agent, then the next one if it is declined or expires."
            control={<Controller control={form.control} name="autoAssignEnabled" render={({ field }) => <Switch aria-label="Automatic assignment" checked={!!field.value} onCheckedChange={field.onChange} />} />}
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <FormField id="assignmentStrategy" label="Ranking">
              <Select {...form.register('assignmentStrategy')}>
                <option value="NEAREST">Nearest agent to pickup</option>
                <option value="LEAST_LOADED">Least busy agent</option>
                <option value="HYBRID">Balanced (distance + workload)</option>
              </Select>
            </FormField>
            <FormField id="maxPickupRadiusKm" label="Max distance to pickup (km)" error={e.maxPickupRadiusKm?.message}>
              <Input inputMode="decimal" {...form.register('maxPickupRadiusKm')} />
            </FormField>
            <FormField id="offerTimeoutSeconds" label="Offer expires after (seconds)" error={e.offerTimeoutSeconds?.message}>
              <Input inputMode="numeric" {...form.register('offerTimeoutSeconds')} />
            </FormField>
            <FormField id="maxOfferAttempts" label="Agents to try before alerting you" error={e.maxOfferAttempts?.message}>
              <Input inputMode="numeric" {...form.register('maxOfferAttempts')} />
            </FormField>
          </div>
        </Panel>

        <Panel title="Proof of delivery" bodyClassName="p-4">
          <ToggleRow
            title="Require the customer’s delivery code"
            body="The customer sees a 4-digit code in their order and gives it to the agent on delivery."
            control={<Controller control={form.control} name="requireDeliveryOtp" render={({ field }) => <Switch aria-label="Require delivery code" checked={!!field.value} onCheckedChange={field.onChange} />} />}
          />
        </Panel>

        {update.error && <ErrorNote message={gqlErrorMessage(update.error)} />}
        <div className="flex items-center gap-3">
          <Button type="submit" disabled={update.isPending}>
            {update.isPending ? 'Saving…' : 'Save settings'}
          </Button>
          <span aria-live="polite" className="text-[12.5px] text-muted-foreground">
            {saved && 'Saved.'}
          </span>
        </div>
      </div>

      <div className="space-y-2">
        <MapView className="h-[360px]" ariaLabel="Pickup point" interactive points={hasPoint ? [{ id: 'pickup', lat, lng, kind: 'pickup', label: 'Pickup point' }] : []} />
        <p className="text-[12px] text-muted-foreground">{hasPoint ? `${lat.toFixed(5)}, ${lng.toFixed(5)}` : 'Enter coordinates to place the pickup point.'}</p>
      </div>
    </form>
  );
}

function ToggleRow({ title, body, control }: { title: string; body: string; control: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span>
        <span className="block text-[13px] font-medium">{title}</span>
        <span className="block text-[12px] text-muted-foreground">{body}</span>
      </span>
      {control}
    </div>
  );
}
