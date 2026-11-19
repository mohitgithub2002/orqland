'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';

export interface BarSeries {
  key: string;
  label: string;
  /** CSS colour for the mark (text stays in ink). */
  color: string;
}

export interface BarDatum {
  key: string;
  label: string;
  /** Short tick label under the column. */
  tick?: string;
  values: Record<string, number>;
}

/**
 * Small stacked column chart: ≤24px columns with a 4px rounded cap, 2px surface gap between segments,
 * hairline baseline, per-column hover tooltip, a legend when there are ≥2 series and a screen-reader table.
 */
export function BarChart({
  data,
  series,
  height = 120,
  format = (n) => String(n),
  className,
  title,
  highlightLast,
}: {
  data: BarDatum[];
  series: BarSeries[];
  height?: number;
  format?: (n: number) => string;
  className?: string;
  title: string;
  highlightLast?: boolean;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const totals = data.map((d) => series.reduce((s, x) => s + (d.values[x.key] ?? 0), 0));
  const max = Math.max(1, ...totals);
  const integer = data.every((d) => series.every((x) => Number.isInteger(d.values[x.key] ?? 0)));
  const step = integer ? Math.max(1, niceStep(max)) : niceStep(max);
  const top = Math.ceil(max / step) * step;
  const ticks = [0, top / 2, top].filter((t) => !integer || Number.isInteger(t));

  return (
    <figure className={cn('relative', className)}>
      <figcaption className="sr-only">{title}</figcaption>
      {series.length > 1 && (
        <div className="mb-2 flex flex-wrap gap-3 text-[11.5px] text-muted-foreground">
          {series.map((s) => (
            <span key={s.key} className="inline-flex items-center gap-1.5">
              <span aria-hidden className="inline-block size-2.5 rounded-[2px]" style={{ background: s.color }} />
              {s.label}
            </span>
          ))}
        </div>
      )}
      <div className="grid grid-cols-[auto_1fr] gap-x-2">
        <div className="relative text-right text-[10.5px] text-muted-foreground tabular" style={{ height }} aria-hidden>
          {ticks.map((t) => (
            <span key={t} className="absolute right-0 -translate-y-1/2" style={{ top: height - (t / top) * height }}>
              {format(t)}
            </span>
          ))}
        </div>
        <div className="relative" style={{ height }} onMouseLeave={() => setHover(null)}>
          {ticks.slice(1).map((t) => (
            <span key={t} aria-hidden className="absolute inset-x-0 h-px bg-border/70" style={{ top: height - (t / top) * height }} />
          ))}
          <span aria-hidden className="absolute inset-x-0 bottom-0 h-px bg-muted-foreground/40" />
          <div className="absolute inset-0 flex items-end">
            {data.map((d, i) => {
              const segs = series.map((s) => ({ s, v: d.values[s.key] ?? 0 })).filter((x) => x.v > 0);
              const dim = hover !== null && hover !== i;
              const emphasise = highlightLast && i === data.length - 1;
              return (
                <button
                  key={d.key}
                  type="button"
                  className="group relative flex h-full min-w-0 flex-1 items-end justify-center focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-foreground"
                  onMouseEnter={() => setHover(i)}
                  onFocus={() => setHover(i)}
                  onBlur={() => setHover(null)}
                  aria-label={`${d.label}: ${series.map((s) => `${s.label} ${format(d.values[s.key] ?? 0)}`).join(', ')}`}
                >
                  <span className={cn('flex w-full max-w-6 flex-col-reverse gap-[2px] transition-opacity', dim && 'opacity-40')}>
                    {segs.map(({ s, v }, si) => (
                      <span
                        key={s.key}
                        className={cn(si === segs.length - 1 && 'rounded-t-[4px]')}
                        style={{ height: Math.max(2, (v / top) * height - 2), background: s.color, opacity: emphasise || series.length > 1 ? 1 : 0.82 }}
                      />
                    ))}
                  </span>
                </button>
              );
            })}
          </div>
          {hover !== null && (
            <div
              role="status"
              className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-md border border-border bg-card px-2 py-1.5 text-[11.5px] shadow-md"
              style={{ left: `${((hover + 0.5) / data.length) * 100}%`, top: height - (totals[hover] / top) * height - 6 }}
            >
              <p className="font-medium text-foreground">{data[hover].label}</p>
              {series.map((s) => (
                <p key={s.key} className="flex items-center gap-1.5 text-muted-foreground">
                  <span aria-hidden className="inline-block size-2 rounded-[2px]" style={{ background: s.color }} />
                  {s.label} <span className="tabular ml-auto pl-2 text-foreground">{format(data[hover].values[s.key] ?? 0)}</span>
                </p>
              ))}
            </div>
          )}
        </div>
        <span />
        <div className="mt-1 flex text-[10.5px] text-muted-foreground" aria-hidden>
          {data.map((d, i) => (
            <span key={d.key} className="min-w-0 flex-1 truncate text-center">
              {d.tick ?? (i % Math.ceil(data.length / 7) === 0 || i === data.length - 1 ? d.label : '')}
            </span>
          ))}
        </div>
      </div>
      <table className="sr-only">
        <caption>{title}</caption>
        <thead>
          <tr>
            <th>Period</th>
            {series.map((s) => (
              <th key={s.key}>{s.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((d) => (
            <tr key={d.key}>
              <td>{d.label}</td>
              {series.map((s) => (
                <td key={s.key}>{format(d.values[s.key] ?? 0)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}

function niceStep(max: number): number {
  const raw = max / 2;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const n = raw / pow;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * pow;
}

/** Horizontal meter: one value against a whole (e.g. km billed vs travelled). */
export function Meter({ value, max, label, valueLabel }: { value: number; max: number; label: string; valueLabel: string }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div>
      <div className="mb-1 flex justify-between text-[12px]">
        <span className="text-muted-foreground">{label}</span>
        <span className="tabular font-medium text-foreground">{valueLabel}</span>
      </div>
      <div className="h-1.5 rounded-full bg-muted" role="meter" aria-valuemin={0} aria-valuemax={max} aria-valuenow={value} aria-label={label}>
        <div className="h-full rounded-full bg-foreground" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
