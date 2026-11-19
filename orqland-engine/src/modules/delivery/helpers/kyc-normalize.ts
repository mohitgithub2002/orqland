/** Canonical form used for both fingerprints and provider calls: uppercase alphanumerics only. */
export function normalizeIdentifier(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/** Indian vehicle registration (e.g. TN09AB1234) or BH series (e.g. 22BH1234AA). */
export function isPlausibleVehicleNumber(normalized: string): boolean {
  return /^[A-Z]{2}\d{1,2}[A-Z]{0,3}\d{1,4}$/.test(normalized) || /^\d{2}BH\d{4}[A-Z]{1,2}$/.test(normalized);
}

/** Indian driving licence: state code + RTO + year + serial, 15–16 chars once normalized. */
export function isPlausibleLicenceNumber(normalized: string): boolean {
  return /^[A-Z]{2}\d{2}[A-Z0-9]{9,13}$/.test(normalized);
}

export function maskVehicleNumber(normalized: string): string {
  if (normalized.length <= 6) return normalized.slice(0, 2) + '••' + normalized.slice(-2);
  return normalized.slice(0, 4) + '••••' + normalized.slice(-2);
}

/** Loose person-name comparison: at least one significant token in common (initials ignored). */
export function namesMatch(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  const tokens = (s: string) =>
    new Set(
      s
        .toUpperCase()
        .replace(/[^A-Z ]/g, ' ')
        .split(/\s+/)
        .filter((t) => t.length > 1),
    );
  const left = tokens(a);
  for (const token of tokens(b)) if (left.has(token)) return true;
  return false;
}
