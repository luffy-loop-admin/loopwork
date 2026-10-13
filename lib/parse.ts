/** Parse numbers from messy sheet cells: 1200, "$1,200", "1.200,50", "12k", "1.2M". */
export function parseNumber(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  let s = String(v).trim().toLowerCase();
  if (!s) return null;
  let mult = 1;
  if (/\d\s*k\b/.test(s)) mult = 1e3;
  else if (/\d\s*m\b/.test(s)) mult = 1e6;
  s = s.replace(/[^0-9.,-]/g, '');
  if (!s || s === '-') return null;
  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');
  if (lastComma > -1 && lastDot > -1) {
    s = lastComma > lastDot ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  } else if (lastComma > -1) {
    s = /^-?\d{1,3}(,\d{3})+$/.test(s) ? s.replace(/,/g, '') : s.replace(',', '.');
  } else if ((s.match(/\./g) || []).length > 1) {
    s = s.replace(/\./g, '');
  }
  const n = Number(s);
  return Number.isFinite(n) ? n * mult : null;
}

export function parseMoney(v: unknown): number | null {
  const n = parseNumber(v);
  return n === null ? null : Math.round(n * 100) / 100;
}

export function parseIntSafe(v: unknown): number | null {
  const n = parseNumber(v);
  return n === null ? null : Math.round(n);
}

const CODES = ['pkr', 'usd', 'eur', 'gbp', 'inr', 'aud', 'cad', 'aed'];
export function parseCurrency(v: unknown, fallback: string): string {
  if (typeof v === 'string') {
    const lower = v.toLowerCase();
    if (/\brs\.?(?=\s|\d|$)|₨/.test(lower)) return 'PKR';
    const hit = CODES.find((c) => new RegExp(`\\b${c}\\b`).test(lower));
    if (hit) return hit.toUpperCase();
    if (/^[A-Za-z]{3}$/.test(v.trim())) return v.trim().toUpperCase();
  }
  return fallback;
}

/** Returns YYYY-MM-DD or null. Accepts Google serial numbers, ISO dates, DD/MM/YYYY, and anything Date can read. */
export function parseDate(v: unknown): string | null {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') {
    if (v < 20000 || v > 90000) return null;
    return new Date(Math.round((v - 25569) * 86400 * 1000)).toISOString().slice(0, 10);
  }
  const s = String(v).trim();
  if (!s) return null;
  const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) return `${iso[1]}-${iso[2].padStart(2, '0')}-${iso[3].padStart(2, '0')}`;
  const dmy = s.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})$/);
  if (dmy) {
    let a = Number(dmy[1]);
    let b = Number(dmy[2]);
    let y = Number(dmy[3]);
    if (y < 100) y += 2000;
    // Day-first by default; only treat as month-first when the second number cannot be a month.
    let day = a;
    let month = b;
    if (b > 12 && a <= 12) {
      day = b;
      month = a;
    }
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    return `${y}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }
  const t = Date.parse(s);
  return Number.isNaN(t) ? null : new Date(t).toISOString().slice(0, 10);
}

export type IdxStatus = 'indexed' | 'not_indexed' | 'pending';

/** Reads the team's "Status" cell: Indexed / Not indexed / Pending / yes / no ... Unknown or empty = null. */
export function parseIndexStatus(v: unknown): IdxStatus | null {
  if (v === null || v === undefined) return null;
  const s = String(v).toLowerCase().replace(/[_-]+/g, ' ').trim();
  if (!s) return null;
  if (/^(pending|wait|waiting|checking|in progress|todo|to do|ordered|queued)/i.test(s)) return 'pending';
  if (/\b(not|non|no|un|de)\s*index(ed|ing)?\b/i.test(s) || /^(no|n|not|x|false|0|✗|✘|❌|failed|dropped|rejected)$/i.test(s)) {
    return 'not_indexed';
  }
  if (/\bindex(ed|ing)?\b/i.test(s) || /^(yes|y|ok|done|live|active|published|posted|completed|complete|true|1|✓|✔|✅)$/i.test(s)) {
    return 'indexed';
  }
  return null;
}

/** Returns HH:MM (24h) from a Google time/datetime serial, "14:30", "2:30 PM" ... or null. */
export function parseTime(v: unknown): string | null {
  if (v === null || v === undefined || v === '') return null;
  const pad = (n: number) => String(n).padStart(2, '0');
  if (typeof v === 'number') {
    const frac = v - Math.floor(v);
    const mins = Math.round(frac * 1440) % 1440;
    if (frac === 0 && v !== 0) return null;
    return `${pad(Math.floor(mins / 60))}:${pad(mins % 60)}`;
  }
  const m = String(v).trim().match(/^(\d{1,2})[:.](\d{2})(?::\d{2})?\s*(am|pm)?$/i);
  if (!m) return null;
  let h = Number(m[1]);
  const min = Number(m[2]);
  const ap = m[3]?.toLowerCase();
  if (ap === 'pm' && h < 12) h += 12;
  if (ap === 'am' && h === 12) h = 0;
  if (h > 23 || min > 59) return null;
  return `${pad(h)}:${pad(min)}`;
}

export function cellText(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s ? s : null;
}
