import { cn } from '@/lib/utils';

export type StatusTone = 'live' | 'good' | 'warning' | 'critical' | 'active' | 'idle' | 'muted';

const DOT: Record<StatusTone, string> = {
  live: 'bg-success',
  good: 'bg-success',
  warning: 'bg-warning',
  critical: 'bg-destructive',
  active: 'bg-foreground',
  idle: 'bg-muted-foreground/60',
  muted: 'bg-border',
};

/**
 * The single status indicator used across the delivery screens: a small dot plus a text label,
 * so state never relies on colour alone. `live` pulses (respecting reduced motion).
 */
export function StatusDot({
  tone,
  label,
  className,
  size = 'sm',
}: {
  tone: StatusTone;
  label?: React.ReactNode;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}) {
  const dim = size === 'lg' ? 'size-3' : size === 'md' ? 'size-2.5' : 'size-2';
  return (
    <span className={cn('inline-flex items-center gap-1.5 whitespace-nowrap', className)}>
      <span className={cn('relative inline-flex shrink-0', dim)} aria-hidden>
        {tone === 'live' && <span className={cn('ops-ping absolute inset-0 rounded-full', DOT.live)} />}
        <span className={cn('relative inline-flex rounded-full', dim, DOT[tone])} />
      </span>
      {label !== undefined && <span>{label}</span>}
    </span>
  );
}
