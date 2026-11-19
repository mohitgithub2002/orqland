'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowLeft, ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';
import { FormField, Select } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { ErrorNote } from '@/components/ui/panel';
import { gqlErrorMessage } from '@/features/dashboard/common/utils/gqlError';
import { cn } from '@/lib/utils';
import { useRunAction } from '../hooks/useRun';
import { VEHICLE_OPTIONS, type AgentProfile } from '../types/run.types';
import { BigAction, PhotoCapture, RunCard } from './RunPrimitives';

const file = z.object({ id: z.string(), name: z.string(), previewUrl: z.string().nullable() }).nullable();
const isAdult = (dob: string) => {
  const d = new Date(`${dob}T00:00:00`);
  const now = new Date();
  const age = now.getFullYear() - d.getFullYear() - (now < new Date(now.getFullYear(), d.getMonth(), d.getDate()) ? 1 : 0);
  return age >= 18;
};

const schema = z.object({
  licenceNumber: z
    .string()
    .trim()
    .min(10, 'Licence numbers have at least 10 characters (e.g. TN09 2015 0001234)')
    .max(24, 'That is too long for a licence number')
    .regex(/^[A-Za-z0-9 -]+$/, 'Use letters, numbers, spaces or hyphens only'),
  dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Enter your date of birth as on the licence').refine(isAdult, 'Delivery agents must be at least 18'),
  licenceFront: file.refine((f) => !!f, 'Add a photo of the front of your licence'),
  licenceBack: file.refine((f) => !!f, 'Add a photo of the back of your licence'),
  vehicleNumber: z
    .string()
    .trim()
    .min(6, 'Enter the full registration number (e.g. TN09 AB 1234)')
    .max(16, 'That is too long for a registration number')
    .regex(/^[A-Za-z0-9 -]+$/, 'Use letters, numbers, spaces or hyphens only'),
  vehicleCategory: z.enum(['SCOOTER', 'MOTORCYCLE', 'THREE_WHEELER', 'CAR', 'VAN'], { message: 'Choose your vehicle type' }),
  vehicleRc: file,
  consent: z.boolean().refine((v) => v, 'Consent is required to verify your documents'),
});
type Values = z.input<typeof schema>;

const STEPS = [
  { title: 'Driving licence', fields: ['licenceNumber', 'dateOfBirth', 'licenceFront', 'licenceBack'] as const },
  { title: 'Vehicle', fields: ['vehicleNumber', 'vehicleCategory', 'vehicleRc'] as const },
  { title: 'Review & consent', fields: ['consent'] as const },
];

/**
 * Agent registration & KYC (Module A): licence number + date of birth + licence photos, vehicle details,
 * explicit consent. Verified through Surepass by the engine; the role is granted only if every check passes.
 */
export function RegistrationWizard({ onCancel, onDone }: { onCancel: () => void; onDone: (profile: AgentProfile) => void }) {
  const [step, setStep] = useState(0);
  const register = useRunAction('register');
  const form = useForm<Values, unknown, z.output<typeof schema>>({
    resolver: zodResolver(schema),
    mode: 'onTouched',
    defaultValues: { licenceNumber: '', dateOfBirth: '', licenceFront: null, licenceBack: null, vehicleNumber: '', vehicleCategory: undefined, vehicleRc: null, consent: false },
  });
  const e = form.formState.errors;
  const v = form.watch();

  const next = async () => {
    if (await form.trigger([...STEPS[step].fields])) setStep((s) => s + 1);
  };
  const submit = form.handleSubmit((values) =>
    register.mutate(
      {
        licenceNumber: values.licenceNumber,
        dateOfBirth: values.dateOfBirth,
        vehicleNumber: values.vehicleNumber,
        vehicleCategory: values.vehicleCategory,
        licenceFrontFileId: values.licenceFront!.id,
        licenceBackFileId: values.licenceBack!.id,
        vehicleRcFileId: values.vehicleRc?.id,
        consent: true,
      },
      { onSuccess: (p) => onDone(p as AgentProfile) },
    ),
  );

  return (
    <div className="mx-auto w-full max-w-[460px] space-y-4">
      <div className="flex items-center gap-2">
        <button type="button" onClick={step === 0 ? onCancel : () => setStep(step - 1)} className="rounded-full p-2 hover:bg-card" aria-label={step === 0 ? 'Cancel registration' : 'Previous step'}>
          <ArrowLeft className="size-5" />
        </button>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-medium uppercase tracking-[0.1em] text-muted-foreground">
            Step {step + 1} of {STEPS.length}
          </p>
          <h2 className="text-lg font-semibold tracking-tight">{STEPS[step].title}</h2>
        </div>
      </div>
      <div className="flex gap-1.5" aria-hidden>
        {STEPS.map((s, i) => (
          <span key={s.title} className={cn('h-1 flex-1 rounded-full', i <= step ? 'bg-foreground' : 'bg-border')} />
        ))}
      </div>

      <form onSubmit={submit} noValidate>
        <RunCard className="space-y-4">
          {step === 0 && (
            <>
              <FormField id="licenceNumber" label="Driving licence number" error={e.licenceNumber?.message} hint="As printed on your licence. Stored encrypted.">
                <Input autoComplete="off" autoCapitalize="characters" className="h-11 font-mono uppercase" placeholder="TN09 2015 0001234" {...form.register('licenceNumber')} />
              </FormField>
              <FormField id="dateOfBirth" label="Date of birth" error={e.dateOfBirth?.message} hint="Needed by the licence verification service.">
                <Input type="date" className="h-11" max={new Date().toISOString().slice(0, 10)} {...form.register('dateOfBirth')} />
              </FormField>
              <Controller
                control={form.control}
                name="licenceFront"
                render={({ field }) => <PhotoCapture purpose="LICENCE_FRONT" label="Licence — front" value={field.value} onChange={(f) => { field.onChange(f); if (e.licenceFront) void form.trigger('licenceFront'); }} error={e.licenceFront?.message} />}
              />
              <Controller
                control={form.control}
                name="licenceBack"
                render={({ field }) => <PhotoCapture purpose="LICENCE_BACK" label="Licence — back" value={field.value} onChange={(f) => { field.onChange(f); if (e.licenceBack) void form.trigger('licenceBack'); }} error={e.licenceBack?.message} />}
              />
              <p className="text-[12px] text-muted-foreground">Photos are stored privately. Workspaces never see your documents — only Orqland’s verification team can.</p>
            </>
          )}

          {step === 1 && (
            <>
              <FormField id="vehicleNumber" label="Vehicle registration number" error={e.vehicleNumber?.message}>
                <Input autoComplete="off" autoCapitalize="characters" className="h-11 font-mono uppercase" placeholder="TN09 AB 1234" {...form.register('vehicleNumber')} />
              </FormField>
              <FormField id="vehicleCategory" label="Vehicle type" error={e.vehicleCategory?.message}>
                <Select className="h-11" defaultValue="" {...form.register('vehicleCategory')}>
                  <option value="" disabled>
                    Choose…
                  </option>
                  {VEHICLE_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </Select>
              </FormField>
              <Controller
                control={form.control}
                name="vehicleRc"
                render={({ field }) => (
                  <PhotoCapture purpose="VEHICLE_RC" label="Registration certificate (RC)" optional accept="image/jpeg,image/png,image/webp,application/pdf" hint="Photo or PDF · speeds up manual review" value={field.value ?? null} onChange={field.onChange} />
                )}
              />
            </>
          )}

          {step === 2 && (
            <>
              <dl className="divide-y divide-border rounded-xl border border-border text-[13px]">
                <ReviewRow label="Licence">{v.licenceNumber.toUpperCase()}</ReviewRow>
                <ReviewRow label="Date of birth">{v.dateOfBirth}</ReviewRow>
                <ReviewRow label="Licence photos">{v.licenceFront && v.licenceBack ? 'Front and back added' : 'Missing'}</ReviewRow>
                <ReviewRow label="Vehicle">
                  {v.vehicleNumber.toUpperCase()} · {VEHICLE_OPTIONS.find((o) => o.value === v.vehicleCategory)?.label}
                </ReviewRow>
                <ReviewRow label="RC document">{v.vehicleRc ? 'Added' : 'Not added'}</ReviewRow>
              </dl>
              <div className="space-y-2 rounded-xl bg-muted p-3 text-[12.5px] leading-5">
                <p className="flex items-center gap-1.5 font-medium">
                  <ShieldCheck className="size-4" /> How verification works
                </p>
                <ul className="list-disc space-y-0.5 pl-5 text-muted-foreground">
                  <li>Your licence and vehicle are checked with the government records service (Surepass).</li>
                  <li>Re-verification: licence every 12 months, vehicle every 4 months.</li>
                  <li>One licence and vehicle can be registered to only one Orq ID.</li>
                </ul>
              </div>
              <label className="flex items-start gap-3 text-[13px]">
                <input type="checkbox" className="mt-0.5 size-5 accent-foreground" aria-invalid={e.consent ? true : undefined} aria-describedby={e.consent ? 'consent-error' : undefined} {...form.register('consent')} />
                <span>I consent to Orqland verifying my driving licence and vehicle registration and processing these details for delivery work.</span>
              </label>
              {e.consent && (
                <p id="consent-error" role="alert" className="text-[12px] text-destructive">
                  {e.consent.message}
                </p>
              )}
              {register.error && <ErrorNote message={gqlErrorMessage(register.error)} />}
            </>
          )}
        </RunCard>

        <div className="mt-4">
          {step < STEPS.length - 1 ? (
            <BigAction onClick={() => void next()}>Continue</BigAction>
          ) : (
            <BigAction type="submit" disabled={register.isPending}>
              {register.isPending ? 'Verifying with Surepass…' : 'Submit for verification'}
            </BigAction>
          )}
        </div>
      </form>
    </div>
  );
}

function ReviewRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3 px-3 py-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right font-medium">{children}</dd>
    </div>
  );
}
