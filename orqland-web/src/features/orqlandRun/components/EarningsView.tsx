'use client';

import { Download, Share2 } from 'lucide-react';
import { useState } from 'react';
import { BarChart, Meter } from '@/components/ui/bar-chart';
import { EmptyState, ErrorNote } from '@/components/ui/panel';
import { Skeleton } from '@/components/ui/skeleton';
import { StatusDot } from '@/components/ui/status-dot';
import { currentMonth, deliveriesLabel, downloadCsv, formatDate, formatKm, formatMoney, formatPeriod } from '@/features/dashboard/common/utils/format';
import { gqlErrorMessage } from '@/features/dashboard/common/utils/gqlError';
import { EARNING_STATUS, metaOf } from '@/features/dashboard/common/utils/status';
import { cn } from '@/lib/utils';
import { useRunEarnings, useRunStatements } from '../hooks/useRun';
import { Fact, RunCard } from './RunPrimitives';
import type { RunViewProps } from './RunShell';
import { NewTicketDialog, type TicketPreset } from './SupportTickets';

const lastMonths = (n: number) =>
  Array.from({ length: n }, (_, i) => {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() - i);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });

/** Screen 4 — Earnings & analytics: amounts by state, km travelled vs billable, trends, statements, disputes. */
export function EarningsView({ home }: RunViewProps) {
  const months = lastMonths(6);
  const [period, setPeriod] = useState(currentMonth());
  const data = useRunEarnings(period);
  const statements = useRunStatements();
  const [dispute, setDispute] = useState<TicketPreset | null>(null);

  if (data.isError) return <ErrorNote message={gqlErrorMessage(data.error)} onRetry={() => void data.refetch()} />;
  const s = data.data?.myDeliveryStatement;
  const perf = data.data?.myDeliveryPerformance;
  const trend = data.data?.myDeliveryEarningsTrend ?? [];
  const byStatus = (s?.lines ?? []).reduce<Record<string, number>>((acc, l) => ({ ...acc, [l.status]: (acc[l.status] ?? 0) + Number(l.finalAmount) }), {});
  const prev = trend.length >= 2 ? trend[trend.length - 2] : null;
  const curr = trend.find((t) => t.periodMonth.startsWith(period));
  const delta = prev && curr && period === currentMonth() ? Number(curr.amount) - Number(prev.amount) : null;
  const monthStatements = (statements.data ?? []).filter((x) => x.periodMonth.startsWith(period));

  return (
    <div className="space-y-4">
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4" role="radiogroup" aria-label="Month">
        {months.map((m) => (
          <button
            key={m}
            type="button"
            role="radio"
            aria-checked={period === m}
            onClick={() => setPeriod(m)}
            className={cn('h-9 shrink-0 rounded-full border px-3.5 text-[12.5px] font-medium', period === m ? 'border-foreground bg-foreground text-background' : 'border-border bg-card')}
          >
            {m === currentMonth() ? 'This month' : formatPeriod(m)}
          </button>
        ))}
      </div>

      {!s || !perf ? (
        <Skeleton className="h-64 w-full rounded-2xl" />
      ) : (
        <>
          <RunCard>
            <p className="text-[11px] font-medium uppercase tracking-[0.1em] text-muted-foreground">
              {formatDate(s.periodStart)} – {formatDate(s.periodEnd)} · {s.status === 'FINAL' ? 'final statement' : s.isClosed ? 'closing' : 'in progress'}
            </p>
            <p className="tabular mt-1 text-[34px] font-semibold leading-none tracking-tight">{formatMoney(s.grandTotal)}</p>
            <p className="mt-1 text-[12.5px] text-muted-foreground">
              {deliveriesLabel(s.totals.deliveries)} · {Number(s.totals.billableKm).toFixed(1)} billable km
              {delta !== null && ` · ${delta >= 0 ? '+' : '−'}${formatMoney(Math.abs(delta))} vs last month`}
            </p>
            <ul className="mt-4 space-y-2 border-t border-border pt-3 text-[13px]">
              {(['PENDING_APPROVAL', 'UNDER_REVIEW', 'APPROVED', 'PAID'] as const).map((k) => {
                const m = metaOf(EARNING_STATUS, k);
                return (
                  <li key={k} className="flex items-center justify-between gap-2">
                    <StatusDot tone={m.tone} label={k === 'PENDING_APPROVAL' ? 'Estimated / pending' : m.label} />
                    <span className="tabular font-medium">{formatMoney((byStatus[k] ?? 0) + (k === 'PENDING_APPROVAL' ? (byStatus.ESTIMATED ?? 0) : 0))}</span>
                  </li>
                );
              })}
            </ul>
            <p className="mt-3 text-[11.5px] text-muted-foreground">Estimated amounts can change when the workspace approves the distance. A per-km rate doesn’t guarantee payout timing.</p>
          </RunCard>

          {period === currentMonth() && (
            <RunCard>
              <dl className="grid grid-cols-3 gap-3">
                <Fact label="Today">{formatMoney(Number(home.today.estimated) + Number(home.today.approved) + Number(home.today.paid))}</Fact>
                <Fact label="Per delivery">{formatMoney(perf.averageEarningPerDelivery)}</Fact>
                <Fact label="Avg trip">{formatKm(perf.averageDistanceKm)}</Fact>
              </dl>
            </RunCard>
          )}

          <RunCard className="space-y-3">
            <p className="text-[11px] font-medium uppercase tracking-[0.1em] text-muted-foreground">Kilometres</p>
            <Meter label="Travelled (GPS)" value={Number(perf.trackedKm)} max={Math.max(Number(perf.trackedKm), Number(perf.billableKm), 1)} valueLabel={formatKm(perf.trackedKm)} />
            <Meter label="Approved billable" value={Number(perf.billableKm)} max={Math.max(Number(perf.trackedKm), Number(perf.billableKm), 1)} valueLabel={formatKm(perf.billableKm)} />
            <p className="text-[11.5px] text-muted-foreground">You’re paid on approved billable km (GPS route, capped against the route estimate) × the rate fixed when you accepted.</p>
          </RunCard>

          <RunCard>
            <p className="text-[11px] font-medium uppercase tracking-[0.1em] text-muted-foreground">Requests this month</p>
            <ul className="mt-2 space-y-2 text-[13px]">
              {(
                [
                  ['Offered', perf.offered],
                  ['Accepted', perf.accepted],
                  ['Declined', perf.declined],
                  ['Expired', perf.expired],
                  ['Completed', perf.completed],
                  ['Failed', perf.failed],
                ] as const
              ).map(([label, n]) => (
                <li key={label} className="grid grid-cols-[84px_1fr_32px] items-center gap-3">
                  <span className="text-muted-foreground">{label}</span>
                  <span className="h-1.5 rounded-full bg-muted" aria-hidden>
                    <span className="block h-full rounded-full bg-foreground" style={{ width: `${perf.offered ? (n / perf.offered) * 100 : 0}%` }} />
                  </span>
                  <span className="tabular text-right font-medium">{n}</span>
                </li>
              ))}
            </ul>
          </RunCard>

          <RunCard>
            <p className="mb-3 text-[11px] font-medium uppercase tracking-[0.1em] text-muted-foreground">Last 6 months</p>
            <BarChart
              title="Earnings per month, last 6 months"
              height={110}
              highlightLast
              format={(n) => (n >= 1000 ? `₹${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}K` : `₹${Math.round(n)}`)}
              series={[{ key: 'amount', label: 'Earnings', color: '#2a2a28' }]}
              data={trend.map((t) => ({ key: t.periodMonth, label: formatPeriod(t.periodMonth), tick: formatPeriod(t.periodMonth).split(' ')[0], values: { amount: Number(t.amount) } }))}
            />
          </RunCard>

          {s.byWorkspace.length > 0 && (
            <RunCard className="p-0">
              <p className="px-4 pt-3 text-[11px] font-medium uppercase tracking-[0.1em] text-muted-foreground">By workspace</p>
              <ul className="divide-y divide-border">
                {s.byWorkspace.map((w) => {
                  const rate = s.lines.find((l) => l.orqspaceId === w.orqspaceId)?.ratePerKm;
                  return (
                    <li key={w.orqspaceId} className="flex items-center justify-between gap-3 px-4 py-3 text-[13px]">
                      <span>
                        <span className="block font-medium">{w.orqspaceName}</span>
                        <span className="text-[12px] text-muted-foreground">
                          {deliveriesLabel(w.deliveries)} · {Number(w.billableKm).toFixed(1)} km{rate ? ` · ${formatMoney(rate)}/km` : ''}
                        </span>
                      </span>
                      <span className="tabular font-semibold">{formatMoney(w.amount)}</span>
                    </li>
                  );
                })}
              </ul>
            </RunCard>
          )}

          <RunCard className="p-0">
            <p className="px-4 pt-3 text-[11px] font-medium uppercase tracking-[0.1em] text-muted-foreground">Delivery earnings</p>
            {s.lines.length === 0 ? (
              <EmptyState title="No earnings this month" />
            ) : (
              <ul className="divide-y divide-border">
                {s.lines.map((l) => {
                  const m = metaOf(EARNING_STATUS, l.status);
                  return (
                    <li key={l.id} className="space-y-1 px-4 py-3 text-[13px]">
                      <div className="flex items-start justify-between gap-3">
                        <span className="min-w-0">
                          <span className="block truncate font-medium">{l.orqspaceName}</span>
                          <span className="block font-mono text-[11px] text-muted-foreground">
                            {l.taskNumber} · {formatDate(l.deliveredAt)}
                          </span>
                        </span>
                        <span className="tabular text-right font-semibold">{formatMoney(l.finalAmount)}</span>
                      </div>
                      <div className="flex items-center justify-between gap-3 text-[12px] text-muted-foreground">
                        <span className="tabular">
                          {formatKm(l.approvedBillableKm)} × {formatMoney(l.ratePerKm)}
                          {Number(l.adjustmentTotal) !== 0 && ` · adjustment ${formatMoney(l.adjustmentTotal)}`}
                        </span>
                        <StatusDot tone={m.tone} label={m.label} />
                      </div>
                      {!['PAID', 'VOID', 'UNDER_REVIEW'].includes(l.status) && (
                        <button
                          type="button"
                          className="text-[12px] underline underline-offset-2"
                          onClick={() => setDispute({ category: 'EARNINGS_PAYMENT', relatedEarningId: l.id, subject: `Earning for ${l.taskNumber}` })}
                        >
                          Dispute this earning
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </RunCard>

          <RunCard className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[11px] font-medium uppercase tracking-[0.1em] text-muted-foreground">Monthly statement</p>
              <span className="text-[12px] text-muted-foreground">{s.status === 'FINAL' ? 'Final' : 'Draft'}</span>
            </div>
            {monthStatements.length > 0 && (
              <ul className="space-y-1 text-[13px]">
                {monthStatements.map((st) => (
                  <li key={st.id} className="flex justify-between gap-3">
                    <span className="truncate">{st.orqspaceName}</span>
                    <span className="tabular">
                      {formatMoney(st.finalAmount)} <span className="text-muted-foreground">· paid {formatMoney(st.paidAmount)}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                disabled={!s.lines.length}
                onClick={() => downloadCsv(`orqland-run-statement-${period}.csv`, s.csv)}
                className="inline-flex h-11 items-center justify-center gap-1.5 rounded-xl border border-border text-[13px] font-medium disabled:opacity-40"
              >
                <Download className="size-4" /> Download CSV
              </button>
              <button
                type="button"
                disabled={!s.lines.length}
                onClick={() => {
                  const text = `Orqland Run statement ${formatPeriod(period)}: ${deliveriesLabel(s.totals.deliveries)}, ${Number(s.totals.billableKm).toFixed(1)} km, total ${formatMoney(s.grandTotal)}.`;
                  if (navigator.share) void navigator.share({ title: 'Orqland Run statement', text }).catch(() => undefined);
                  else void navigator.clipboard?.writeText(text);
                }}
                className="inline-flex h-11 items-center justify-center gap-1.5 rounded-xl border border-border text-[13px] font-medium disabled:opacity-40"
              >
                <Share2 className="size-4" /> Share summary
              </button>
            </div>
            <button type="button" className="text-[12px] underline underline-offset-2" onClick={() => setDispute({ category: 'EARNINGS_PAYMENT', relatedPeriodMonth: period, subject: `Statement ${period}` })}>
              Raise a dispute about this statement
            </button>
          </RunCard>

          {(statements.data?.length ?? 0) > 0 && (
            <RunCard className="p-0">
              <p className="px-4 pt-3 text-[11px] font-medium uppercase tracking-[0.1em] text-muted-foreground">All statements</p>
              <ul className="divide-y divide-border">
                {statements.data!.map((st) => (
                  <li key={st.id}>
                    <button type="button" onClick={() => setPeriod(st.periodMonth.slice(0, 7))} className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left text-[13px] hover:bg-muted/60">
                      <span>
                        <span className="block font-medium">
                          {formatPeriod(st.periodMonth)} · {st.orqspaceName}
                        </span>
                        <span className="text-[12px] text-muted-foreground">
                          {deliveriesLabel(st.deliveries)} · {Number(st.approvedKm).toFixed(1)} km
                        </span>
                      </span>
                      <span className="text-right">
                        <span className="tabular block font-semibold">{formatMoney(st.finalAmount)}</span>
                        <StatusDot tone={st.status === 'FINAL' ? 'good' : 'idle'} label={st.status === 'FINAL' ? 'Final' : 'Draft'} className="text-[11.5px]" />
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </RunCard>
          )}
        </>
      )}
      {dispute && <NewTicketDialog preset={dispute} onClose={() => setDispute(null)} />}
    </div>
  );
}
