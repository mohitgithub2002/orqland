import { Injectable } from '@nestjs/common';
import { createHash, createHmac, timingSafeEqual } from 'crypto';
import { deliveryConfig } from '@/config/delivery.config';

/**
 * 4-digit proof-of-delivery code. Derived from the task id with a server secret, so nothing reversible is stored:
 * the customer's order view recomputes it, the task stores only a hash for verification.
 */
@Injectable()
export class DeliveryOtpService {
  private secret?: string;

  otpFor(taskId: string): string {
    this.secret ??= deliveryConfig.secrets.otpSecret();
    const digest = createHmac('sha256', this.secret).update(`otp|${taskId}`).digest();
    return String(digest.readUInt32BE(0) % 10_000).padStart(4, '0');
  }

  hashFor(taskId: string): string {
    return createHash('sha256').update(`${taskId}:${this.otpFor(taskId)}`).digest('hex');
  }

  verify(taskId: string, storedHash: string, otp: string): boolean {
    const candidate = createHash('sha256').update(`${taskId}:${otp}`).digest();
    const expected = Buffer.from(storedHash, 'hex');
    return expected.length === candidate.length && timingSafeEqual(expected, candidate);
  }
}
