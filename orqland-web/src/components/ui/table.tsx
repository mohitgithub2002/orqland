import * as React from 'react';
import { cn } from '@/lib/utils';

/** Compact data table primitives: hairline rows, small caps headers, tabular figures. */
export function Table({ className, ...props }: React.TableHTMLAttributes<HTMLTableElement>) {
  return (
    <div className="w-full overflow-x-auto">
      <table className={cn('w-full border-collapse text-[13px]', className)} {...props} />
    </div>
  );
}
export const THead = (props: React.HTMLAttributes<HTMLTableSectionElement>) => <thead {...props} />;
export const TBody = (props: React.HTMLAttributes<HTMLTableSectionElement>) => <tbody {...props} />;
export function TR({ className, interactive, selected, ...props }: React.HTMLAttributes<HTMLTableRowElement> & { interactive?: boolean; selected?: boolean }) {
  return (
    <tr
      className={cn(
        'border-b border-border last:border-b-0',
        interactive && 'cursor-pointer hover:bg-muted/60 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-foreground',
        selected && 'bg-muted',
        className,
      )}
      {...props}
    />
  );
}
export function TH({ className, align, ...props }: React.ThHTMLAttributes<HTMLTableCellElement> & { align?: 'left' | 'right' }) {
  return (
    <th
      className={cn(
        'h-8 whitespace-nowrap border-b border-border px-3 text-[10.5px] font-medium uppercase tracking-[0.08em] text-muted-foreground',
        align === 'right' ? 'text-right' : 'text-left',
        className,
      )}
      {...props}
    />
  );
}
export function TD({ className, align, mono, ...props }: React.TdHTMLAttributes<HTMLTableCellElement> & { align?: 'left' | 'right'; mono?: boolean }) {
  return <td className={cn('h-10 px-3 align-middle', align === 'right' && 'tabular text-right', mono && 'font-mono text-[12px]', className)} {...props} />;
}
