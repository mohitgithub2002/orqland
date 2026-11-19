import { compatibleCategories, evaluateLicence, evaluateVehicle } from './kyc-rules';
import type { DrivingLicenceResult, VehicleRcResult } from './surepass.client';

const dl = (over: Partial<DrivingLicenceResult> = {}): DrivingLicenceResult => ({
  outcome: 'VALID',
  holderName: 'SHAJU KUMAR',
  validTo: '2099-01-01',
  vehicleClasses: [],
  reference: null,
  httpStatus: 200,
  providerMessage: null,
  ...over,
});

const rc = (over: Partial<VehicleRcResult> = {}): VehicleRcResult => ({
  outcome: 'VALID',
  ownerName: 'SOMEONE ELSE',
  category: 'Motor Cycle/Scooter(2WN)',
  rcStatus: 'ACTIVE',
  validTo: '2099-01-01',
  reference: null,
  httpStatus: 200,
  providerMessage: null,
  ...over,
});

describe('KYC rules', () => {
  it('passes a valid licence with a matching name', () => {
    expect(evaluateLicence(dl(), 'Shaju', true).status).toBe('PASSED');
  });

  it('flags name mismatch for manual review', () => {
    const result = evaluateLicence(dl({ holderName: 'JOHN DOE' }), 'Shaju', true);
    expect(result.status).toBe('MISMATCH');
    expect(result.mismatchFields).toEqual(['holder_name']);
    expect(evaluateLicence(dl({ holderName: 'JOHN DOE' }), 'Shaju', false).status).toBe('PASSED');
  });

  it('fails expired or unknown licences and reports outages separately', () => {
    expect(evaluateLicence(dl({ validTo: '2001-01-01' }), 'Shaju', true).status).toBe('FAILED');
    expect(evaluateLicence(dl({ outcome: 'NOT_FOUND' }), 'Shaju', true).status).toBe('FAILED');
    expect(evaluateLicence(dl({ outcome: 'UNAVAILABLE' }), 'Shaju', true).status).toBe('PROVIDER_UNAVAILABLE');
  });

  it('does not require the vehicle owner to be the licence holder', () => {
    expect(evaluateVehicle(rc(), 'SCOOTER').status).toBe('PASSED');
  });

  it('checks category compatibility and RC status', () => {
    expect(evaluateVehicle(rc(), 'CAR').status).toBe('MISMATCH');
    expect(evaluateVehicle(rc({ rcStatus: 'BLACKLISTED' }), 'SCOOTER').status).toBe('FAILED');
    expect(evaluateVehicle(rc({ category: 'XYZ' }), 'CAR').status).toBe('PASSED');
  });

  it('maps RC categories', () => {
    expect(compatibleCategories('LMV')).toEqual(['CAR', 'VAN']);
    expect(compatibleCategories('3WT')).toEqual(['THREE_WHEELER']);
    expect(compatibleCategories(null)).toBeNull();
  });
});
