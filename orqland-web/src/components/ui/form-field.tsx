import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * Label + control + hint/error, wired for screen readers: the control gets `aria-invalid` and
 * `aria-describedby` pointing at the message. Pass the control as the only child.
 */
export function FormField({
  id,
  label,
  hint,
  error,
  children,
  className,
  optional,
}: {
  id: string;
  label: React.ReactNode;
  hint?: React.ReactNode;
  error?: string;
  children: React.ReactElement<Record<string, unknown>>;
  className?: string;
  optional?: boolean;
}) {
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;
  return (
    <div className={cn('space-y-1.5', className)}>
      <label htmlFor={id} className="flex items-baseline justify-between text-[12px] font-medium text-foreground">
        {label}
        {optional && <span className="font-normal text-muted-foreground">Optional</span>}
      </label>
      {React.cloneElement(children, { id, 'aria-invalid': error ? true : undefined, 'aria-describedby': describedBy })}
      {error ? (
        <p id={`${id}-error`} role="alert" className="flex items-center gap-1.5 text-[12px] text-destructive">
          <span aria-hidden className="size-1.5 rounded-full bg-destructive" />
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-[12px] text-muted-foreground">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

/** Native select styled like Input (accessible by default, good on mobile). */
export const Select = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(({ className, ...props }, ref) => (
  <select
    ref={ref}
    className={cn(
      'flex h-9 w-full rounded-md border border-input bg-card px-2.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50',
      className,
    )}
    {...props}
  />
));
Select.displayName = 'Select';
