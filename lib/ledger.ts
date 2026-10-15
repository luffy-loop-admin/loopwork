import { cleanUrl, normalizeDomain } from '@/lib/domain';
import { cellText, parseDate, parseIndexStatus, parseMoney, parseTime } from '@/lib/parse';
import { colIndex, type SheetTable } from '@/lib/sheets-types';

export type InferredMonth = {
  month: number; // 1 - 12
  monthName: string; // e.g. "August"
  year: number;
  monthStart: string; // YYYY-MM-01
};

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const MONTH_REGEX = /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t|tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\b/i;

function monthIndex(token: string): number {
  const t = token.toLowerCase();
  if (t.startsWith('jan')) return 1;
  if (t.startsWith('feb')) return 2;
  if (t.startsWith('mar')) return 3;
  if (t.startsWith('apr')) return 4;
  if (t === 'may') return 5;
  if (t.startsWith('jun')) return 6;
  if (t.startsWith('jul')) return 7;
  if (t.startsWith('aug')) return 8;
  if (t.startsWith('sep')) return 9;
  if (t.startsWith('oct')) return 10;
  if (t.startsWith('nov')) return 11;
  if (t.startsWith('dec')) return 12;
  return 0;
}

/** Get current year in Asia/Karachi */
export function getKarachiCurrentYear(): number {
  const now = new Date();
  const str = now.toLocaleString('en-US', { timeZone: 'Asia/Karachi' });
  const d = new Date(str);
  return d.getFullYear() || now.getFullYear();
}

/**
 * Infer month and year from a tab name (e.g. "August Links", "July", "Sept", "Oct 2026").
 * Returns null if the tab name does not contain a recognizable month word.
 */
export function inferMonthFromTabName(name: string, referenceYear?: number): InferredMonth | null {
  if (!name) return null;
  const match = name.match(MONTH_REGEX);
  if (!match) return null;

  const m = monthIndex(match[1]);
  if (!m) return null;

  // Check if tab name explicitly contains a 4-digit year (e.g. "August 2026")
  const yearMatch = name.match(/\b(20\d{2})\b/);
  const year = yearMatch ? Number(yearMatch[1]) : (referenceYear || getKarachiCurrentYear());
  const monthStart = `${year}-${String(m).padStart(2, '0')}-01`;

  return {
    month: m,
    monthName: MONTH_NAMES[m - 1],
    year,
    monthStart,
  };
}

/**
 * Computes the Monday of the week (YYYY-MM-DD) for a given date in Asia/Karachi.
 */
export function weekStart(dateInput: string | Date): string {
  const d = typeof dateInput === 'string' ? new Date(`${dateInput.slice(0, 10)}T12:00:00Z`) : new Date(dateInput);
  if (Number.isNaN(d.getTime())) return typeof dateInput === 'string' ? dateInput.slice(0, 10) : '';

  // Calculate day of week (0 = Sunday, 1 = Monday, ..., 6 = Saturday)
  const day = d.getUTCDay();
  // Difference to previous Monday: if Sunday (0), go back 6 days; if Monday (1), go back 0 days; etc.
  const diffToMonday = day === 0 ? -6 : 1 - day;
  const monday = new Date(d);
  monday.setUTCDate(d.getUTCDate() + diffToMonday);

  return monday.toISOString().slice(0, 10);
}

/**
 * Formats a date into "Week of 10 Aug 2026" based on its Monday.
 */
export function weekLabel(dateInput: string | Date): string {
  const ws = weekStart(dateInput);
  if (!ws) return '';
  const d = new Date(`${ws}T12:00:00Z`);
  const day = d.getUTCDate();
  const month = d.toLocaleString('en-GB', { month: 'short', timeZone: 'UTC' });
  const year = d.getUTCFullYear();
  return `Week of ${day} ${month} ${year}`;
}

export type LedgerOrderRecord = {
  source_key: string;
  source_tab: string;
  domain: string;
  live_url: string;
  order_date: string | null;
  order_month: string | null; // YYYY-MM-01
  price_paid: number | null;
  currency: string;
  notes: string | null;
  sheet_status: 'indexed' | 'not_indexed' | null;
  order_status: 'live';
  pair: string | null;
  article_url: string | null;
  payment_status: string | null;
};

export type LedgerPaymentRecord = {
  source_key: string;
  amount: number;
  currency: string;
  paid_date: string;
  paid_time: string | null;
  method: string | null;
  reference: string | null;
  notes: string | null;
};

export type ParsedLedger = {
  tabsRead: string[];
  orders: LedgerOrderRecord[];
  totalOrderedPKR: number;
  skippedNoLink: number;
  noPriceCount: number;
  duplicateCount: number;
  payments: LedgerPaymentRecord[];
  totalPaidPKR: number;
  resultingBalance: number;
};

const cell = (row: unknown[], idx: number): unknown => (idx >= 0 ? row[idx] : undefined);

/**
 * Pure parsing of order rows from month tabs.
 */
export function parseLedgerOrders(
  tables: SheetTable[],
  mapping: Record<string, string>,
  options: {
    requireLiveLink?: boolean;
    defaultCurrency?: string;
    referenceYear?: number;
  } = {}
): {
  orders: LedgerOrderRecord[];
  totalOrderedPKR: number;
  skippedNoLink: number;
  noPriceCount: number;
  duplicateCount: number;
  usedTabs: string[];
} {
  const requireLive = options.requireLiveLink ?? true;
  const currency = options.defaultCurrency || 'PKR';

  // Find reference year across all tabs if not provided
  let refYear = options.referenceYear;
  if (!refYear) {
    const years: number[] = [];
    for (const t of tables) {
      const dateIdx = colIndex(t.headers, mapping.date);
      if (dateIdx >= 0) {
        for (const r of t.body) {
          const d = parseDate(cell(r, dateIdx));
          if (d) years.push(Number(d.slice(0, 4)));
        }
      }
    }
    if (years.length) {
      // most common year
      const counts = new Map<number, number>();
      for (const y of years) counts.set(y, (counts.get(y) ?? 0) + 1);
      refYear = Array.from(counts.entries()).sort((a, b) => b[1] - a[1])[0][0];
    } else {
      refYear = getKarachiCurrentYear();
    }
  }

  const ordersMap = new Map<string, LedgerOrderRecord>();
  let skippedNoLink = 0;
  let noPriceCount = 0;
  let duplicateCount = 0;
  const usedTabs: string[] = [];

  for (const t of tables) {
    usedTabs.push(t.tab);
    const inferred = inferMonthFromTabName(t.tab, refYear);

    const idx = {
      site: colIndex(t.headers, mapping.site),
      price: colIndex(t.headers, mapping.price),
      date: colIndex(t.headers, mapping.date),
      article: colIndex(t.headers, mapping.article),
      live: colIndex(t.headers, mapping.live_url),
      status: colIndex(t.headers, mapping.status),
      pair: colIndex(t.headers, mapping.pair),
      notes: colIndex(t.headers, mapping.notes),
      payment_status: colIndex(t.headers, mapping.payment_status),
    };

    for (const r of t.body) {
      const rawLive = cell(r, idx.live);
      const live = cleanUrl(rawLive);

      // Section 2 & 3: Skip every row where the Live link cell is not a valid URL
      if (requireLive && (!live || !normalizeDomain(live))) {
        skippedNoLink++;
        continue;
      }

      const rawSite = cell(r, idx.site);
      const domain = normalizeDomain(rawSite) ?? (live ? normalizeDomain(live) : null);
      if (!domain) {
        skippedNoLink++;
        continue;
      }

      // Price: strictly what is written in the Price cell of that row
      const priceRaw = cell(r, idx.price);
      const price = parseMoney(priceRaw);
      if (price === null) {
        noPriceCount++;
      }

      const date = parseDate(cell(r, idx.date));
      const orderMonth = inferred ? inferred.monthStart : (date ? `${date.slice(0, 7)}-01` : null);

      const doc = cellText(cell(r, idx.article));
      const pair = cellText(cell(r, idx.pair));
      const notes = cellText(cell(r, idx.notes));
      const paymentStatus = cellText(cell(r, idx.payment_status));
      const st = parseIndexStatus(cell(r, idx.status));

      const key = live ? `u:${live.toLowerCase()}` : `d:${domain}|${date ?? ''}#${ordersMap.size + 1}`;

      if (ordersMap.has(key)) {
        duplicateCount++;
      }

      ordersMap.set(key, {
        source_key: key,
        source_tab: t.tab,
        domain,
        live_url: live || '',
        order_date: date,
        order_month: orderMonth,
        price_paid: price,
        currency,
        notes,
        sheet_status: st === 'indexed' || st === 'not_indexed' ? st : null,
        order_status: 'live',
        pair,
        article_url: doc,
        payment_status: paymentStatus,
      });
    }
  }

  const orders = Array.from(ordersMap.values());
  const totalOrderedPKR = orders.reduce((sum, o) => sum + (o.price_paid ?? 0), 0);

  return {
    orders,
    totalOrderedPKR,
    skippedNoLink,
    noPriceCount,
    duplicateCount,
    usedTabs,
  };
}

/**
 * Pure parsing of payment rows from payment history tab.
 * Rule: Excludes any column matching /remain|balance|total|due|left/i.
 */
export function parseLedgerPayments(
  table: SheetTable | null,
  paymentMapping: Record<string, string>,
  defaultCurrency = 'PKR'
): {
  payments: LedgerPaymentRecord[];
  totalPaidPKR: number;
} {
  if (!table || !table.body.length) return { payments: [], totalPaidPKR: 0 };

  // Verify headers don't map balance/remaining columns
  const idx = {
    amount: colIndex(table.headers, paymentMapping.amount),
    date: colIndex(table.headers, paymentMapping.date),
    time: colIndex(table.headers, paymentMapping.time),
    method: colIndex(table.headers, paymentMapping.method),
    reference: colIndex(table.headers, paymentMapping.reference),
    notes: colIndex(table.headers, paymentMapping.notes),
  };

  const records: LedgerPaymentRecord[] = [];
  const seen = new Map<string, number>();

  for (const r of table.body) {
    const amount = parseMoney(cell(r, idx.amount));
    const date = parseDate(cell(r, idx.date));

    // Ignore rows that are not real payments (no date, or amount missing / <= 0, or label rows like "Total")
    if (amount === null || amount <= 0 || !date) {
      continue;
    }

    const timeRaw = cell(r, idx.time);
    const time = parseTime(timeRaw) ?? (idx.time < 0 ? parseTime(cell(r, idx.date)) : null);
    const reference = cellText(cell(r, idx.reference));
    const method = cellText(cell(r, idx.method));
    const notes = cellText(cell(r, idx.notes));

    const base = `${date}|${time ?? ''}|${amount}|${(reference ?? '').toLowerCase()}`;
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);

    records.push({
      source_key: `p:${base}#${n}`,
      amount,
      currency: defaultCurrency,
      paid_date: date,
      paid_time: time,
      method,
      reference,
      notes,
    });
  }

  const totalPaidPKR = records.reduce((sum, p) => sum + p.amount, 0);
  return { payments: records, totalPaidPKR };
}

/**
 * Run a full dry-run preview of a ledger sheet.
 */
export function previewLedger(
  orderTables: SheetTable[],
  paymentTable: SheetTable | null,
  orderMapping: Record<string, string>,
  paymentMapping: Record<string, string>,
  options: {
    requireLiveLink?: boolean;
    defaultCurrency?: string;
  } = {}
): ParsedLedger {
  const parsedOrders = parseLedgerOrders(orderTables, orderMapping, options);
  const parsedPayments = parseLedgerPayments(paymentTable, paymentMapping, options.defaultCurrency);

  return {
    tabsRead: parsedOrders.usedTabs,
    orders: parsedOrders.orders,
    totalOrderedPKR: parsedOrders.totalOrderedPKR,
    skippedNoLink: parsedOrders.skippedNoLink,
    noPriceCount: parsedOrders.noPriceCount,
    duplicateCount: parsedOrders.duplicateCount,
    payments: parsedPayments.payments,
    totalPaidPKR: parsedPayments.totalPaidPKR,
    resultingBalance: parsedOrders.totalOrderedPKR - parsedPayments.totalPaidPKR,
  };
}
