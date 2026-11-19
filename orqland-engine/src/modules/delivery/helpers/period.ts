/** First day of the calendar month (YYYY-MM-01) for `at` in the given IANA timezone. */
export function periodMonthFor(at: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit' }).formatToParts(at);
  const year = parts.find((p) => p.type === 'year')!.value;
  const month = parts.find((p) => p.type === 'month')!.value;
  return `${year}-${month}-01`;
}

/** Accepts YYYY-MM or YYYY-MM-DD and returns YYYY-MM-01. */
export function normalizePeriod(value: string): string {
  const match = /^(\d{4})-(\d{2})/.exec(value);
  if (!match || Number(match[2]) < 1 || Number(match[2]) > 12) throw new Error('Invalid period, expected YYYY-MM');
  return `${match[1]}-${match[2]}-01`;
}

export function addMonths(date: Date, months: number): Date {
  const result = new Date(date);
  result.setUTCMonth(result.getUTCMonth() + months);
  return result;
}
