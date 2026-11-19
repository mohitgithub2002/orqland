import { cn } from '@/lib/utils';

/** A compact row of figures separated by hairlines — the operational header of a screen. */
export function MetricStrip({ children, className, columns }: { children: React.ReactNode; className?: string; columns?: 4 }) {
  return (
    <dl
      className={cn(
        'grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-3 [&>*]:bg-card',
        columns === 4 ? 'lg:grid-cols-4' : 'lg:auto-cols-fr lg:grid-flow-col lg:grid-cols-none',
        className,
      )}
    >
      {children}
    </dl>
  );
}

/**
 * label · value (+ unit) · hint. `state` adds a word, not a colour block: e.g. "over target".
 */
export function Metric({
  label,
  value,
  unit,
  hint,
  state,
  onClick,
  selected,
}: {
  label: string;
  value: React.ReactNode;
  unit?: string;
  hint?: React.ReactNode;
  state?: 'ok' | 'warn' | 'bad';
  onClick?: () => void;
  selected?: boolean;
}) {
  const Comp = onClick ? 'button' : 'div';
  return (
    <Comp
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={cn(
        'flex min-w-0 flex-col gap-1 px-4 py-3 text-left',
        onClick && 'transition-colors hover:bg-muted/60 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-foreground',
        selected && 'bg-muted/70',
      )}
    >
      <dt className="truncate text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">{label}</dt>
      <dd className="flex items-baseline gap-1">
        <span className="tabular text-[22px] font-semibold leading-none tracking-tight text-foreground" data-num>
          {value}
        </span>
        {unit && <span className="text-xs text-muted-foreground">{unit}</span>}
      </dd>
      {(hint || state) && (
        <dd className="flex min-w-0 items-center gap-1.5 text-[11.5px] text-muted-foreground">
          {state && (
            <span
              aria-hidden
              className={cn('size-1.5 shrink-0 rounded-full', state === 'ok' ? 'bg-success' : state === 'warn' ? 'bg-warning' : 'bg-destructive')}
            />
          )}
          <span className="truncate">{hint}</span>
        </dd>
      )}
    </Comp>
  );
}
