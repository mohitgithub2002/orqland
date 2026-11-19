import { registerAs } from '@nestjs/config';

/**
 * Configuration for the Delivery module (business rules, secrets, Surepass, uploads).
 * All environment access for the module lives here, next to app/database/firebase config.
 * Register it with `ConfigModule.forRoot({ load: [..., deliveryConfigFactory] })` to read it through ConfigService too.
 */
const num = (name: string, fallback: number) => {
  const raw = process.env[name];
  const value = raw === undefined || raw === '' ? NaN : Number(raw);
  return Number.isFinite(value) ? value : fallback;
};

/** Secrets are read lazily so the app boots without them; the feature that needs one fails clearly. */
function secret(name: string, minLength = 32): string {
  const value = process.env[name];
  if (!value || value.length < minLength) throw new Error(`${name} must be set to a secret of at least ${minLength} characters`);
  return value;
}

export type SurepassMode = 'live' | 'mock';

/** SUREPASS_MODE: unset → mock for local development, but live when NODE_ENV=production (review §5.1). */
export function resolveSurepassMode(mode: string | undefined, nodeEnv: string | undefined): SurepassMode {
  if (mode === 'live' || mode === 'mock') return mode;
  if (mode) throw new Error(`SUREPASS_MODE must be "live" or "mock", got "${mode}"`);
  return nodeEnv === 'production' ? 'live' : 'mock';
}

export const deliveryConfig = {
  /** Orqland business rules (not Surepass requirements): licence every 12 months, vehicle every 4 months. */
  licenceReKycMonths: num('DA_LICENCE_REKYC_MONTHS', 12),
  vehicleReKycMonths: num('DA_VEHICLE_REKYC_MONTHS', 4),
  reKycReminderDays: num('DA_REKYC_REMINDER_DAYS', 15),

  maxAgentsPerWorkspace: num('DELIVERY_MAX_AGENTS_PER_WORKSPACE', 5),
  maxWorkspacesPerAgent: num('DELIVERY_MAX_WORKSPACES_PER_AGENT', 5),
  maxPendingInvitesPerWorkspace: num('DELIVERY_MAX_PENDING_INVITES', 10),
  maxInvitesToSameAgentPer30Days: num('DELIVERY_MAX_REINVITES_30D', 3),
  inviteExpiryDays: num('DELIVERY_INVITE_EXPIRY_DAYS', 7),

  locationRetentionDays: num('DELIVERY_LOCATION_RETENTION_DAYS', 90),
  minPingIntervalSeconds: num('DELIVERY_MIN_PING_INTERVAL_SECONDS', 5),
  staleLocationSeconds: num('DELIVERY_STALE_LOCATION_SECONDS', 120),
  maxPingAccuracyMeters: num('DELIVERY_MAX_PING_ACCURACY_M', 100),
  /** Billable km defaults to min(measured, estimated × this factor) when both exist. */
  measuredDistanceCapFactor: num('DELIVERY_MEASURED_DISTANCE_CAP', 1.5),
  /** SLA targets (minutes) used by the operations overview. */
  /** Agents must be within this distance of the pickup point to confirm pickup. */
  pickupGeofenceMeters: num('DELIVERY_PICKUP_GEOFENCE_METERS', 50),
  /** A reported position less accurate than this cannot be used for the pickup geofence. */
  pickupGeofenceMaxAccuracyMeters: num('DELIVERY_PICKUP_GEOFENCE_MAX_ACCURACY_M', 100),
  slaAcceptMinutes: num('DELIVERY_SLA_ACCEPT_MINUTES', 10),
  slaPickupMinutes: num('DELIVERY_SLA_PICKUP_MINUTES', 20),
  slaDeliverMinutes: num('DELIVERY_SLA_DELIVER_MINUTES', 45),

  allowSharedVehicle: process.env.DA_ALLOW_SHARED_VEHICLE === 'true',
  requireNameMatch: process.env.DA_REQUIRE_NAME_MATCH !== 'false',
  consentVersion: process.env.DA_CONSENT_VERSION ?? '2026-11',

  secrets: {
    /** DA_ENCRYPTION_KEY — 32-byte key as 64 hex characters (validated by KycCryptoService). */
    encryptionKey: () => process.env.DA_ENCRYPTION_KEY,
    fingerprintSecret: () => secret('DA_FINGERPRINT_SECRET'),
    /** Optional separate secret for delivery OTPs; defaults to the fingerprint secret. */
    otpSecret: () => process.env.DELIVERY_OTP_SECRET || secret('DA_FINGERPRINT_SECRET'),
  },

  surepass: {
    mode: resolveSurepassMode(process.env.SUREPASS_MODE, process.env.NODE_ENV),
    baseUrl: process.env.SUREPASS_BASE_URL ?? 'https://kyc-api.surepass.io',
    dlPath: process.env.SUREPASS_DL_PATH ?? '/api/v1/driving-license/driving-license',
    rcPath: process.env.SUREPASS_RC_PATH ?? '/api/v1/rc/rc-full',
    timeoutMs: num('SUREPASS_TIMEOUT_MS', 15000),
    apiToken: () => process.env.SUREPASS_API_TOKEN,
  },

  uploads: {
    /** Local encrypted storage for the standalone build; swap DeliveryFileStorage for GCP storage on merge. */
    dir: process.env.DELIVERY_UPLOAD_DIR ?? '.data/delivery-uploads',
    maxBytes: num('DELIVERY_UPLOAD_MAX_BYTES', 8 * 1024 * 1024),
  },
};

export type DeliveryConfig = typeof deliveryConfig;

export default registerAs('delivery', () => deliveryConfig);
