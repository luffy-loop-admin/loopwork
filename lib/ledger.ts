import { cleanUrl, normalizeDomain } from '@/lib/domain';
import { cellText, parseDate, parseIndexStatus, parseMoney, parseTime } from '@/lib/parse';
import { colIndex, type SheetTable } from '@/lib/sheets-types';
import { LEDGER_ORDER_FIELDS, LEDGER_PAYMENT_FIELDS } from '@/lib/fields';

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

// Matches full and short month names delimited by non-letters (handles underscores, spaces, hyphens, and numbers like August2026, Aug_Links, 08-August)
export const MONTH_REGEX = /(?:^|[^a-z])(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t|tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)(?:$|[^a-z])/i;

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
 * Infer month and year from a tab name (e.g. "August Links", "August_Links", "August2026", "July", "Sept", "Oct 2026").
 * Returns null if the tab name does not contain a recognizable month word, or if it is a payment/summary tab.
 */
export function inferMonthFromTabName(name: string, referenceYear?: number): InferredMonth | null {
  if (!name) return null;
  const clean = name.trim();

  // Explicit non-month tabs (payment, summary, balance, master price lists)
  if (/payment/i.test(clean)) return null;
  if (/history|remaining|balance|summary|total|master|rate|price/i.test(clean) && !/(?:^|[^a-z])(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i.test(clean)) {
    return null;
  }

  const match = clean.match(MONTH_REGEX);
  if (!match) return null;

  const m = monthIndex(match[1]);
  if (!m) return null;

  // Extract year:
  // 1. 4-digit year like "2026" or "August2026"
  const y4Match = clean.match(/(?:^|[^0-9])(20\d{2})(?:$|[^0-9])/);
  // 2. 2-digit year like "24", "25", "26" preceded/followed by non-digits
  const y2Match = !y4Match ? clean.match(/(?:^|[\s_/-])(2[3-9]|3[0-9])(?:$|[\s_/-])/) : null;

  const year = y4Match
    ? Number(y4Match[1])
    : y2Match
    ? 2000 + Number(y2Match[1])
    : (referenceYear || getKarachiCurrentYear());

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

export type TabDiagnostic = {
  tab: string;
  type: 'order' | 'payment' | 'ignored';
  monthYear?: string | null; // e.g. "August 2026"
  monthStart?: string | null; // e.g. "2026-08-01"
  linksCount?: number;
  totalPKR?: number;
  skippedNoLink?: number;
  noPriceCount?: number;
  duplicateCount?: number;
  paymentCount?: number;
  totalPaidPKR?: number;
  reason?: string;
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
  tabDiagnostics?: TabDiagnostic[];
};

const cell = (row: unknown[], idx: number): unknown => (idx >= 0 ? row[idx] : undefined);

function resolveOrderCol(headers: string[], mapped: string | undefined, fieldKey: string): number {
  const fromMapping = colIndex(headers, mapped);
  if (fromMapping >= 0) return fromMapping;
  const def = LEDGER_ORDER_FIELDS.find((f) => f.key === fieldKey);
  if (!def) return -1;
  return headers.findIndex((h) => def.guess.test(h));
}

function resolvePaymentCol(headers: string[], mapped: string | undefined, fieldKey: string): number {
  if (fieldKey === 'amount') {
    if (mapped && /remain|balance|total|due|left/i.test(mapped)) {
      mapped = undefined;
    }
  }
  const fromMapping = colIndex(headers, mapped);
  if (fromMapping >= 0) return fromMapping;

  if (fieldKey === 'amount') {
    return headers.findIndex(
      (h) => !/remain|balance|total|due|left/i.test(h) && /(?:^|\b)(amount|paid|payment)(?:\b|$)/i.test(h)
    );
  }
  if (fieldKey === 'date') {
    return headers.findIndex((h) => /^date$|paid\s*date|payment\s*date/i.test(h) || (/date/i.test(h) && !/time/i.test(h)));
  }
  if (fieldKey === 'time') {
    return headers.findIndex((h) => /time/i.test(h));
  }
  if (fieldKey === 'method') {
    return headers.findIndex((h) => /method|mode|via|channel|account/i.test(h));
  }
  if (fieldKey === 'reference') {
    return headers.findIndex((h) => /ref|txn|trx|transaction|receipt/i.test(h));
  }
  if (fieldKey === 'notes') {
    return headers.findIndex((h) => /note|comment|remark|detail/i.test(h));
  }
  return -1;
}

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
  tabDiagnostics: TabDiagnostic[];
} {
  const requireLive = options.requireLiveLink ?? true;
  const currency = options.defaultCurrency || 'PKR';

  // Find reference year across all tabs if not provided
  let refYear = options.referenceYear;
  if (!refYear) {
    const years: number[] = [];
    for (const t of tables) {
      const dateIdx = resolveOrderCol(t.headers, mapping.date, 'date');
      if (dateIdx >= 0) {
        for (const r of t.body) {
          const d = parseDate(cell(r, dateIdx));
          if (d) years.push(Number(d.slice(0, 4)));
        }
      }
    }
    if (years.length) {
      const counts = new Map<number, number>();
      for (const y of years) counts.set(y, (counts.get(y) ?? 0) + 1);
      refYear = Array.from(counts.entries()).sort((a, b) => b[1] - a[1])[0][0];
    } else {
      refYear = getKarachiCurrentYear();
    }
  }

  const ordersMap = new Map<string, LedgerOrderRecord>();
  let overallSkippedNoLink = 0;
  let overallNoPrice = 0;
  let overallDuplicates = 0;
  const usedTabs: string[] = [];
  const tabDiagnostics: TabDiagnostic[] = [];

  for (const t of tables) {
    usedTabs.push(t.tab);
    const inferred = inferMonthFromTabName(t.tab, refYear);

    const idx = {
      live: resolveOrderCol(t.headers, mapping.live_url, 'live_url'),
      site: resolveOrderCol(t.headers, mapping.site, 'site'),
      price: resolveOrderCol(t.headers, mapping.price, 'price'),
      date: resolveOrderCol(t.headers, mapping.date, 'date'),
      article: resolveOrderCol(t.headers, mapping.article, 'article'),
      status: resolveOrderCol(t.headers, mapping.status, 'status'),
      pair: resolveOrderCol(t.headers, mapping.pair, 'pair'),
      notes: resolveOrderCol(t.headers, mapping.notes, 'notes'),
      payment_status: resolveOrderCol(t.headers, mapping.payment_status, 'payment_status'),
    };

    let tabLinksCount = 0;
    let tabTotalPKR = 0;
    let tabSkippedNoLink = 0;
    let tabNoPrice = 0;
    let tabDuplicates = 0;

    for (const r of t.body) {
      const rawLive = cell(r, idx.live);
      const live = cleanUrl(rawLive);

      // Rule: Skip every row where the Live link cell is not a valid URL
      if (!live || !normalizeDomain(live)) {
        tabSkippedNoLink++;
        overallSkippedNoLink++;
        continue;
      }

      const rawSite = cell(r, idx.site);
      const domain = normalizeDomain(rawSite) ?? (live ? normalizeDomain(live) : null);
      if (!domain) {
        tabSkippedNoLink++;
        overallSkippedNoLink++;
        continue;
      }

      // Price: strictly what is written in the Price cell of that row
      const priceRaw = cell(r, idx.price);
      const price = parseMoney(priceRaw);
      if (price === null) {
        tabNoPrice++;
        overallNoPrice++;
      }

      const date = parseDate(cell(r, idx.date));
      // Rule: If tab has an inferred month, all rows from this tab inherit it!
      // order_month is always the first day of that month (YYYY-MM-01).
      const orderMonth = inferred ? inferred.monthStart : (date ? `${date.slice(0, 7)}-01` : null);

      const doc = cellText(cell(r, idx.article));
      const pair = cellText(cell(r, idx.pair));
      const notes = cellText(cell(r, idx.notes));
      const paymentStatus = cellText(cell(r, idx.payment_status));
      const st = parseIndexStatus(cell(r, idx.status));

      const key = `u:${live.toLowerCase()}`;
      if (ordersMap.has(key)) {
        tabDuplicates++;
        overallDuplicates++;
      }

      tabLinksCount++;
      if (price !== null && price > 0) {
        tabTotalPKR += price;
      }

      ordersMap.set(key, {
        source_key: key,
        source_tab: t.tab,
        domain,
        live_url: live,
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

    tabDiagnostics.push({
      tab: t.tab,
      type: 'order',
      monthYear: inferred ? `${inferred.monthName} ${inferred.year}` : null,
      monthStart: inferred ? inferred.monthStart : null,
      linksCount: tabLinksCount,
      totalPKR: tabTotalPKR,
      skippedNoLink: tabSkippedNoLink,
      noPriceCount: tabNoPrice,
      duplicateCount: tabDuplicates,
    });
  }

  const orders = Array.from(ordersMap.values());
  const totalOrderedPKR = orders.reduce((sum, o) => sum + (o.price_paid ?? 0), 0);

  return {
    orders,
    totalOrderedPKR,
    skippedNoLink: overallSkippedNoLink,
    noPriceCount: overallNoPrice,
    duplicateCount: overallDuplicates,
    usedTabs,
    tabDiagnostics,
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
  skippedCount: number;
  diagnostic: TabDiagnostic | null;
} {
  if (!table || !table.body.length) {
    return {
      payments: [],
      totalPaidPKR: 0,
      skippedCount: 0,
      diagnostic: table ? { tab: table.tab, type: 'payment', paymentCount: 0, totalPaidPKR: 0, reason: 'Empty table' } : null,
    };
  }

  const idx = {
    amount: resolvePaymentCol(table.headers, paymentMapping.amount, 'amount'),
    date: resolvePaymentCol(table.headers, paymentMapping.date, 'date'),
    time: resolvePaymentCol(table.headers, paymentMapping.time, 'time'),
    method: resolvePaymentCol(table.headers, paymentMapping.method, 'method'),
    reference: resolvePaymentCol(table.headers, paymentMapping.reference, 'reference'),
    notes: resolvePaymentCol(table.headers, paymentMapping.notes, 'notes'),
  };

  const records: LedgerPaymentRecord[] = [];
  const seen = new Map<string, number>();
  let skippedCount = 0;

  for (const r of table.body) {
    const amount = parseMoney(cell(r, idx.amount));
    const date = parseDate(cell(r, idx.date));

    // Ignore rows that are not real payments (no date, or amount missing / <= 0, or label rows like "Total")
    if (amount === null || amount <= 0 || !date) {
      skippedCount++;
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
  const diagnostic: TabDiagnostic = {
    tab: table.tab,
    type: 'payment',
    paymentCount: records.length,
    totalPaidPKR,
    reason: skippedCount > 0 ? `${skippedCount} non-payment/summary rows skipped` : undefined,
  };

  return { payments: records, totalPaidPKR, skippedCount, diagnostic };
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
    allSheetTabs?: string[];
  } = {}
): ParsedLedger {
  const parsedOrders = parseLedgerOrders(orderTables, orderMapping, options);
  const parsedPayments = parseLedgerPayments(paymentTable, paymentMapping, options.defaultCurrency);

  const tabDiagnostics: TabDiagnostic[] = [...parsedOrders.tabDiagnostics];
  if (parsedPayments.diagnostic) {
    tabDiagnostics.push(parsedPayments.diagnostic);
  }

  // Include ignored tabs if full sheet tabs list was provided
  if (options.allSheetTabs) {
    const processedTabs = new Set([
      ...parsedOrders.usedTabs,
      ...(paymentTable ? [paymentTable.tab] : []),
    ]);
    for (const t of options.allSheetTabs) {
      if (!processedTabs.has(t)) {
        tabDiagnostics.push({
          tab: t,
          type: 'ignored',
          reason: 'Ignored: name does not contain a recognized month name',
        });
      }
    }
  }

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
    tabDiagnostics,
  };
}
