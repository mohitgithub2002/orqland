import { Injectable } from '@nestjs/common';
import { createCipheriv, createDecipheriv, createHmac, randomBytes } from 'crypto';
import { deliveryConfig } from '@/config/delivery.config';

/**
 * Encryption at rest (AES-256-GCM) and keyed fingerprints (HMAC-SHA-256) for KYC identifiers.
 * Keys come from the environment / secret manager and are never stored in the database.
 *   DA_ENCRYPTION_KEY       — 32-byte key as 64 hex characters (e.g. `openssl rand -hex 32`); encrypts licence/vehicle numbers and DOB
 *   DA_FINGERPRINT_SECRET   — keys duplicate-detection fingerprints (rotate only with a re-fingerprint migration)
 */
@Injectable()
export class KycCryptoService {
  private encKey?: Buffer;
  private fpSecret?: string;

  encrypt(plain: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.encryptionKey(), iv);
    const ciphertext = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
    return ['v1', iv.toString('base64'), cipher.getAuthTag().toString('base64'), ciphertext.toString('base64')].join(':');
  }

  decrypt(payload: string): string {
    const [version, iv, tag, ciphertext] = payload.split(':');
    if (version !== 'v1') throw new Error('Unsupported ciphertext version');
    const decipher = createDecipheriv('aes-256-gcm', this.encryptionKey(), Buffer.from(iv, 'base64'));
    decipher.setAuthTag(Buffer.from(tag, 'base64'));
    return Buffer.concat([decipher.update(Buffer.from(ciphertext, 'base64')), decipher.final()]).toString('utf8');
  }

  /** Binary variant for uploaded documents: [12-byte IV | 16-byte tag | ciphertext]. */
  encryptBuffer(plain: Buffer): Buffer {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.encryptionKey(), iv);
    const ciphertext = Buffer.concat([cipher.update(plain), cipher.final()]);
    return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]);
  }

  decryptBuffer(payload: Buffer): Buffer {
    const decipher = createDecipheriv('aes-256-gcm', this.encryptionKey(), payload.subarray(0, 12));
    decipher.setAuthTag(payload.subarray(12, 28));
    return Buffer.concat([decipher.update(payload.subarray(28)), decipher.final()]);
  }

  /** Inputs must already be normalized (see normalizeIdentifier). */
  fingerprints(normalizedLicence: string, normalizedVehicle: string) {
    return {
      licenceFp: this.hmac(`DL|${normalizedLicence}`),
      vehicleFp: this.hmac(`RC|${normalizedVehicle}`),
      combinedFp: this.hmac(`DA|${normalizedLicence}|${normalizedVehicle}`),
    };
  }

  private hmac(value: string): string {
    this.fpSecret ??= deliveryConfig.secrets.fingerprintSecret();
    return createHmac('sha256', this.fpSecret).update(value).digest('hex');
  }

  private encryptionKey(): Buffer {
    this.encKey ??= parseEncryptionKey(deliveryConfig.secrets.encryptionKey());
    return this.encKey;
  }
}

/** AES-256 needs exactly 32 bytes; the key is supplied as 64 hexadecimal characters (review §5.1). */
export function parseEncryptionKey(value: string | undefined): Buffer {
  if (!value || !/^[0-9a-fA-F]{64}$/.test(value.trim())) {
    throw new Error('DA_ENCRYPTION_KEY must be a 32-byte key written as 64 hexadecimal characters (generate with: openssl rand -hex 32)');
  }
  return Buffer.from(value.trim(), 'hex');
}
