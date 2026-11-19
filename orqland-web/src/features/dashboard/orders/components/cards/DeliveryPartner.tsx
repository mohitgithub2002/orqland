'use client';

import { Bike, Phone } from 'lucide-react';
import { useState } from 'react';
import { formatKm, timeAgo } from '@/features/dashboard/common/utils/format';
import { gqlErrorMessage } from '@/features/dashboard/common/utils/gqlError';
import { agentBlocker, distanceFromPickup, DispatchDialog } from '@/features/dashboard/delivery/components/DispatchDialog';
import { OfferCountdown } from '@/features/dashboard/delivery/components/OfferCountdown';
import { useDeliveryAction, useDeliveryAgents, useDeliverySettings } from '@/features/dashboard/delivery/hooks/useDelivery';
import { cn } from '@/lib/utils';
import type { Order } from '../../types/order.types';
import { agentDistanceKm } from '../../utils/order-display';
import { ActionButton, InlineError } from './parts';

const AUTO = '__auto__';

/**
 * Pick a delivery partner while the order is still being prepared, so the agent travels to the
 * workspace during preparation. The engine accepts dispatch from PREPARING; pickup is only
 * possible once the order is marked prepared.
 */
export function AssignDeliveryPartner({ order, orqspaceId }: { order: Order; orqspaceId: string }) {
  const settings = useDeliverySettings(orqspaceId);
  const agents = useDeliveryAgents(orqspaceId, ['ACTIVE']);
  const dispatch = useDeliveryAction('dispatch');
  const [choice, setChoice] = useState(AUTO);
  const [moreOpen, setMoreOpen] = useState(false);
  const noPickup = settings.data && !settings.data.readyForAgentDispatch;
  const sorted = [...(agents.data ?? [])].sort(
    (a, b) => Number(!!agentBlocker(a)) - Number(!!agentBlocker(b)) || (distanceFromPickup(a, settings.data) ?? 99) - (distanceFromPickup(b, settings.data) ?? 99),
  );
  const assign = () =>
    dispatch.mutate({ orderId: order.id, mode: 'AGENT', assignmentType: choice === AUTO ? 'AUTO' : 'MANUAL', agentUserId: choice === AUTO ? undefined : choice });

  return (
    <div className="rounded-xl border border-dashed border-gray-300 p-3">
      <label htmlFor={`partner-${order.id}`} className="mb-1.5 block text-[11px] font-medium uppercase tracking-wide text-gray-500">
        Delivery partner
      </label>
      {noPickup ? (
        <p className="text-[12px] text-gray-600">Set the pickup location in Delivery → Settings before assigning agents.</p>
      ) : (
        <div className="flex gap-2">
          <select
            id={`partner-${order.id}`}
            value={choice}
            onChange={(e) => setChoice(e.target.value)}
            className="h-10 min-w-0 flex-1 rounded-lg border border-gray-300 bg-white px-2.5 text-[13px] focus-visible:outline-2 focus-visible:outline-gray-900"
          >
            <option value={AUTO}>Auto-assign (nearest)</option>
            {sorted.map((c) => {
              const blocker = agentBlocker(c);
              const km = distanceFromPickup(c, settings.data);
              return (
                <option key={c.id} value={c.agentUserId} disabled={!!blocker}>
                  {c.agent.displayName} · {blocker ?? (km !== null ? `${km.toFixed(1)} km away` : 'location unknown')}
                </option>
              );
            })}
          </select>
          <ActionButton onClick={assign} disabled={dispatch.isPending}>
            {dispatch.isPending ? 'Assigning…' : 'Assign'}
          </ActionButton>
        </div>
      )}
      <button type="button" onClick={() => setMoreOpen(true)} className="mt-1.5 text-[11.5px] text-gray-500 underline underline-offset-2 hover:text-gray-900">
        Deliver with own staff instead
      </button>
      <InlineError message={dispatch.error ? gqlErrorMessage(dispatch.error) : null} />
      {moreOpen && <DispatchDialog open onOpenChange={setMoreOpen} orqspaceId={orqspaceId} target={{ kind: 'dispatch', orderId: order.id, orderNumber: order.orderNumber }} />}
    </div>
  );
}

const STEP: Record<string, string> = {
  PENDING_ASSIGNMENT: 'Looking for an agent',
  OFFERED: 'Offer sent',
  ACCEPTED: 'Accepted the delivery',
  ARRIVING_AT_PICKUP: 'Heading to the workspace',
  PICKED_UP: 'Picked up',
  IN_TRANSIT: 'On the way to the customer',
  DELIVERED: 'Delivered',
  FAILED: 'Delivery failed',
};

/** Assigned delivery partner (agent or own staff) with live progress. */
export function PartnerDetails({ order, onTrack, compact }: { order: Order; onTrack?: () => void; compact?: boolean }) {
  const d = order.delivery;
  if (!d) return null;
  const self = d.mode === 'SELF';
  const name = self ? (d.selfStaffName ?? 'Own staff') : (d.agent?.displayName ?? d.currentOffer?.agentName ?? 'Finding an agent');
  const phone = self ? d.selfStaffPhone : d.agent?.phone;
  const prePickup = ['ACCEPTED', 'ARRIVING_AT_PICKUP'].includes(d.status);
  const km = agentDistanceKm(order, prePickup ? 'pickup' : 'dropoff');
  const stale = d.agent?.lastLocationAt ? Date.now() - new Date(d.agent.lastLocationAt).getTime() > 3 * 60_000 : true;
  return (
    <div className={cn('rounded-xl bg-gray-100 p-3', d.needsAttention && 'ring-2 ring-red-300')}>
      <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-gray-500">{self ? 'Own delivery' : 'Delivery partner'}</p>
      <div className="flex items-center gap-3">
        <span aria-hidden className="flex size-10 shrink-0 items-center justify-center rounded-full bg-gray-950 text-white">
          <Bike className="size-4.5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[14px] font-semibold text-gray-950">{name}</span>
          <span className="block truncate text-[11.5px] text-gray-500">
            {prePickup && km !== null && km <= 0.1 ? 'At the workspace' : (STEP[d.status] ?? d.status)}
            {!self && d.agent && ` · ${d.agent.vehicleNumberMasked}`}
          </span>
        </span>
        {phone && (
          <a href={`tel:${phone}`} aria-label={`Call ${name}`} className="flex size-9 items-center justify-center rounded-full bg-white text-gray-900 shadow-sm hover:bg-gray-50">
            <Phone className="size-4" />
          </a>
        )}
      </div>
      {!compact && (
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[12px] text-gray-600">
          {d.status === 'OFFERED' && d.currentOffer ? (
            <OfferCountdown expiresAt={d.currentOffer.expiresAt} className="tabular-nums" />
          ) : km !== null ? (
            <span>
              {formatKm(km)} {prePickup ? 'from the workspace' : 'from the customer'}
              {stale && d.agent?.lastLocationAt && ` · seen ${timeAgo(d.agent.lastLocationAt)}`}
            </span>
          ) : (
            <span>{self ? 'Update the status as your staff delivers.' : 'Waiting for the agent’s location'}</span>
          )}
          {onTrack && !self && (
            <button type="button" onClick={onTrack} className="font-semibold text-gray-950 underline underline-offset-2">
              Track live
            </button>
          )}
        </div>
      )}
      {d.needsAttention && d.attentionReason && <p className="mt-1.5 text-[12px] text-red-700">{d.attentionReason}</p>}
    </div>
  );
}
