import { randomInt } from 'crypto';

const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

function randomCode(length: number): string {
  let out = '';
  for (let i = 0; i < length; i++) out += ALPHABET[randomInt(ALPHABET.length)];
  return out;
}

function datePart(now = new Date()): string {
  const yy = String(now.getUTCFullYear()).slice(2);
  const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(now.getUTCDate()).padStart(2, '0');
  return `${yy}${mm}${dd}`;
}

/** Public, non-sequential identifiers, e.g. ORD-261101-7K3Q9XAB. */
export const generateOrderNumber = () => `ORD-${datePart()}-${randomCode(8)}`;
export const generateTaskNumber = () => `DLV-${datePart()}-${randomCode(8)}`;
export const generateTicketNumber = () => `SUP-${datePart()}-${randomCode(6)}`;
