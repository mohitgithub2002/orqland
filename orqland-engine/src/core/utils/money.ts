/** Money is handled as integer paise in code and numeric(12,2) strings in the database. */
export function toPaise(value: string | number | null | undefined): number {
  if (value === null || value === undefined || value === '') return 0;
  const [whole, fraction = ''] = String(value).trim().split('.');
  const negative = whole.startsWith('-');
  const paise = Math.abs(parseInt(whole, 10) || 0) * 100 + parseInt((fraction + '00').slice(0, 2), 10);
  return negative ? -paise : paise;
}

export function fromPaise(paise: number): string {
  const negative = paise < 0;
  const abs = Math.abs(Math.round(paise));
  return `${negative ? '-' : ''}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
}

/** Rounds half-up to the nearest paisa. */
export function percentOfPaise(paise: number, percent: string | number): number {
  return Math.round((paise * Number(percent)) / 100);
}
