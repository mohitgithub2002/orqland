import { sniffMimeType } from './delivery-files.service';
import { previousPeriod } from '../earnings/statements.service';
import { NOTIFICATION_CATALOGUE } from '../notifications/delivery-notifier.service';

describe('sniffMimeType', () => {
  it('recognises JPEG, PNG, WEBP and PDF by their leading bytes', () => {
    expect(sniffMimeType(Buffer.from('ffd8ffe000104a464946', 'hex'))).toBe('image/jpeg');
    expect(sniffMimeType(Buffer.from('89504e470d0a1a0a0000', 'hex'))).toBe('image/png');
    expect(sniffMimeType(Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBP')]))).toBe('image/webp');
    expect(sniffMimeType(Buffer.from('%PDF-1.7'))).toBe('application/pdf');
  });

  it('rejects anything else, whatever the declared content type', () => {
    expect(sniffMimeType(Buffer.from('MZ\x90\x00'))).toBeNull();
    expect(sniffMimeType(Buffer.from('<svg/>'))).toBeNull();
    expect(sniffMimeType(Buffer.alloc(0))).toBeNull();
  });
});

describe('previousPeriod', () => {
  it('steps back one calendar month, across a year boundary', () => {
    expect(previousPeriod('2026-11-01')).toBe('2026-10-01');
    expect(previousPeriod('2026-01-01')).toBe('2025-12-01');
  });
});

describe('notification catalogue', () => {
  it('locks safety and account-critical alerts', () => {
    for (const type of ['DELIVERY_OFFERED', 'DELIVERY_CANCELLED', 'AGENT_SUSPENDED', 'KYC_EXPIRED', 'COD_DISCREPANCY'] as const) {
      expect(NOTIFICATION_CATALOGUE[type].locked).toBe(true);
    }
    expect(NOTIFICATION_CATALOGUE.EARNING_PAID.locked).toBe(false);
  });
});
