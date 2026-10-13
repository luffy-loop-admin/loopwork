import { CURRENCY as DEFAULT_CURRENCY, TIMEZONE } from '@/lib/config';

export function money(value: number | string | null | undefined, currency?: string | null): string {
  if (value === null || value === undefined || value === '') return '-';
  const n = Number(value);
  if (!Number.isFinite(n)) return '-';
  const cur = (currency || DEFAULT_CURRENCY).toUpperCase();
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: cur, minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(n);
  } catch {
    return `${cur} ${n.toFixed(2)}`;
  }
}

export function num(value: number | null | undefined): string {
  if (value === null || value === undefined) return '-';
  return new Intl.NumberFormat('en-US').format(value);
}

/** Accepts YYYY-MM-DD or a full timestamp (timestamps are shown in Pakistan time). */
export function fmtDate(value: string | null | undefined): string {
  if (!value) return '-';
  const dateOnly = value.length === 10;
  const d = new Date(dateOnly ? `${value}T00:00:00Z` : value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: dateOnly ? 'UTC' : TIMEZONE });
}

/** Date and time in Pakistan time (PKT). */
export function fmtDateTime(value: string | null | undefined): string {
  if (!value) return 'Never';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return (
    d.toLocaleString('en-GB', {
      day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true, timeZone: TIMEZONE,
    }) + ' PKT'
  );
}
