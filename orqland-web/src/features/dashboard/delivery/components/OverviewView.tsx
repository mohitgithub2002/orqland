'use client';

import { ArrowRight } from 'lucide-react';
import Link from 'next/link';
import { BarChart } from '@/components/ui/bar-chart';
import { Metric, MetricStrip } from '@/components/ui/metric';
import { EmptyState, ErrorNote, Panel } from '@/components/ui/panel';
import { StatusDot } from '@/components/ui/status-dot';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { formatMinutes, formatMoney, formatPercent, timeAgo } from '@/features/dashboard/common/utils/format';
import { gqlErrorMessage } from '@/features/dashboard/common/utils/gqlError';
import { AVAILABILITY, metaOf } from '@/features/dashboard/common/utils/status';
import { useDeliveryOperations } from '../hooks/useDelivery';
import type { DeliveryOperations } from '../types/delivery.types';
import type { DeliveryTab } from './DeliveryPage';

const slaState = (median: number | null, target: number) => (median === null ? undefined : median <= target ? 'ok' : median <= target * 1.5 ? 'warn' : 'bad');

/** Delivery overview & order queue — operational timings first, then queue, breaches and workload. */
export function OverviewView({ orqspaceId, onOpenTask, onGo }: { orqspaceId: string; onOpenTask: (taskId: string) => void; onGo: (tab: DeliveryTab) => void }) {
  const ops = useDeliveryOperations(orqspaceId);
  if (ops.isError) return <ErrorNote message={gqlErrorMessage(ops.error)} onRetry={() => void ops.refetch()} />;
  if (!ops.data) return <Skeleton className="h-96 w-full" />;
  const o = ops.data;
  const t = o.timings;

  return (
    <div className="space-y-5">
      <MetricStrip columns={4}>
        <Metric
          label="Time to accept order"
          value={formatMinutes(t.medianOrderAcceptMinutes)}
          hint={`median · target ${t.slaTargets.orderAcceptMinutes}m`}
          state={slaState(t.medianOrderAcceptMinutes, t.slaTargets.orderAcceptMinutes)}
        />
        <Metric
          label="Time to assign"
          value={formatMinutes(t.medianAssignMinutes)}
          hint={`median · target ${t.slaTargets.assignMinutes}m`}
          state={slaState(t.medianAssignMinutes, t.slaTargets.assignMinutes)}
        />
        <Metric label="Pickup" value={formatMinutes(t.medianPickupMinutes)} hint={`median · target ${t.slaTargets.pickupMinutes}m`} state={slaState(t.medianPickupMinutes, t.slaTargets.pickupMinutes)} />
        <Metric
          label="Pickup → delivered"
          value={formatMinutes(t.medianDeliverMinutes)}
          hint={`median · target ${t.slaTargets.deliverMinutes}m`}
          state={slaState(t.medianDeliverMinutes, t.slaTargets.deliverMinutes)}
        />
        <Metric label="Delivery SLA" value={formatPercent(t.deliverySlaPercent)} hint={`within ${t.slaTargets.deliverMinutes}m · ${t.windowDays} days`} />
        <Metric label="Success rate" value={formatPercent(t.successRatePercent)} hint={t.averageDistanceKm ? `avg ${Number(t.averageDistanceKm).toFixed(1)} km` : 'delivered ÷ attempted'} />
        <Metric label="Agents online" value={`${o.agents.online + o.agents.busy}/${o.agents.connected}`} hint={`limit ${o.agents.connectionLimit} per workspace`} onClick={() => onGo('agents')} />
        <Metric label="COD with agents" value={formatMoney(o.cod.outstanding)} hint={o.cod.discrepancies ? `${o.cod.discrepancies} discrepancy` : 'collected, not handed over'} state={o.cod.discrepancies ? 'bad' : undefined} onClick={() => onGo('cod')} />
      </MetricStrip>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <div className="min-w-0 space-y-5">
          <OrderQueue o={o} onGo={onGo} />
          <Panel title="Deliveries, last 14 days" description="Completed vs failed attempts per day" bodyClassName="px-4 pb-4 pt-3">
            <BarChart
              title="Deliveries per day, last 14 days"
              height={128}
              series={[
                { key: 'delivered', label: 'Delivered', color: '#2a2a28' },
                { key: 'failed', label: 'Failed', color: '#c62f2f' },
              ]}
              data={o.trend.map((d) => ({
                key: d.day,
                label: new Date(`${d.day}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }),
                values: { delivered: d.delivered, failed: d.failed },
              }))}
            />
          </Panel>
        </div>

        <div className="min-w-0 space-y-5">
          <Panel
            title="SLA breaches"
            description="Items past their target right now"
            actions={<span className="tabular text-[12px] text-muted-foreground">{o.breaches.length}</span>}
          >
            {o.breaches.length === 0 ? (
              <EmptyState title="Nothing is late" body="Every open order and delivery is within its target." />
            ) : (
              <ul className="divide-y divide-border">
                {o.breaches.slice(0, 8).map((b) => (
                  <li key={`${b.kind}-${b.reference}`}>
                    {b.taskId ? (
                      <button type="button" onClick={() => onOpenTask(b.taskId!)} className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-muted/60">
                        <BreachRow stage={b.stage} reference={b.reference} over={b.minutesOver} target={b.targetMinutes} />
                      </button>
                    ) : (
                      <Link href={`/orders?order=${b.orderId}`} className="flex w-full items-center gap-3 px-4 py-2.5 hover:bg-muted/60">
                        <BreachRow stage={b.stage} reference={b.reference} over={b.minutesOver} target={b.targetMinutes} />
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel title="Agent workload" description={`${o.agents.connected} of ${o.agents.connectionLimit} agents connected`} actions={<button className="text-[12px] underline underline-offset-2" onClick={() => onGo('agents')}>Manage</button>}>
            {o.agents.workload.length === 0 ? (
              <EmptyState title="No connected agents" body="Search an agent by Orq ID and send an invitation." />
            ) : (
              <Table>
                <THead>
                  <tr>
                    <TH>Agent</TH>
                    <TH>Status</TH>
                    <TH align="right">Active</TH>
                    <TH align="right">Today</TH>
                    <TH align="right">Location</TH>
                  </tr>
                </THead>
                <TBody>
                  {o.agents.workload.map((a) => {
                    const av = metaOf(AVAILABILITY, a.availability);
                    return (
                      <TR key={a.agentUserId}>
                        <TD>
                          <p className="whitespace-nowrap font-medium">{a.displayName}</p>
                          <p className="font-mono text-[11px] text-muted-foreground">{a.orqUserId}</p>
                        </TD>
                        <TD>
                          <StatusDot tone={a.disconnectPending ? 'warning' : av.tone} label={a.disconnectPending ? 'Leaving' : av.label} className="text-[12.5px]" />
                        </TD>
                        <TD align="right">
                          {a.activeTasks}/{a.maxConcurrentTasks}
                        </TD>
                        <TD align="right">{a.deliveredToday}</TD>
                        <TD align="right" className="whitespace-nowrap text-[12px] text-muted-foreground">
                          {a.availability === 'OFFLINE' ? '—' : a.locationStale ? <span className="text-foreground">Stale · {timeAgo(a.lastLocationAt)}</span> : timeAgo(a.lastLocationAt)}
                        </TD>
                      </TR>
                    );
                  })}
                </TBody>
              </Table>
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}

function BreachRow({ stage, reference, over, target }: { stage: string; reference: string; over: number; target: number }) {
  return (
    <>
      <StatusDot tone={over > target ? 'critical' : 'warning'} />
      <span className="min-w-0 flex-1">
        <span className="block text-[13px] font-medium">{stage}</span>
        <span className="block font-mono text-[11px] text-muted-foreground">{reference}</span>
      </span>
      <span className="tabular text-right text-[12.5px]">
        +{formatMinutes(over)}
        <span className="block text-[11px] text-muted-foreground">target {target}m</span>
      </span>
    </>
  );
}

/** The order queue as a left-to-right pipeline; each stage links to the filtered order list. */
function OrderQueue({ o, onGo }: { o: DeliveryOperations; onGo: (tab: DeliveryTab) => void }) {
  const stages: { label: string; value: number; href?: string; onClick?: () => void; emphasise?: boolean }[] = [
    { label: 'New', value: o.queue.newOrders, href: '/orders?tab=UPCOMING', emphasise: o.queue.newOrders > 0 },
    { label: 'Preparing', value: o.queue.preparing, href: '/orders?tab=PROCESSING' },
    { label: 'Ready to dispatch', value: o.queue.readyForFulfilment, onClick: () => onGo('assign'), emphasise: o.queue.readyForFulfilment > 0 },
    { label: 'Unassigned', value: o.deliveries.unassigned + o.deliveries.offered, onClick: () => onGo('assign') },
    { label: 'To pickup', value: o.deliveries.toPickup, onClick: () => onGo('live') },
    { label: 'In transit', value: o.deliveries.inTransit, onClick: () => onGo('live') },
    { label: 'Delivered today', value: o.deliveries.deliveredToday },
    { label: 'Failed today', value: o.deliveries.failedToday },
  ];
  return (
    <Panel
      title="Order queue"
      description="From new order to delivered — click a stage to act on it"
      actions={
        <Link href="/orders" className="inline-flex items-center gap-1 text-[12px] underline underline-offset-2">
          All orders <ArrowRight className="size-3" />
        </Link>
      }
    >
      <ol className="grid grid-cols-2 sm:grid-cols-4">
        {stages.map((st, i) => {
          const body = (
            <>
              <span className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                <span className="tabular mr-1 text-muted-foreground/70">{String(i + 1).padStart(2, '0')}</span>
                {st.label}
              </span>
              <span className="tabular mt-1 flex items-center gap-2 text-2xl font-semibold tracking-tight">
                {st.value}
                {st.emphasise && <StatusDot tone="warning" />}
              </span>
            </>
          );
          const cls = 'flex h-full flex-col border-b border-r border-border px-4 py-3 text-left transition-colors hover:bg-muted/60';
          return (
            <li key={st.label}>
              {st.href ? (
                <Link href={st.href} className={cls}>
                  {body}
                </Link>
              ) : st.onClick ? (
                <button type="button" onClick={st.onClick} className={`${cls} w-full`}>
                  {body}
                </button>
              ) : (
                <div className={cls.replace(' transition-colors hover:bg-muted/60', '')}>{body}</div>
              )}
            </li>
          );
        })}
      </ol>
    </Panel>
  );
}
