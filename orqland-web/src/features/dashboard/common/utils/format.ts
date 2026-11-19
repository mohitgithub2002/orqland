const inr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 });

export const formatMoney = (value: string | number | null | undefined) => (value === null || value === undefined || value === '' ? '—' : inr.format(Number(value)));

export const formatKm = (value: string | number | null | undefined) =>
  value === null || value === undefined || value === '' ? '—' : `${Number(value).toFixed(1)} km`;

export const formatDateTime = (value: string | null | undefined) =>
  value ? new Date(value).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : '—';

export const formatDate = (value: string | null | undefined) =>
  value ? new Date(value).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

export function timeAgo(value: string | null | undefined): string {
  if (!value) return '—';
  const seconds = Math.round((Date.now() - new Date(value).getTime()) / 1000);
  if (seconds < 45) return 'just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

/** READY_FOR_FULFILMENT → Ready for fulfilment */
export const humanize = (value: string | null | undefined) =>
  value ? value.charAt(0) + value.slice(1).toLowerCase().replace(/_/g, ' ') : '—';

export const formatAddress = (a: { doorNo?: string | null; street?: string | null; landmark?: string | null; city?: string | null; pincode?: string | null } | null | undefined) =>
  a ? [a.doorNo, a.street, a.landmark, a.city, a.pincode].filter(Boolean).join(', ') || '—' : '—';

export const currentMonth = () => new Date().toISOString().slice(0, 7);

/** Minutes → "12m" / "1h 05m". */
export function formatMinutes(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—';
  const total = Math.round(value);
  if (total < 60) return `${total}m`;
  return `${Math.floor(total / 60)}h ${String(total % 60).padStart(2, '0')}m`;
}

/** Age since a timestamp in minutes. */
export const minutesSince = (value: string | null | undefined, now = Date.now()) => (value ? (now - new Date(value).getTime()) / 60_000 : null);

export const formatPercent = (value: number | null | undefined) => (value === null || value === undefined ? '—' : `${value.toFixed(value >= 99.95 ? 0 : 1)}%`);

/** YYYY-MM → "Nov 2026" */
export const formatPeriod = (period: string) => new Date(`${period.slice(0, 7)}-01T00:00:00`).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });

/** Triggers a client-side CSV download (statements, reports). */
export function downloadCsv(filename: string, csv: string) {
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const a = Object.assign(document.createElement('a'), { href: url, download: filename });
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export const toCsv = (rows: (string | number | null | undefined)[][]) =>
  rows.map((r) => r.map((c) => { const s = c === null || c === undefined ? '' : String(c); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; }).join(',')).join('\n');

/** 1 delivery · 3 deliveries */
export const deliveriesLabel = (n: number) => `${n} ${n === 1 ? 'delivery' : 'deliveries'}`;
