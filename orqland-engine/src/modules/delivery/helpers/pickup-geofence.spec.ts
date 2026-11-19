import { checkPickupGeofence } from './pickup-geofence';

const pickup = { pickupLat: '13.060400', pickupLng: '80.249600' };

describe('checkPickupGeofence', () => {
  it('accepts a position within 50 m', () => {
    const r = checkPickupGeofence({ ...pickup, lat: 13.0606, lng: 80.2497, accuracyM: 10 }, 50, 100);
    expect(r).toMatchObject({ ok: true });
    expect(r.distanceM).toBeLessThanOrEqual(50);
  });

  it('rejects a position outside the radius with the distance in the message', () => {
    const r = checkPickupGeofence({ ...pickup, lat: 13.0612, lng: 80.2501 }, 50, 100);
    expect(r).toMatchObject({ ok: false, code: 'OUTSIDE_PICKUP_GEOFENCE' });
    if (!r.ok) expect(r.message).toMatch(/\d+ m from the pickup point\. Move within 50 m/);
  });

  it('requires a location and rejects imprecise fixes', () => {
    expect(checkPickupGeofence({ ...pickup }, 50, 100)).toMatchObject({ ok: false, code: 'LOCATION_REQUIRED' });
    expect(checkPickupGeofence({ ...pickup, lat: 13.0604, lng: 80.2496, accuracyM: 250 }, 50, 100)).toMatchObject({ ok: false, code: 'LOCATION_INACCURATE' });
  });

  it('does not geofence tasks without pickup coordinates', () => {
    expect(checkPickupGeofence({ pickupLat: null, pickupLng: null }, 50, 100)).toEqual({ ok: true, distanceM: null });
  });
});
