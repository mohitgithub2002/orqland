'use client';

import { Camera, Check, ImageUp, Loader2, X } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import { deliveryFilesService, type DeliveryFilePurpose } from '@/features/dashboard/common/services/delivery-files.service';
import { cn } from '@/lib/utils';

/** White rounded surface used for every Run card. */
export function RunCard({ children, className, as: As = 'section', ...rest }: { children: React.ReactNode; className?: string; as?: 'section' | 'div' | 'article' } & React.HTMLAttributes<HTMLElement>) {
  return (
    <As className={cn('rounded-2xl border border-border bg-card p-4', className)} {...rest}>
      {children}
    </As>
  );
}

/** Full-width, thumb-sized primary action (≥ 52px tall). */
export function BigAction({ children, className, variant = 'ink', ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'ink' | 'outline' | 'danger' }) {
  return (
    <button
      type="button"
      className={cn(
        'flex h-13 min-h-[52px] w-full items-center justify-center gap-2 rounded-xl px-4 text-[15px] font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground disabled:opacity-45 [&_svg]:size-5',
        variant === 'ink' && 'bg-foreground text-background hover:bg-foreground/90',
        variant === 'outline' && 'border border-border bg-card text-foreground hover:bg-muted',
        variant === 'danger' && 'border border-destructive/40 bg-card text-destructive hover:bg-destructive/5',
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

/** Horizontal step progress: Accepted → Arriving → Picked up → In transit → Delivered. */
export function StepTracker({ steps, current }: { steps: { key: string; label: string }[]; current: string }) {
  const index = Math.max(0, steps.findIndex((s) => s.key === current));
  return (
    <ol className="flex items-start" aria-label="Delivery progress">
      {steps.map((s, i) => {
        const done = i < index;
        const active = i === index;
        return (
          <li key={s.key} className="relative flex flex-1 flex-col items-center gap-1 text-center" aria-current={active ? 'step' : undefined}>
            {i > 0 && <span aria-hidden className={cn('absolute right-1/2 top-[9px] h-0.5 w-full', i <= index ? 'bg-foreground' : 'bg-border')} />}
            <span
              aria-hidden
              className={cn(
                'relative z-10 flex size-5 items-center justify-center rounded-full border-2 bg-card',
                done && 'border-foreground bg-foreground text-background',
                active && 'border-foreground',
                !done && !active && 'border-border',
              )}
            >
              {done ? <Check className="size-3" strokeWidth={3} /> : active ? <span className="size-2 rounded-full bg-foreground" /> : null}
            </span>
            <span className={cn('text-[10.5px] leading-tight', active ? 'font-semibold text-foreground' : 'text-muted-foreground')}>{s.label}</span>
          </li>
        );
      })}
    </ol>
  );
}

/** Seconds remaining as a ring; announces only at 30s / 10s / expiry. */
export function CountdownRing({ expiresAt, totalSeconds }: { expiresAt: string; totalSeconds: number }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const left = Math.max(0, Math.round((new Date(expiresAt).getTime() - now) / 1000));
  const pct = Math.min(1, left / Math.max(totalSeconds, 1));
  const r = 20;
  const c = 2 * Math.PI * r;
  return (
    <span className="relative inline-flex size-12 items-center justify-center" role="timer" aria-label={left > 0 ? `${left} seconds left to respond` : 'Offer expired'}>
      <svg viewBox="0 0 48 48" className="absolute inset-0 -rotate-90" aria-hidden>
        <circle cx="24" cy="24" r={r} fill="none" stroke="var(--border)" strokeWidth="3" />
        <circle cx="24" cy="24" r={r} fill="none" stroke={left <= 10 ? 'var(--destructive)' : 'var(--foreground)'} strokeWidth="3" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - pct)} />
      </svg>
      <span className="tabular text-[13px] font-semibold">{left <= 0 ? '—' : left >= 60 ? `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}` : `${left}s`}</span>
    </span>
  );
}

/** 4-digit delivery code input with separate, large boxes (numeric keypad on mobile). */
export function OtpInput({ value, onChange, invalid, describedBy }: { value: string; onChange: (v: string) => void; invalid?: boolean; describedBy?: string }) {
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const digits = value.padEnd(4, ' ').slice(0, 4).split('');
  return (
    <div className="flex gap-2" role="group" aria-label="Delivery code" aria-describedby={describedBy}>
      {digits.map((d, i) => (
        <input
          key={i}
          ref={(el) => {
            refs.current[i] = el;
          }}
          inputMode="numeric"
          autoComplete={i === 0 ? 'one-time-code' : 'off'}
          aria-label={`Digit ${i + 1}`}
          aria-invalid={invalid || undefined}
          maxLength={1}
          value={d.trim()}
          onChange={(e) => {
            const ch = e.target.value.replace(/\D/g, '').slice(-1);
            const next = (value.slice(0, i) + ch + value.slice(i + 1)).slice(0, 4);
            onChange(next.replace(/\s/g, ''));
            if (ch && i < 3) refs.current[i + 1]?.focus();
          }}
          onKeyDown={(e) => {
            if (e.key === 'Backspace' && !d.trim() && i > 0) refs.current[i - 1]?.focus();
          }}
          onPaste={(e) => {
            const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 4);
            if (pasted) {
              e.preventDefault();
              onChange(pasted);
              refs.current[Math.min(pasted.length, 3)]?.focus();
            }
          }}
          className={cn(
            'tabular size-14 rounded-xl border bg-card text-center text-2xl font-semibold focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-foreground',
            invalid ? 'border-destructive' : 'border-input',
          )}
        />
      ))}
    </div>
  );
}

export interface CapturedFile {
  id: string;
  name: string;
  previewUrl: string | null;
}

/**
 * Photo capture → immediate upload to the engine (private storage). Uses the rear camera on phones
 * (`capture="environment"`), falls back to the file picker on desktop. Reports the uploaded file id.
 */
export function PhotoCapture({
  purpose,
  label,
  hint,
  value,
  onChange,
  error,
  accept = 'image/jpeg,image/png,image/webp',
  optional,
}: {
  purpose: DeliveryFilePurpose;
  label: string;
  hint?: string;
  value: CapturedFile | null;
  onChange: (file: CapturedFile | null) => void;
  error?: string;
  accept?: string;
  optional?: boolean;
}) {
  const id = useId();
  const [busy, setBusy] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const message = uploadError ?? error;

  const pick = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    setUploadError(null);
    try {
      const uploaded = await deliveryFilesService.upload(file, purpose);
      onChange({ id: uploaded.id, name: file.name, previewUrl: file.type.startsWith('image/') ? URL.createObjectURL(file) : null });
    } catch (e) {
      setUploadError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between text-[12px] font-medium">
        <span id={`${id}-label`}>{label}</span>
        {optional && <span className="font-normal text-muted-foreground">Optional</span>}
      </div>
      {value ? (
        <div className="flex items-center gap-3 rounded-xl border border-border p-2">
          {value.previewUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={value.previewUrl} alt="" className="size-14 rounded-lg object-cover" />
          ) : (
            <span className="flex size-14 items-center justify-center rounded-lg bg-muted text-[11px]">PDF</span>
          )}
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-1 text-[13px] font-medium">
              <Check className="size-4" /> Uploaded
            </span>
            <span className="block truncate text-[11.5px] text-muted-foreground">{value.name}</span>
          </span>
          <button type="button" onClick={() => onChange(null)} className="rounded-md p-2 hover:bg-muted" aria-label={`Remove ${label}`}>
            <X className="size-4" />
          </button>
        </div>
      ) : (
        <label
          htmlFor={id}
          className={cn(
            'flex min-h-[64px] cursor-pointer items-center gap-3 rounded-xl border border-dashed px-3 py-3 transition-colors hover:bg-muted/60 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-foreground',
            message ? 'border-destructive' : 'border-input',
          )}
        >
          {busy ? <Loader2 className="size-5 animate-spin" /> : accept.includes('pdf') ? <ImageUp className="size-5" /> : <Camera className="size-5" />}
          <span className="text-[13px]">
            <span className="block font-medium">{busy ? 'Uploading…' : 'Take photo or choose file'}</span>
            <span className="block text-[11.5px] text-muted-foreground">{hint ?? 'JPEG, PNG or WEBP · up to 8 MB'}</span>
          </span>
          <input
            id={id}
            type="file"
            accept={accept}
            capture="environment"
            className="sr-only"
            aria-labelledby={`${id}-label`}
            aria-invalid={message ? true : undefined}
            aria-describedby={message ? `${id}-error` : undefined}
            disabled={busy}
            onChange={(e) => {
              void pick(e.target.files?.[0]);
              e.target.value = '';
            }}
          />
        </label>
      )}
      {message && (
        <p id={`${id}-error`} role="alert" className="text-[12px] text-destructive">
          {message}
        </p>
      )}
    </div>
  );
}

/** Label/value pair for compact facts. */
export function Fact({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('min-w-0', className)}>
      <dt className="text-[10.5px] font-medium uppercase tracking-[0.08em] text-muted-foreground">{label}</dt>
      <dd className="tabular mt-0.5 text-[14px] font-semibold">{children}</dd>
    </div>
  );
}
