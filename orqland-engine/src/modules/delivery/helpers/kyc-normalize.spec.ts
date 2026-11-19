import {
  isPlausibleLicenceNumber,
  isPlausibleVehicleNumber,
  maskVehicleNumber,
  namesMatch,
  normalizeIdentifier,
} from './kyc-normalize';

describe('kyc normalization', () => {
  it('normalizes identifiers consistently', () => {
    expect(normalizeIdentifier(' tn-09 ab 1234 ')).toBe('TN09AB1234');
    expect(normalizeIdentifier('TN09/2015-0001234')).toBe('TN0920150001234');
  });

  it('validates formats', () => {
    expect(isPlausibleVehicleNumber('TN09AB1234')).toBe(true);
    expect(isPlausibleVehicleNumber('22BH1234AA')).toBe(true);
    expect(isPlausibleVehicleNumber('HELLO')).toBe(false);
    expect(isPlausibleLicenceNumber('TN0920150001234')).toBe(true);
    expect(isPlausibleLicenceNumber('1234')).toBe(false);
  });

  it('masks vehicle numbers', () => {
    expect(maskVehicleNumber('TN09AB1234')).toBe('TN09••••34');
  });

  it('matches names loosely', () => {
    expect(namesMatch('Shaju K', 'SHAJU KUMAR')).toBe(true);
    expect(namesMatch('Maria Susan', 'John Doe')).toBe(false);
    expect(namesMatch(null, 'x')).toBe(false);
  });
});
