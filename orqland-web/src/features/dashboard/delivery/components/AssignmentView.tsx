'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { EmptyState, ErrorNote, Panel } from '@/components/ui/panel';
import { Skeleton } from '@/components/ui/skeleton';
import { StatusDot } from '@/components/ui/status-dot';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { useNow } from '@/features/dashboard/common/hooks/useNow';
import { formatMinutes, formatMoney, minutesSince, timeAgo } from '@/features/dashboard/common/utils/format';
import { gqlErrorMessage } from '@/features/dashboard/common/utils/gqlError';
import { AVAILABILITY, metaOf, TASK_STATUS } from '@/features/dashboard/common/utils/status';
import { useOrqspaceOrders } from '@/features/dashboard/orders/hooks/useOrders';
import { useDeliveryAction, useDeliveryAgents, useDeliverySettings, useLiveDeliveries } from '../hooks/useDelivery';
import type { DeliveryTask } from '../types/delivery.types';
import { agentBlocker, distanceFromPickup, DispatchDialog, type DispatchTarget } from './DispatchDialog';
import { OfferCountdown } from './OfferCountdown';

/**
 * Manual & automatic assignment board (guide §6 B–C): orders in preparation or prepared that still need
 * a delivery partner (assigning during preparation lets the agent travel while the order is made),
 * deliveries still looking for an agent, and the connected agents who can take them.
 */
export function AssignmentView({ orqspaceId, onOpenTask }: { orqspaceId: string; onOpenTask: (taskId: string) => void }) {
  const now = useNow(10_000);
  const settings = useDeliverySettings(orqspaceId);
  const live = useLiveDeliveries(orqspaceId);
  const agents = useDeliveryAgents(orqspaceId, ['ACTIVE']);
  const ready = useOrqspaceOrders({ orqspaceId, statuses: ['PREPARING', 'READY_FOR_FULFILMENT'], page: 1, pageSize: 50 });
  const updateSettings = useDeliveryAction('updateSettings');
  const [target, setTarget] = useState<{ target: DispatchTarget; agent?: string } | null>(null);
  const [pickAgent, setPickAgent] = useState<string | null>(null);

  if (live.isError) return <ErrorNote message={gqlErrorMessage(live.error)} onRetry={() => void live.refetch()} />;
  if (!live.data || !ready.data || !settings.data) return <Skeleton className="h-96 w-full" />;

  const dispatchedOrders = new Set(live.data.map((t) => t.orderId));
  const waitingOrders = ready.data.items.filter((o) => !dispatchedOrders.has(o.id) && o.requestedFulfilment === 'DELIVERY');
  const pickupOrders = ready.data.items.filter((o) => o.requestedFulfilment === 'PICKUP' && o.orderStatus === 'READY_FOR_FULFILMENT');
  const unassigned: DeliveryTask[] = live.data.filter((t) => t.mode === 'AGENT' && ['PENDING_ASSIGNMENT', 'OFFERED'].includes(t.status));
  const s = settings.data;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card px-4 py-3">
        <div className="text-[13px]">
          <p className="font-medium">
            Automatic assignment is {s.autoAssignEnabled ? 'on' : 'off'}
            <span className="font-normal text-muted-foreground"> · strategy {s.assignmentStrategy.toLowerCase().replace('_', ' ')} · offers expire after {s.offerTimeoutSeconds}s · radius {Number(s.maxPickupRadiusKm)} km</span>
          </p>
          <p className="text-[12px] text-muted-foreground">When on, “Dispatch” defaults to the engine’s choice. You can always pick an agent yourself.</p>
        </div>
        <Button
          size="sm"
          variant="outline"
          aria-pressed={s.autoAssignEnabled}
          disabled={updateSettings.isPending}
          onClick={() => updateSettings.mutate({ orqspaceId, autoAssignEnabled: !s.autoAssignEnabled })}
        >
          {s.autoAssignEnabled ? 'Turn off auto-assign' : 'Turn on auto-assign'}
        </Button>
      </div>
      {updateSettings.error && <ErrorNote message={gqlErrorMessage(updateSettings.error)} />}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <div className="min-w-0 space-y-5">
          <Panel title="Needs a delivery partner" description="In preparation or prepared — assign early so the agent arrives as the order is ready" actions={<span className="tabular text-[12px] text-muted-foreground">{waitingOrders.length}</span>}>
            {waitingOrders.length === 0 ? (
              <EmptyState title="Nothing waiting" body="Orders appear here as soon as preparation starts." />
            ) : (
              <Table>
                <THead>
                  <tr>
                    <TH>Order</TH>
                    <TH>Customer</TH>
                    <TH align="right">Value</TH>
                    <TH>Stage</TH>
                    <TH />
                  </tr>
                </THead>
                <TBody>
                  {waitingOrders.map((o) => (
                    <TR key={o.id}>
                      <TD>
                        <p className="font-medium">{o.orderNumber}</p>
                        <p className="text-[11.5px] text-muted-foreground">{o.itemCount} item{o.itemCount === 1 ? '' : 's'}</p>
                      </TD>
                      <TD className="max-w-[160px] truncate">{o.buyerSnapshot.name}</TD>
                      <TD align="right">
                        {formatMoney(o.totalAmount)}
                        <span className="block text-[11px] text-muted-foreground">{o.paymentMethod === 'COD' ? 'Cash on delivery' : 'Paid online'}</span>
                      </TD>
                      <TD>
                        {o.orderStatus === 'PREPARING' ? (
                          <>
                            Preparing
                            <span className="block text-[11px] text-muted-foreground">
                              {o.preparationDueAt ? `ready in ${formatMinutes(Math.max(0, -(minutesSince(o.preparationDueAt, now) ?? 0)))}` : 'no timer'}
                            </span>
                          </>
                        ) : (
                          <>
                            Prepared
                            <span className="block text-[11px] text-muted-foreground">waiting {formatMinutes(minutesSince(o.readyAt ?? o.createdAt, now))}</span>
                          </>
                        )}
                      </TD>
                      <TD align="right">
                        <Button size="sm" onClick={() => setTarget({ target: { kind: 'dispatch', orderId: o.id, orderNumber: o.orderNumber }, agent: pickAgent ?? undefined })}>
                          {pickAgent ? 'Send to selected agent' : 'Dispatch'}
                        </Button>
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            )}
          </Panel>

          <Panel title="Looking for an agent" description="Dispatched to agents but not yet accepted" actions={<span className="tabular text-[12px] text-muted-foreground">{unassigned.length}</span>}>
            {unassigned.length === 0 ? (
              <EmptyState title="Every dispatched delivery has an agent" />
            ) : (
              <ul className="divide-y divide-border">
                {unassigned.map((t) => {
                  const st = metaOf(TASK_STATUS, t.status);
                  return (
                    <li key={t.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                      <StatusDot tone={t.needsAttention ? 'critical' : st.tone} />
                      <button type="button" onClick={() => onOpenTask(t.id)} className="min-w-0 flex-1 text-left">
                        <span className="block text-[13px] font-medium">
                          {t.taskNumber} <span className="font-normal text-muted-foreground">· order {t.orderNumber}</span>
                        </span>
                        <span className="block text-[12px] text-muted-foreground">
                          {t.currentOffer ? (
                            <>
                              Offered to {t.currentOffer.agentName} · <OfferCountdown expiresAt={t.currentOffer.expiresAt} className="tabular" />
                            </>
                          ) : (
                            (t.attentionReason ?? st.label)
                          )}
                        </span>
                      </button>
                      <Button size="sm" variant={t.needsAttention ? 'default' : 'outline'} onClick={() => setTarget({ target: { kind: 'reassign', taskId: t.id, taskNumber: t.taskNumber }, agent: pickAgent ?? undefined })}>
                        {t.currentOffer ? 'Reassign' : 'Assign'}
                      </Button>
                    </li>
                  );
                })}
              </ul>
            )}
          </Panel>

          {pickupOrders.length > 0 && (
            <p className="text-[12.5px] text-muted-foreground">
              {pickupOrders.length} ready order{pickupOrders.length === 1 ? '' : 's'} chose customer pickup — hand over from the Orders page.
            </p>
          )}
        </div>

        <Panel
          title="Connected agents"
          description={pickAgent ? 'Agent selected — dispatch an order to send it to them' : 'Select an agent to send them the next order'}
          actions={pickAgent && <button className="text-[12px] underline underline-offset-2" onClick={() => setPickAgent(null)}>Clear</button>}
        >
          {!agents.data?.length ? (
            <EmptyState title="No connected agents" body="Invite agents by Orq ID from the Agents tab." />
          ) : (
            <ul className="divide-y divide-border">
              {agents.data.map((c) => {
                const blocker = agentBlocker(c);
                const km = distanceFromPickup(c, s);
                const av = metaOf(AVAILABILITY, c.agent.availability);
                const selected = pickAgent === c.agentUserId;
                return (
                  <li key={c.id}>
                    <button
                      type="button"
                      disabled={!!blocker}
                      aria-pressed={selected}
                      onClick={() => setPickAgent(selected ? null : c.agentUserId)}
                      className={`grid w-full grid-cols-[1fr_auto] gap-x-3 px-4 py-3 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-55 ${selected ? 'bg-muted' : 'hover:bg-muted/60'}`}
                    >
                      <span className="min-w-0">
                        <span className="flex items-center gap-2 text-[13px] font-medium">
                          <StatusDot tone={blocker ? (c.disconnectRequestStatus === 'REQUESTED' ? 'warning' : av.tone) : av.tone} />
                          {c.agent.displayName}
                        </span>
                        <span className="block truncate pl-4 text-[11.5px] text-muted-foreground">
                          <span className="font-mono">{c.agent.orqUserId}</span> · {blocker ?? av.label} · seen {timeAgo(c.agent.lastLocationAt)}
                        </span>
                      </span>
                      <span className="tabular text-right text-[12.5px]">
                        {formatMoney(c.currentRatePerKm)}/km
                        <span className="block text-[11px] text-muted-foreground">
                          {km !== null ? `${km.toFixed(1)} km away` : 'no location'} · {c.agent.activeTaskCount} active
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>
      </div>

      {target && (
        <DispatchDialog
          open
          onOpenChange={(o) => !o && setTarget(null)}
          orqspaceId={orqspaceId}
          target={target.target}
          presetAgentUserId={target.agent}
          onDone={() => setPickAgent(null)}
        />
      )}
    </div>
  );
}
