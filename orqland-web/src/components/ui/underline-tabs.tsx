'use client';

import { cn } from '@/lib/utils';

/** Text-only tab bar with an ink underline. Keyboard: arrow keys move between tabs. */
export function UnderlineTabs<K extends string>({
  items,
  value,
  onChange,
  className,
  label,
}: {
  items: { key: K; label: string; count?: number | null }[];
  value: K;
  onChange: (key: K) => void;
  className?: string;
  label: string;
}) {
  const move = (dir: 1 | -1) => {
    const i = items.findIndex((t) => t.key === value);
    const next = items[(i + dir + items.length) % items.length];
    onChange(next.key);
    requestAnimationFrame(() => document.getElementById(`tab-${next.key}`)?.focus());
  };
  return (
    <div role="tablist" aria-label={label} className={cn('flex gap-5 overflow-x-auto border-b border-border', className)}>
      {items.map((t) => {
        const active = t.key === value;
        return (
          <button
            key={t.key}
            id={`tab-${t.key}`}
            role="tab"
            type="button"
            aria-selected={active}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(t.key)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowRight') move(1);
              if (e.key === 'ArrowLeft') move(-1);
            }}
            className={cn(
              '-mb-px flex h-10 shrink-0 items-center gap-1.5 border-b-2 text-[13px] transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground',
              active ? 'border-foreground font-semibold text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            {t.label}
            {t.count !== undefined && t.count !== null && (
              <span className={cn('tabular rounded px-1 text-[11px]', active ? 'bg-foreground text-background' : 'bg-muted text-muted-foreground')}>{t.count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
