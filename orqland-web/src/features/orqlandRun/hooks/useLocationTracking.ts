'use client';

import { useEffect, useRef, useState } from 'react';
import { runService } from '../services/run.service';

const SEND_EVERY_MS = 15_000;

export type TrackingState = 'off' | 'starting' | 'active' | 'denied' | 'unavailable';

export interface Tracking {
  state: TrackingState;
  position: { lat: number; lng: number; accuracy: number | null } | null;
  /** When the engine last accepted a ping. */
  lastSentAt: number | null;
  /** Engine rejected the last ping (e.g. too inaccurate) — shown to the agent. */
  lastRejected: boolean;
}

/**
 * Purpose-limited location sharing (guide §7): only while the agent is ONLINE or carrying a delivery,
 * at most every 15 s, and it stops as soon as `enabled` turns false. State is surfaced to the agent.
 */
export function useLocationTracking(enabled: boolean): Tracking {
  const [tracking, setTracking] = useState<Tracking>({ state: 'off', position: null, lastSentAt: null, lastRejected: false });
  const lastSent = useRef(0);

  useEffect(() => {
    if (!enabled) {
      setTracking((t) => ({ ...t, state: 'off' }));
      return;
    }
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setTracking((t) => ({ ...t, state: 'unavailable' }));
      return;
    }
    setTracking((t) => ({ ...t, state: 'starting' }));
    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const position = { lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy ?? null };
        setTracking((t) => ({ ...t, state: 'active', position }));
        if (Date.now() - lastSent.current < SEND_EVERY_MS) return;
        lastSent.current = Date.now();
        void runService
          .recordLocation({
            lat: Number(pos.coords.latitude.toFixed(6)),
            lng: Number(pos.coords.longitude.toFixed(6)),
            accuracyM: pos.coords.accuracy ?? undefined,
            speedMps: pos.coords.speed ?? undefined,
            heading: pos.coords.heading ?? undefined,
            recordedAt: new Date(pos.timestamp).toISOString(),
          })
          .then((r) => setTracking((t) => ({ ...t, lastSentAt: Date.now(), lastRejected: !r.recordMyLocation.accepted })))
          .catch(() => setTracking((t) => ({ ...t, lastRejected: true })));
      },
      (err) => setTracking((t) => ({ ...t, state: err.code === err.PERMISSION_DENIED ? 'denied' : 'unavailable' })),
      { enableHighAccuracy: true, maximumAge: 10_000, timeout: 20_000 },
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, [enabled]);

  return tracking;
}
