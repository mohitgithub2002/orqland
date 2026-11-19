'use client';

import 'leaflet/dist/leaflet.css';
import { useEffect, useRef } from 'react';
import type { LayerGroup, Map as LeafletMap } from 'leaflet';
import { cn } from '@/lib/utils';

export type MapPointKind = 'pickup' | 'dropoff' | 'agent' | 'agent-stale' | 'me';

export interface MapPoint {
  id: string;
  lat: number;
  lng: number;
  kind: MapPointKind;
  label?: string;
  selected?: boolean;
}

export interface MapViewProps {
  points: MapPoint[];
  /** Planned leg (pickup → drop-off), drawn dashed. */
  plannedRoute?: [number, number][];
  /** Recorded GPS trace, drawn solid. */
  trace?: [number, number][];
  onSelect?: (id: string) => void;
  className?: string;
  ariaLabel: string;
  /** Used when there are no points yet (defaults to Chennai). */
  fallbackCenter?: [number, number];
  interactive?: boolean;
}

/**
 * Map-focused view for active deliveries (guide §7 and §11). Uses Leaflet with a configurable tile
 * source — NEXT_PUBLIC_MAP_TILE_URL / NEXT_PUBLIC_MAP_ATTRIBUTION — rendered in greyscale to match the
 * neutral design. Without tiles (offline / provider not configured) a quiet grid keeps markers readable.
 */
export function MapView({ points, plannedRoute, trace, onSelect, className, ariaLabel, fallbackCenter = [13.0827, 80.2707], interactive = true }: MapViewProps) {
  const host = useRef<HTMLDivElement>(null);
  const map = useRef<LeafletMap | null>(null);
  const layer = useRef<LayerGroup | null>(null);
  const leaflet = useRef<typeof import('leaflet') | null>(null);
  const fitted = useRef('');

  useEffect(() => {
    let disposed = false;
    void import('leaflet').then((L) => {
      if (disposed || !host.current || map.current) return;
      leaflet.current = L;
      const m = L.map(host.current, {
        zoomControl: interactive,
        attributionControl: true,
        scrollWheelZoom: false,
        dragging: interactive,
        doubleClickZoom: interactive,
        keyboard: interactive,
      }).setView(fallbackCenter, 12);
      L.tileLayer(process.env.NEXT_PUBLIC_MAP_TILE_URL ?? 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
        attribution: process.env.NEXT_PUBLIC_MAP_ATTRIBUTION ?? '&copy; OpenStreetMap contributors &copy; CARTO',
        maxZoom: 19,
      }).addTo(m);
      layer.current = L.layerGroup().addTo(m);
      map.current = m;
      draw();
    });
    return () => {
      disposed = true;
      map.current?.remove();
      map.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(draw);

  function draw() {
    const L = leaflet.current;
    const m = map.current;
    const group = layer.current;
    if (!L || !m || !group) return;
    group.clearLayers();
    if (plannedRoute && plannedRoute.length > 1) {
      L.polyline(plannedRoute, { color: '#0b0b0b', weight: 2, opacity: 0.55, dashArray: '4 6' }).addTo(group);
    }
    if (trace && trace.length > 1) {
      L.polyline(trace, { color: '#0b0b0b', weight: 3, opacity: 0.9, lineCap: 'round', lineJoin: 'round' }).addTo(group);
    }
    for (const p of points) {
      const marker = L.marker([p.lat, p.lng], { icon: L.divIcon({ className: 'ops-marker', html: markerHtml(p), iconSize: [30, 30], iconAnchor: [15, 15] }), keyboard: !!onSelect, title: p.label });
      if (p.label) marker.bindTooltip(p.label, { direction: 'top', offset: [0, -14] });
      if (onSelect) marker.on('click', () => onSelect(p.id));
      marker.addTo(group);
    }
    const all: [number, number][] = [...points.map((p) => [p.lat, p.lng] as [number, number]), ...(trace ?? []), ...(plannedRoute ?? [])];
    const signature = all.map((c) => c.join(',')).join('|');
    if (all.length && signature !== fitted.current) {
      fitted.current = signature;
      if (all.length === 1) m.setView(all[0], 14);
      else m.fitBounds(L.latLngBounds(all), { padding: [36, 36], maxZoom: 15 });
    }
  }

  return (
    <div className={cn('relative isolate overflow-hidden rounded-lg border border-border', className)}>
      <div ref={host} role="application" aria-label={ariaLabel} className="ops-map size-full min-h-[220px]" />
      <ul className="sr-only">
        {points.map((p) => (
          <li key={p.id}>
            {KIND_LABEL[p.kind]}: {p.label ?? ''} ({p.lat.toFixed(4)}, {p.lng.toFixed(4)})
          </li>
        ))}
      </ul>
      <MapLegend kinds={[...new Set(points.map((p) => p.kind))]} />
    </div>
  );
}

const KIND_LABEL: Record<MapPointKind, string> = {
  pickup: 'Pickup',
  dropoff: 'Drop-off',
  agent: 'Agent (live)',
  'agent-stale': 'Agent (stale location)',
  me: 'You',
};

function markerHtml(p: MapPoint): string {
  const ring = p.selected ? 'box-shadow:0 0 0 3px #fff,0 0 0 5px #0b0b0b;' : 'box-shadow:0 0 0 2px #fff;';
  switch (p.kind) {
    case 'pickup':
      return `<span style="display:flex;align-items:center;justify-content:center;width:22px;height:22px;background:#0b0b0b;color:#fff;font:600 11px/1 Inter,sans-serif;border-radius:4px;${ring}">P</span>`;
    case 'dropoff':
      return `<span style="display:flex;align-items:center;justify-content:center;width:22px;height:22px;background:#fff;color:#0b0b0b;border:2px solid #0b0b0b;font:600 11px/1 Inter,sans-serif;border-radius:999px;${ring}">D</span>`;
    case 'agent-stale':
      return `<span style="display:block;width:16px;height:16px;background:#a3a29c;border-radius:999px;${ring}"></span>`;
    case 'me':
    case 'agent':
    default:
      return `<span style="position:relative;display:block;width:16px;height:16px"><span class="ops-ping" style="position:absolute;inset:0;border-radius:999px;background:#0b8a0b"></span><span style="position:relative;display:block;width:16px;height:16px;background:#0b0b0b;border-radius:999px;${ring}"></span></span>`;
  }
}

function MapLegend({ kinds }: { kinds: MapPointKind[] }) {
  if (!kinds.length) return null;
  return (
    <div className="pointer-events-none absolute bottom-2 left-2 z-[400] flex flex-wrap gap-x-3 gap-y-1 rounded-md bg-card/95 px-2 py-1 text-[11px] text-muted-foreground shadow-sm">
      {kinds.map((k) => (
        <span key={k} className="inline-flex items-center gap-1">
          <span
            aria-hidden
            className={cn(
              'inline-block size-2.5',
              k === 'pickup' && 'rounded-[2px] bg-foreground',
              k === 'dropoff' && 'rounded-full border-2 border-foreground bg-card',
              (k === 'agent' || k === 'me') && 'rounded-full bg-foreground',
              k === 'agent-stale' && 'rounded-full bg-muted-foreground/60',
            )}
          />
          {KIND_LABEL[k]}
        </span>
      ))}
    </div>
  );
}
