'use client';

import type { Order } from '../../types/order.types';
import { DEFAULT_PREP_MINUTES, formatClock, PREP_EXTENSION_MINUTES, prepUrgency } from '../../utils/order-display';
import { ActionButton } from './parts';

const R = 34;
const C = 2 * Math.PI * R;
const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

/** "ENDS IN" ring for orders in preparation, with the +2 minutes button. */
export function PrepTimer({ order, now, onExtend, extending }: { order: Order; now: number; onExtend: () => void; extending: boolean }) {
  const due = order.preparationDueAt ? new Date(order.preparationDueAt).getTime() : null;
  const totalS = (order.preparationMinutes ?? DEFAULT_PREP_MINUTES) * 60;
  const leftS = due === null ? null : Math.round((due - now) / 1000);
  const fraction = leftS === null ? 0 : Math.max(0, Math.min(1, leftS / totalS));
  const urgency = prepUrgency(order, now);
  const color = urgency ? '#ef4444' : fraction > 0.5 ? '#16a34a' : '#f59e0b';
  const overdue = leftS !== null && leftS < 0;
  const label = leftS === null ? '--:--' : mmss(Math.abs(leftS));

  return (
    <div className="flex items-center gap-4 rounded-xl bg-gray-100 p-3">
      <div
        role="timer"
        aria-label={leftS === null ? 'No preparation timer' : overdue ? `Preparation overdue by ${label}` : `Preparation ends in ${label}`}
        className="relative size-[84px] shrink-0"
      >
        <svg viewBox="0 0 80 80" className="size-full -rotate-90" aria-hidden>
          <circle cx="40" cy="40" r={R} fill="none" stroke="#e5e7eb" strokeWidth="7" />
          <circle
            cx="40"
            cy="40"
            r={R}
            fill="none"
            stroke={color}
            strokeWidth="7"
            strokeLinecap="round"
            strokeDasharray={C}
            strokeDashoffset={C * (1 - fraction)}
            className="transition-[stroke-dashoffset] duration-1000 ease-linear"
          />
        </svg>
        <span aria-hidden className="absolute inset-0 flex flex-col items-center justify-center">
          <span className={overdue ? 'text-[9px] font-semibold uppercase tracking-wide text-red-600' : 'text-[9px] font-semibold uppercase tracking-wide text-gray-500'}>
            {overdue ? 'Overdue' : 'Ends in'}
          </span>
          <span className={overdue ? 'font-mono text-[16px] font-bold tabular-nums text-red-600' : 'font-mono text-[16px] font-bold tabular-nums text-gray-950'}>{label}</span>
        </span>
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[12px] leading-snug text-gray-600">
          {leftS === null
            ? 'No timer set for this order.'
            : urgency === 'overdue'
              ? 'Preparation is overdue — mark it prepared or add time.'
              : urgency === 'low'
                ? 'Running low — finish up or add time.'
                : `Ready by ${formatClock(due)}`}
        </p>
        <ActionButton variant="soft" className="mt-2 h-8 px-3 text-[12.5px]" onClick={onExtend} disabled={extending} aria-label={`Add ${PREP_EXTENSION_MINUTES} minutes to the preparation time`}>
          +{PREP_EXTENSION_MINUTES} Mins
        </ActionButton>
      </div>
    </div>
  );
}
