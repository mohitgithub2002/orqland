import { fromPaise, percentOfPaise, toPaise } from '@/core/utils/money';

describe('money helpers', () => {
  it('round-trips numeric strings', () => {
    expect(toPaise('199.5')).toBe(19950);
    expect(toPaise('0.05')).toBe(5);
    expect(toPaise('-12.30')).toBe(-1230);
    expect(fromPaise(19950)).toBe('199.50');
    expect(fromPaise(-1230)).toBe('-12.30');
  });

  it('computes GST with half-up rounding', () => {
    expect(percentOfPaise(9999, '18')).toBe(1800);
    expect(percentOfPaise(1000, '5')).toBe(50);
  });
});
