import { addMonths, normalizePeriod, periodMonthFor } from './period';

describe('period helpers', () => {
  it('uses the workspace timezone for month boundaries', () => {
    const lateUtc = new Date('2026-10-31T20:00:00Z'); // 1 Nov 01:30 in India
    expect(periodMonthFor(lateUtc, 'Asia/Kolkata')).toBe('2026-11-01');
    expect(periodMonthFor(lateUtc, 'UTC')).toBe('2026-10-01');
  });

  it('normalizes period inputs', () => {
    expect(normalizePeriod('2026-11')).toBe('2026-11-01');
    expect(() => normalizePeriod('2026-13')).toThrow();
  });

  it('adds months', () => {
    expect(addMonths(new Date('2026-01-15T00:00:00Z'), 4).toISOString()).toBe('2026-05-15T00:00:00.000Z');
  });
});
