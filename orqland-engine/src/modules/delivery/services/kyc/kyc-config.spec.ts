import { parseEncryptionKey } from './kyc-crypto.service';
import { resolveSurepassMode } from './surepass.client';

describe('KYC configuration (architecture review §5.1)', () => {
  it('requires DA_ENCRYPTION_KEY as a 32-byte hex key', () => {
    const key = 'a'.repeat(64);
    expect(parseEncryptionKey(key)).toHaveLength(32);
    expect(() => parseEncryptionKey('not-hex-but-long-enough-0000000000000000000000000000000000000')).toThrow(/64 hexadecimal/);
    expect(() => parseEncryptionKey('ab'.repeat(16))).toThrow();
    expect(() => parseEncryptionKey(undefined)).toThrow();
  });

  it('defaults SUREPASS_MODE to mock when unset, but never silently mocks in production', () => {
    expect(resolveSurepassMode(undefined, 'development')).toBe('mock');
    expect(resolveSurepassMode(undefined, undefined)).toBe('mock');
    expect(resolveSurepassMode(undefined, 'production')).toBe('live');
    expect(resolveSurepassMode('mock', 'production')).toBe('mock');
    expect(() => resolveSurepassMode('sandbox', undefined)).toThrow();
  });
});
