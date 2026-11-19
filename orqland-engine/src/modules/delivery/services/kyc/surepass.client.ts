import { Injectable, Logger } from '@nestjs/common';
import { deliveryConfig } from '@/config/delivery.config';

export { resolveSurepassMode } from '@/config/delivery.config';

export type ProviderOutcome = 'VALID' | 'NOT_FOUND' | 'INVALID' | 'UNAVAILABLE';

export interface DrivingLicenceResult {
  outcome: ProviderOutcome;
  holderName: string | null;
  /** Non-transport validity (YYYY-MM-DD) when returned. */
  validTo: string | null;
  vehicleClasses: string[];
  reference: string | null;
  httpStatus: number | null;
  providerMessage: string | null;
}

export interface VehicleRcResult {
  outcome: ProviderOutcome;
  ownerName: string | null;
  /** Raw category code/description from the RC record, e.g. "2WN" / "Motor Cycle/Scooter(2WN)". */
  category: string | null;
  rcStatus: string | null;
  /** Registration / fitness validity (YYYY-MM-DD) when returned. */
  validTo: string | null;
  reference: string | null;
  httpStatus: number | null;
  providerMessage: string | null;
}

type Json = Record<string, unknown>;

/**
 * Surepass KYC client (driving licence + vehicle RC).
 * Configure with SUREPASS_BASE_URL, SUREPASS_API_TOKEN and optionally SUREPASS_DL_PATH / SUREPASS_RC_PATH.
 * SUREPASS_MODE: `live` | `mock`. When unset it defaults to `mock` so local development never crashes (review §5.1) —
 * except when NODE_ENV=production, where an unset mode is treated as `live` (mock results must never approve real agents).
 * Mock mode returns deterministic results for local development and tests:
 *   identifiers ending in 0000 → NOT_FOUND, licence ending in 9999 → expired,
 *   licence ending in 8888 → holder name mismatch (manual review), otherwise VALID.
 * Field extraction is defensive: different Surepass endpoints return different shapes.
 */
@Injectable()
export class SurepassClient {
  private readonly logger = new Logger('SurepassClient');
  private readonly mode = deliveryConfig.surepass.mode;
  private readonly baseUrl = deliveryConfig.surepass.baseUrl;
  private readonly dlPath = deliveryConfig.surepass.dlPath;
  private readonly rcPath = deliveryConfig.surepass.rcPath;
  private readonly timeoutMs = deliveryConfig.surepass.timeoutMs;

  async verifyDrivingLicence(
    licenceNumber: string,
    dob: string,
    mockHint?: { holderName: string },
  ): Promise<DrivingLicenceResult> {
    if (this.mode === 'mock') return this.mockLicence(licenceNumber, mockHint);
    const res = await this.post(this.dlPath, { id_number: licenceNumber, dob });
    const data = (res.body?.data ?? {}) as Json;
    return {
      outcome: res.outcome,
      holderName: str(data.name),
      validTo: date(data.doe) ?? date(data.non_transport_doe) ?? date(data.transport_doe),
      vehicleClasses: Array.isArray(data.vehicle_classes) ? data.vehicle_classes.map(String) : [],
      reference: str(data.client_id),
      httpStatus: res.httpStatus,
      providerMessage: str(res.body?.message),
    };
  }

  async verifyVehicleRc(vehicleNumber: string, mockHint?: { category: string }): Promise<VehicleRcResult> {
    if (this.mode === 'mock') return this.mockRc(vehicleNumber, mockHint);
    const res = await this.post(this.rcPath, { id_number: vehicleNumber });
    const data = (res.body?.data ?? {}) as Json;
    return {
      outcome: res.outcome,
      ownerName: str(data.owner_name),
      category: str(data.vehicle_category_description) ?? str(data.vehicle_category),
      rcStatus: str(data.rc_status) ?? str(data.blacklist_status),
      validTo: date(data.fit_up_to) ?? date(data.registration_upto) ?? date(data.rc_expiry_date),
      reference: str(data.client_id),
      httpStatus: res.httpStatus,
      providerMessage: str(res.body?.message),
    };
  }

  private async post(path: string, body: Json): Promise<{ outcome: ProviderOutcome; httpStatus: number | null; body: Json | null }> {
    const token = deliveryConfig.surepass.apiToken();
    if (!token) {
      this.logger.error('SUREPASS_API_TOKEN is not configured — verification reported as unavailable');
      return { outcome: 'UNAVAILABLE', httpStatus: null, body: null };
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await fetch(`${this.baseUrl}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      const json = (await response.json().catch(() => null)) as Json | null;
      if (response.ok && json?.success !== false) return { outcome: 'VALID', httpStatus: response.status, body: json };
      if (response.status === 404 || response.status === 422) {
        return { outcome: 'NOT_FOUND', httpStatus: response.status, body: json };
      }
      if (response.status >= 400 && response.status < 500 && response.status !== 429) {
        return { outcome: 'INVALID', httpStatus: response.status, body: json };
      }
      return { outcome: 'UNAVAILABLE', httpStatus: response.status, body: json };
    } catch (error) {
      this.logger.warn(`Surepass request failed: ${(error as Error).name}`);
      return { outcome: 'UNAVAILABLE', httpStatus: null, body: null };
    } finally {
      clearTimeout(timer);
    }
  }

  private mockLicence(licenceNumber: string, hint?: { holderName: string }): DrivingLicenceResult {
    const base = { vehicleClasses: ['MCWG', 'LMV'], reference: `mock_dl_${licenceNumber.slice(-4)}`, httpStatus: 200, providerMessage: null };
    if (licenceNumber.endsWith('0000')) return { ...base, outcome: 'NOT_FOUND', holderName: null, validTo: null, httpStatus: 422 };
    const validTo = licenceNumber.endsWith('9999') ? '2020-01-01' : `${new Date().getUTCFullYear() + 5}-12-31`;
    const holderName = licenceNumber.endsWith('8888') ? 'MISMATCHED PERSON' : (hint?.holderName ?? 'MOCK HOLDER');
    return { ...base, outcome: 'VALID', holderName, validTo };
  }

  private mockRc(vehicleNumber: string, hint?: { category: string }): VehicleRcResult {
    const base = { reference: `mock_rc_${vehicleNumber.slice(-4)}`, httpStatus: 200, providerMessage: null };
    if (vehicleNumber.endsWith('0000')) {
      return { ...base, outcome: 'NOT_FOUND', ownerName: null, category: null, rcStatus: null, validTo: null, httpStatus: 422 };
    }
    const category = hint?.category === 'CAR' || hint?.category === 'VAN' ? 'LMV' : hint?.category === 'THREE_WHEELER' ? '3WN' : '2WN';
    return { ...base, outcome: 'VALID', ownerName: 'MOCK OWNER', category, rcStatus: 'ACTIVE', validTo: `${new Date().getUTCFullYear() + 3}-06-30` };
  }
}

const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);

/** Normalizes provider dates (YYYY-MM-DD or DD-MM-YYYY / DD/MM/YYYY) to YYYY-MM-DD. */
function date(v: unknown): string | null {
  const s = str(v);
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const m = /^(\d{2})[-/](\d{2})[-/](\d{4})$/.exec(s);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}
