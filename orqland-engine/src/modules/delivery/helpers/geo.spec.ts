import { haversineKm, toLatLng, traceDistanceKm } from './geo';

describe('geo', () => {
  const chennaiCentral = { lat: 13.0827, lng: 80.2707 };
  const tNagar = { lat: 13.0418, lng: 80.2341 };

  it('computes straight-line distance', () => {
    expect(haversineKm(chennaiCentral, tNagar)).toBeCloseTo(6.06, 1);
    expect(haversineKm(tNagar, tNagar)).toBe(0);
  });

  it('sums a trace', () => {
    const mid = { lat: 13.06, lng: 80.25 };
    expect(traceDistanceKm([chennaiCentral, mid, tNagar])).toBeGreaterThan(haversineKm(chennaiCentral, tNagar) - 0.01);
    expect(traceDistanceKm([chennaiCentral])).toBe(0);
  });

  it('parses numeric strings', () => {
    expect(toLatLng('13.1', '80.2')).toEqual({ lat: 13.1, lng: 80.2 });
    expect(toLatLng(null, '80.2')).toBeNull();
  });
});
