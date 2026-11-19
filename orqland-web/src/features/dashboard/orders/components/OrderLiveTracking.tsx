'use client';

import Link from 'next/link';
import { MapView, type MapPoint } from '@/components/ui/map-view';
import { useNow } from '@/features/dashboard/common/hooks/useNow';
import { formatKm, timeAgo } from '@/features/dashboard/common/utils/format';
import { haversineKm } from '@/features/dashboard/common/utils/geo';
import { useDeliveryTask, useTaskTrace } from '@/features/dashboard/delivery/hooks/useDelivery';
import { cn } from '@/lib/utils';
import type { Order } from '../types/order.types';
import { formatClock, travelMinutes } from '../utils/order-display';
import { PartnerDetails } from './cards/DeliveryPartner';
import { DELIVERY_PAGE_HREF } from './OrderActions';

const MOVING = ['ACCEPTED', 'ARRIVING_AT_PICKUP', 'PICKED_UP', 'IN_TRANSIT'];
const STALE_MS = 3 * 60_000;
const pt = (lat: number | null | undefined, lng: number | null | undefined) => (lat === null || lat === undefined || lng === null || lng === undefined ? null : { lat, lng });

/** Live delivery tracking inside the order view: agent position, recorded route, distance and ETA. */
export function OrderLiveTracking({ order }: { order: Order }) {
  const d = order.delivery!;
  const now = useNow(5_000);
  const task = useDeliveryTask(d.id); // refreshes every 10 s
  const t = task.data;
  const status = t?.status ?? d.status;
  const isAgent = d.mode === 'AGENT';
  const trace = useTaskTrace(isAgent && status !== 'PENDING_ASSIGNMENT' && status !== 'OFFERED' ? d.id : null);
  const agent = t?.agent ?? d.agent;
  const pickup = pt(t?.pickupLat ?? d.pickupLat, t?.pickupLng ?? d.pickupLng);
  const dropoff = pt(t?.dropoffLat ?? d.dropoffLat, t?.dropoffLng ?? d.dropoffLng) ?? pt(order.deliveryAddressSnapshot?.latitude, order.deliveryAddressSnapshot?.longitude);
  const moving = MOVING.includes(status);
  const agentPos = isAgent && moving ? pt(agent?.lastLat, agent?.lastLng) : null;
  const seenAt = agent?.lastLocationAt ? new Date(agent.lastLocationAt).getTime() : null;
  const stale = !seenAt || now - seenAt > STALE_MS;
  const toPickup = ['ACCEPTED', 'ARRIVING_AT_PICKUP'].includes(status);
  const target = toPickup ? pickup : dropoff;
  const km = agentPos && target ? haversineKm(agentPos, target) : null;
  const eta = travelMinutes(km);

  const points: MapPoint[] = [];
  if (pickup) points.push({ id: 'pickup', kind: 'pickup', label: 'Pickup · your workspace', ...pickup });
  if (dropoff) points.push({ id: 'dropoff', kind: 'dropoff', label: `Drop-off · ${order.buyerSnapshot.name}`, ...dropoff });
  if (agentPos) points.push({ id: 'agent', kind: stale ? 'agent-stale' : 'agent', label: agent?.displayName ?? 'Agent', selected: true, ...agentPos });

  const steps = [
    { label: isAgent ? 'Agent assigned' : 'Staff assigned', at: t?.acceptedAt ?? d.acceptedAt ?? (isAgent ? null : d.createdAt) },
    { label: 'Picked up', at: t?.pickedUpAt ?? d.pickedUpAt },
    { label: status === 'FAILED' ? 'Delivery failed' : 'Delivered', at: t?.deliveredAt ?? order.deliveredAt, problem: status === 'FAILED' },
  ];

  return (
    <section aria-labelledby="tracking-heading" className="rounded-2xl bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 id="tracking-heading" className="flex items-center gap-2 text-[15px] font-bold">
          {moving && isAgent && <span aria-hidden className={cn('size-2 rounded-full', stale ? 'bg-gray-400' : 'animate-pulse bg-green-600')} />}
          Delivery tracking
        </h3>
        <Link href={`${DELIVERY_PAGE_HREF}?tab=live&task=${d.id}`} className="text-[12px] text-gray-500 underline underline-offset-2 hover:text-gray-950">
          Open in Delivery
        </Link>
      </div>

      {(pickup || dropoff) && (
        <MapView
          points={points}
          plannedRoute={pickup && dropoff ? [[pickup.lat, pickup.lng], [dropoff.lat, dropoff.lng]] : undefined}
          trace={(trace.data ?? []).map((p) => [p.lat, p.lng] as [number, number])}
          ariaLabel={`Delivery map for order ${order.orderNumber}`}
          className="h-72"
        />
      )}

      <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
        <Stat label={toPickup ? 'To the workspace' : 'To the customer'} value={km !== null ? formatKm(km) : '—'} />
        <Stat label="ETA" value={eta !== null && moving ? `~${eta} min` : '—'} />
        <Stat label="Location" value={!isAgent ? 'Not shared' : seenAt ? timeAgo(agent?.lastLocationAt) : 'Waiting'} warn={isAgent && moving && stale} />
      </dl>
      {isAgent && moving && stale && <p className="mt-2 text-[12px] text-amber-700">No fresh location from the agent for a few minutes — call them if the delivery seems stuck.</p>}
      {!isAgent && <p className="mt-2 text-[12px] text-gray-500">Own-staff deliveries don’t share a live location. Update the status from the order card.</p>}

      <div className="mt-3">
        <PartnerDetails order={order} compact />
      </div>

      <ol className="mt-3 grid grid-cols-3 gap-2">
        {steps.map((s) => (
          <li key={s.label} className={cn('rounded-lg border-t-4 bg-gray-50 px-2.5 py-2', s.at ? (s.problem ? 'border-red-500' : 'border-gray-950') : 'border-gray-200')}>
            <p className="text-[11.5px] font-semibold text-gray-950">{s.label}</p>
            <p className="text-[11px] text-gray-500">{s.at ? formatClock(s.at) : 'Pending'}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}

function Stat({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className={cn('rounded-lg bg-gray-100 px-2 py-2', warn && 'bg-amber-50')}>
      <dt className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">{label}</dt>
      <dd className="text-[14px] font-bold tabular-nums text-gray-950">{value}</dd>
    </div>
  );
}
