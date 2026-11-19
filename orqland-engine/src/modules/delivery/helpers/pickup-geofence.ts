import { haversineKm, toLatLng } from './geo';

export interface GeofenceInput {
  pickupLat: string | number | null;
  pickupLng: string | number | null;
  lat?: number | null;
  lng?: number | null;
  accuracyM?: number | null;
}

export type GeofenceResult =
  | { ok: true; distanceM: number | null }
  | { ok: false; code: 'LOCATION_REQUIRED' | 'LOCATION_INACCURATE' | 'OUTSIDE_PICKUP_GEOFENCE'; message: string; distanceM: number | null };

/**
 * Pickup can only be confirmed at the pickup point: the agent's reported position must be within
 * `radiusM` metres (default 50). Tasks without pickup coordinates are not geofenced.
 */
export function checkPickupGeofence(input: GeofenceInput, radiusM: number, maxAccuracyM: number): GeofenceResult {
  const pickup = toLatLng(input.pickupLat, input.pickupLng);
  if (!pickup) return { ok: true, distanceM: null };
  if (input.lat === undefined || input.lat === null || input.lng === undefined || input.lng === null) {
    return { ok: false, code: 'LOCATION_REQUIRED', message: 'Turn on location to confirm pickup — it must be confirmed at the pickup point', distanceM: null };
  }
  if (input.accuracyM !== undefined && input.accuracyM !== null && input.accuracyM > maxAccuracyM) {
    return {
      ok: false,
      code: 'LOCATION_INACCURATE',
      message: `Your GPS position is too imprecise (±${Math.round(input.accuracyM)} m). Step outside or wait for a better signal, then try again`,
      distanceM: null,
    };
  }
  const distanceM = Math.round(haversineKm(pickup, { lat: input.lat, lng: input.lng }) * 1000);
  if (distanceM > radiusM) {
    return {
      ok: false,
      code: 'OUTSIDE_PICKUP_GEOFENCE',
      message: `You are ${distanceM >= 1000 ? `${(distanceM / 1000).toFixed(1)} km` : `${distanceM} m`} from the pickup point. Move within ${radiusM} m to confirm pickup`,
      distanceM,
    };
  }
  return { ok: true, distanceM };
}
