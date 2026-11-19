import { cn } from '@/lib/utils';

export interface TimelineItem {
  id: string;
  title: React.ReactNode;
  meta?: React.ReactNode;
  time?: React.ReactNode;
  /** done = filled, current = ringed, upcoming = hollow, problem = red. */
  state?: 'done' | 'current' | 'upcoming' | 'problem';
}

/** Vertical, timestamped delivery/order history (guide: "Timeline-based delivery details"). */
export function Timeline({ items, className, dense }: { items: TimelineItem[]; className?: string; dense?: boolean }) {
  return (
    <ol className={cn('relative', className)}>
      {items.map((item, i) => {
        const state = item.state ?? 'done';
        const last = i === items.length - 1;
        return (
          <li key={item.id} className={cn('relative grid grid-cols-[16px_1fr_auto] gap-x-3', dense ? 'pb-3' : 'pb-4', last && 'pb-0')}>
            {!last && <span aria-hidden className="absolute left-[7px] top-4 h-[calc(100%-12px)] w-px bg-border" />}
            <span
              aria-hidden
              className={cn(
                'relative mt-1 size-[15px] rounded-full border-2',
                state === 'done' && 'border-foreground bg-foreground',
                state === 'current' && 'border-foreground bg-card shadow-[0_0_0_3px_var(--card),0_0_0_4px_var(--foreground)]',
                state === 'upcoming' && 'border-border bg-card',
                state === 'problem' && 'border-destructive bg-destructive',
              )}
            />
            <div className="min-w-0">
              <p className={cn('text-[13px] font-medium leading-5', state === 'upcoming' ? 'text-muted-foreground' : 'text-foreground')}>{item.title}</p>
              {item.meta && <div className="text-xs leading-5 text-muted-foreground">{item.meta}</div>}
            </div>
            {item.time && <time className="tabular whitespace-nowrap pt-0.5 text-[11.5px] text-muted-foreground">{item.time}</time>}
          </li>
        );
      })}
    </ol>
  );
}
