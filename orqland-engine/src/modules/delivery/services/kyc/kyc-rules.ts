import type { KycAttemptStatus, VehicleCategory } from '@/infrastructure/database/schema';
import { namesMatch } from '../../helpers/kyc-normalize';
import type { DrivingLicenceResult, VehicleRcResult } from './surepass.client';

export interface CheckEvaluation {
  status: Extract<KycAttemptStatus, 'PASSED' | 'FAILED' | 'MISMATCH' | 'PROVIDER_UNAVAILABLE'>;
  mismatchFields: string[];
  reason: string | null;
  validTo: string | null;
  notes: string[];
}

const today = () => new Date().toISOString().slice(0, 10);

/**
 * Explicit, configurable eligibility rules (the reference guide asks for these to be defined, not assumed).
 * The licence holder and the vehicle owner are NOT required to be the same person.
 */
export function evaluateLicence(result: DrivingLicenceResult, expectedName: string, requireNameMatch: boolean): CheckEvaluation {
  const base = { mismatchFields: [] as string[], validTo: result.validTo, notes: [] as string[] };
  if (result.outcome === 'UNAVAILABLE') {
    return { ...base, status: 'PROVIDER_UNAVAILABLE', reason: 'Licence verification service is unavailable. Please retry shortly.' };
  }
  if (result.outcome !== 'VALID') {
    return { ...base, status: 'FAILED', reason: 'The driving licence could not be verified. Check the number and date of birth.' };
  }
  if (result.validTo && result.validTo < today()) {
    return { ...base, status: 'FAILED', reason: 'The driving licence has expired.' };
  }
  if (!result.validTo) base.notes.push('Provider returned no licence validity date');
  if (requireNameMatch && result.holderName && !namesMatch(result.holderName, expectedName)) {
    return {
      ...base,
      status: 'MISMATCH',
      mismatchFields: ['holder_name'],
      reason: 'The name on the licence does not match your Orqland profile. Your application is under manual review.',
    };
  }
  return { ...base, status: 'PASSED', reason: null };
}

const BLOCKING_RC_STATUS = /(BLACKLIST|SUSPEND|CANCEL|SURRENDER|DEREGIST)/i;

/** Maps an RC category code/description to the categories an agent may declare for it. */
export function compatibleCategories(rcCategory: string | null): VehicleCategory[] | null {
  if (!rcCategory) return null;
  const c = rcCategory.toUpperCase();
  if (/2W|MOTOR ?CYCLE|SCOOTER|MOPED/.test(c)) return ['SCOOTER', 'MOTORCYCLE'];
  if (/3W|RICKSHAW|E-?CART/.test(c)) return ['THREE_WHEELER'];
  if (/LGV|GOODS|MGV/.test(c)) return ['VAN'];
  if (/LMV|4W|MOTOR CAR|CAR/.test(c)) return ['CAR', 'VAN'];
  return null;
}

export function evaluateVehicle(result: VehicleRcResult, declared: VehicleCategory): CheckEvaluation {
  const base = { mismatchFields: [] as string[], validTo: result.validTo, notes: [] as string[] };
  if (result.outcome === 'UNAVAILABLE') {
    return { ...base, status: 'PROVIDER_UNAVAILABLE', reason: 'Vehicle verification service is unavailable. Please retry shortly.' };
  }
  if (result.outcome !== 'VALID') {
    return { ...base, status: 'FAILED', reason: 'The vehicle registration number could not be verified.' };
  }
  if (result.rcStatus && BLOCKING_RC_STATUS.test(result.rcStatus)) {
    return { ...base, status: 'FAILED', reason: 'The vehicle registration is not active.' };
  }
  if (result.validTo && result.validTo < today()) {
    return { ...base, status: 'FAILED', reason: 'The vehicle registration has expired.' };
  }
  const allowed = compatibleCategories(result.category);
  if (allowed === null) base.notes.push(`Unrecognised RC category "${result.category ?? 'none'}"`);
  else if (!allowed.includes(declared)) {
    return {
      ...base,
      status: 'MISMATCH',
      mismatchFields: ['vehicle_category'],
      reason: 'The vehicle type you selected does not match the registration record. Your application is under manual review.',
    };
  }
  return { ...base, status: 'PASSED', reason: null };
}
