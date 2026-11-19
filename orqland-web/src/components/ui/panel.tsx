import { cn } from '@/lib/utils';

/** Bordered white surface with an optional small-caps heading row. */
export function Panel({
  title,
  description,
  actions,
  children,
  className,
  bodyClassName,
  id,
}: {
  title?: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
  id?: string;
}) {
  return (
    <section id={id} className={cn('min-w-0 rounded-lg border border-border bg-card', className)} aria-labelledby={id && title ? `${id}-title` : undefined}>
      {(title || actions) && (
        <header className="flex min-h-11 flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-2">
          <div className="min-w-0">
            {title && (
              <h2 id={id ? `${id}-title` : undefined} className="text-[13px] font-semibold tracking-tight text-foreground">
                {title}
              </h2>
            )}
            {description && <p className="text-xs text-muted-foreground">{description}</p>}
          </div>
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className={cn(bodyClassName)}>{children}</div>
    </section>
  );
}

export function SectionLabel({ children, className }: { children: React.ReactNode; className?: string }) {
  return <p className={cn('text-[10.5px] font-medium uppercase tracking-[0.1em] text-muted-foreground', className)}>{children}</p>;
}

export function EmptyState({ icon: Icon, title, body, action, className }: { icon?: React.ComponentType<{ className?: string }>; title: string; body?: React.ReactNode; action?: React.ReactNode; className?: string }) {
  return (
    <div className={cn('flex flex-col items-center justify-center gap-2 px-6 py-10 text-center', className)}>
      {Icon && <Icon className="size-5 text-muted-foreground" />}
      <p className="text-sm font-medium text-foreground">{title}</p>
      {body && <p className="max-w-sm text-xs leading-5 text-muted-foreground">{body}</p>}
      {action}
    </div>
  );
}

/** Inline, specific error message with a retry — never a silent failure. */
export function ErrorNote({ message, onRetry, className }: { message: string; onRetry?: () => void; className?: string }) {
  return (
    <div role="alert" className={cn('flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-[13px] text-foreground', className)}>
      <span aria-hidden className="mt-1.5 size-1.5 shrink-0 rounded-full bg-destructive" />
      <span className="min-w-0 flex-1">{message}</span>
      {onRetry && (
        <button type="button" onClick={onRetry} className="shrink-0 text-xs font-medium underline underline-offset-2">
          Retry
        </button>
      )}
    </div>
  );
}
