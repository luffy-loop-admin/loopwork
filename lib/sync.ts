import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { CURRENCY } from '@/lib/config';
import { cleanUrl, normalizeDomain } from '@/lib/domain';
import { cellText, parseCurrency, parseDate, parseIndexStatus, parseIntSafe, parseMoney, parseTime } from '@/lib/parse';
import { colIndex, fetchSheetTabs, fetchTables, resolveTabs, type SheetTable } from '@/lib/sheets';
import { inferMonthFromTabName, parseLedgerOrders, parseLedgerPayments, previewLedger, type ParsedLedger, type TabDiagnostic } from '@/lib/ledger';

type Db = ReturnType<typeof createAdminClient>;
type Source = {
  id: string;
  kind: 'vendor' | 'orders' | 'payments' | 'ledger';
  vendor_id: string | null;
  spreadsheet_id: string;
  tab_name: string | null;
  order_tabs?: string[] | null;
  auto_include_new_tabs?: boolean;
  payment_tab?: string | null;
  header_row: number;
  default_currency: string;
  mapping: Record<string, string>;
  payment_mapping?: Record<string, string>;
  require_live_link?: boolean;
  write_status_back?: boolean;
  last_writeback_at?: string | null;
  last_writeback_error?: string | null;
};

export type SyncResult = { ok: boolean; message: string; rows: number };

const CHUNK = 500;
const cell = (row: unknown[], idx: number): unknown => (idx >= 0 ? row[idx] : undefined);

function summary(label: string, rows: number, tabs: string[], skippedTabs: string[], skippedRows: number, missing: string[]): string {
  const text = /synced|imported/i.test(label) ? label : `${rows} ${label}`;
  const parts = [text];
  if (tabs.length > 1) parts.push(`from ${tabs.length} tabs`);
  let msg = parts.join(' ') + (skippedRows ? `, ${skippedRows} rows skipped` : '') + '.';
  if (skippedTabs.length) msg += ` Skipped tabs without the mapped columns: ${skippedTabs.join(', ')}.`;
  if (missing.length) msg += ` Tabs not found: ${missing.join(', ')}.`;
  return msg;
}

async function safeUpsertSites(db: Db, records: any[]): Promise<void> {
  for (let i = 0; i < records.length; i += CHUNK) {
    const chunk = records.slice(i, i + CHUNK);
    const { error } = await db.from('vendor_sites').upsert(chunk, { onConflict: 'source_id,domain' });
    if (error) {
      if (
        error.message.includes('payment_status') ||
        error.message.includes('payment_date') ||
        error.message.includes('source_tab') ||
        error.code === '42703'
      ) {
        const stripped = chunk.map((r: any) => {
          const { payment_status, payment_date, source_tab, ...rest } = r;
          return rest;
        });
        const { error: retryErr } = await db.from('vendor_sites').upsert(stripped, { onConflict: 'source_id,domain' });
        if (retryErr) throw new Error(`Database error while saving sites: ${retryErr.message}`);
      } else {
        throw new Error(`Database error while saving sites: ${error.message}`);
      }
    }
  }
}

async function safeUpsertOrders(db: Db, records: any[]): Promise<void> {
  for (let i = 0; i < records.length; i += CHUNK) {
    const chunk = records.slice(i, i + CHUNK);
    const { error } = await db.from('orders').upsert(chunk, { onConflict: 'source_id,source_key' });
    if (error) {
      if (
        error.message.includes('payment_status') ||
        error.message.includes('order_month') ||
        error.code === '42703'
      ) {
        const stripped = chunk.map((r: any) => {
          const { payment_status, order_month, ...rest } = r;
          return rest;
        });
        const { error: retryErr } = await db.from('orders').upsert(stripped, { onConflict: 'source_id,source_key' });
        if (retryErr) throw new Error(`Database error while saving orders: ${retryErr.message}`);
      } else {
        throw new Error(`Database error while saving orders: ${error.message}`);
      }
    }
  }
}

/* ------------------------------------------------------------------ vendor price lists & orders */
async function loadVendorNames(db: Db): Promise<Map<string, string>> {
  const { data, error } = await db.from('vendors').select('id,name');
  if (error) throw new Error(error.message);
  const byName = new Map<string, string>();
  for (const v of (data ?? []) as { id: string; name: string }[]) byName.set(v.name.trim().toLowerCase(), v.id);
  return byName;
}

async function syncVendorSheet(db: Db, src: Source, tables: SheetTable[], missing: string[], startedAt: string): Promise<SyncResult> {
  const m = src.mapping || {};
  const vendorByName = await loadVendorNames(db);
  let defaultVendorName: string | null = null;
  if (src.vendor_id) {
    const { data: vData } = await db.from('vendors').select('name').eq('id', src.vendor_id).maybeSingle();
    defaultVendorName = (vData as { name: string } | null)?.name ?? null;
  }

  type SiteRec = {
    source_id: string; vendor_id: string; domain: string; site_url: string | null; price: number | null;
    currency: string; da: number | null; dr: number | null; traffic: number | null; niche: string | null;
    source_tab?: string | null; payment_status?: string | null; payment_date?: string | null; synced_at: string;
  };
  type OrderRec = {
    source_id: string; source_key: string; source_tab: string; domain: string; live_url: string | null; vendor_id: string | null;
    vendor_name: string | null; order_date: string | null; price_paid: number | null; currency: string; notes: string | null;
    sheet_status: 'indexed' | 'not_indexed' | null; order_status: 'live' | 'ordered'; pair: string | null; article_url: string | null;
    payment_status?: string | null;
    order_month?: string | null;
  };

  const sitesMap = new Map<string, SiteRec>();
  const ordersMap = new Map<string, OrderRec>();
  const usedTabs: string[] = [];
  const skippedTabs: string[] = [];
  let skipped = 0;
  let rowCounter = 0;

  for (const t of tables) {
    const idx = {
      site: colIndex(t.headers, m.site), price: colIndex(t.headers, m.price), currency: colIndex(t.headers, m.currency),
      da: colIndex(t.headers, m.da), dr: colIndex(t.headers, m.dr), traffic: colIndex(t.headers, m.traffic), niche: colIndex(t.headers, m.niche),
      live: colIndex(t.headers, m.live_url), status: colIndex(t.headers, m.status), date: colIndex(t.headers, m.date),
      article: colIndex(t.headers, m.article), pair: colIndex(t.headers, m.pair), vendor: colIndex(t.headers, m.vendor),
      notes: colIndex(t.headers, m.notes),
      payment_status: colIndex(t.headers, m.payment_status),
      payment_date: colIndex(t.headers, m.payment_date),
    };
    if (idx.site < 0 && idx.live < 0) {
      skippedTabs.push(t.tab);
      continue;
    }
    usedTabs.push(t.tab);

    for (const r of t.body) {
      rowCounter++;
      const live = cleanUrl(cell(r, idx.live));
      const rawSite = cell(r, idx.site);
      const domain = normalizeDomain(rawSite) ?? (live ? normalizeDomain(live) : null);

      const priceRaw = cell(r, idx.price);
      const price = parseMoney(priceRaw);
      const currencyRaw = idx.currency >= 0 && cell(r, idx.currency) ? cell(r, idx.currency) : priceRaw;
      const currency = parseCurrency(currencyRaw, src.default_currency || CURRENCY);

      const rowVendorName = cellText(cell(r, idx.vendor));
      const vendorName = rowVendorName || defaultVendorName;
      const vendorId = rowVendorName ? (vendorByName.get(rowVendorName.toLowerCase()) ?? src.vendor_id) : src.vendor_id;

      const date = parseDate(cell(r, idx.date));
      const st = parseIndexStatus(cell(r, idx.status));
      const doc = cellText(cell(r, idx.article));
      const pair = cellText(cell(r, idx.pair));
      const notes = cellText(cell(r, idx.notes));
      const paymentStatus = cellText(cell(r, idx.payment_status));
      const paymentDate = parseDate(cell(r, idx.payment_date)) ?? date;

      if (!domain) {
        skipped++;
        continue;
      }

      // 1. Available vendor site listing
      if (src.vendor_id) {
        const siteRec: SiteRec = {
          source_id: src.id,
          vendor_id: (vendorId ?? src.vendor_id) as string,
          domain,
          site_url: cellText(rawSite) ?? (live ? `https://${domain}` : null),
          price,
          currency,
          da: parseIntSafe(cell(r, idx.da)),
          dr: parseIntSafe(cell(r, idx.dr)),
          traffic: parseIntSafe(cell(r, idx.traffic)),
          niche: cellText(cell(r, idx.niche)),
          source_tab: t.tab,
          payment_status: paymentStatus,
          payment_date: paymentDate,
          synced_at: startedAt,
        };
        const prev = sitesMap.get(domain);
        if (!prev || (price !== null && (prev.price === null || price < prev.price))) {
          sitesMap.set(domain, siteRec);
        }
      }

      // 2. Order record (if live link, date, article/doc, status, pair, or payment status exists, or order column mapped)
      const hasOrderData = !!(live || date || doc || st || pair || paymentStatus);
      const hasOrderMapping = idx.live >= 0 || idx.date >= 0 || idx.article >= 0 || idx.status >= 0 || idx.payment_status >= 0;
      if (hasOrderData || hasOrderMapping) {
        const key = live
          ? `u:${live.toLowerCase()}`
          : (doc
            ? `a:${doc.toLowerCase()}`
            : `d:${domain}|${date ?? ''}|${(vendorName ?? '').toLowerCase()}#${rowCounter}`);

        const inferredMonth = inferMonthFromTabName(t.tab);
        const orderDate = date ?? paymentDate;
        const orderMonth = inferredMonth ? inferredMonth.monthStart : (orderDate ? `${orderDate.slice(0, 7)}-01` : null);

        ordersMap.set(key, {
          source_id: src.id,
          source_key: key,
          source_tab: t.tab,
          domain,
          live_url: live,
          vendor_id: vendorId ?? src.vendor_id,
          vendor_name: vendorName,
          order_date: orderDate,
          order_month: orderMonth,
          price_paid: price, // strictly the price written in front of the site in this row!
          currency,
          notes,
          sheet_status: st === 'indexed' || st === 'not_indexed' ? st : null,
          order_status: live ? 'live' : 'ordered',
          pair,
          article_url: doc,
          payment_status: paymentStatus,
        });
      }
    }
  }

  if (!usedTabs.length) {
    throw new Error(`The website or live link column was not found in header row ${src.header_row} of any tab. Open the sheet settings and map the columns again.`);
  }
  if (sitesMap.size === 0 && ordersMap.size === 0) {
    throw new Error('No valid website or order rows were found. Nothing was changed. Check the column mapping and header row.');
  }

  // 1. Save vendor sites
  if (sitesMap.size > 0 && src.vendor_id) {
    const records = Array.from(sitesMap.values());
    await safeUpsertSites(db, records);
    const { error: delErr } = await db.from('vendor_sites').delete().eq('source_id', src.id).lt('synced_at', startedAt);
    if (delErr) throw new Error(`Database error while cleaning old sites: ${delErr.message}`);
  }

  // 2. Save orders (NEVER delete orders! Orders are historical purchases and indexing records)
  if (ordersMap.size > 0) {
    const records = Array.from(ordersMap.values());
    await safeUpsertOrders(db, records);

    // Apply sheet index status to orders that have not yet been checked by Serper on Google
    for (const status of ['indexed', 'not_indexed'] as const) {
      const keys = records.filter((r) => r.sheet_status === status && r.live_url).map((r) => r.source_key);
      for (let i = 0; i < keys.length; i += 100) {
        const { error } = await db
          .from('orders')
          .update({ indexed_status: status, index_error: null })
          .eq('source_id', src.id)
          .in('source_key', keys.slice(i, i + 100))
          .is('last_checked_at', null);
        if (error) throw new Error(`Database error while applying sheet status: ${error.message}`);
      }
    }
  }

  let label = 'sites synced';
  if (ordersMap.size > 0 && sitesMap.size > 0) {
    label = `${sitesMap.size} sites and ${ordersMap.size} orders synced`;
  } else if (ordersMap.size > 0) {
    label = `${ordersMap.size} orders synced`;
  } else {
    label = `${sitesMap.size} sites synced`;
  }
  const totalCount = sitesMap.size + ordersMap.size;
  return { ok: true, rows: totalCount, message: summary(label, totalCount, usedTabs, skippedTabs, skipped, missing) };
}

/* ------------------------------------------------------------------ order history */
async function syncOrdersSheet(db: Db, src: Source, tables: SheetTable[], missing: string[]): Promise<SyncResult> {
  const m = src.mapping || {};
  const vendorByName = await loadVendorNames(db);

  type Rec = {
    source_id: string; source_key: string; source_tab: string; domain: string; live_url: string | null; vendor_id: string | null;
    vendor_name: string | null; order_date: string | null; price_paid: number | null; currency: string; notes: string | null;
    sheet_status: 'indexed' | 'not_indexed' | null; order_status: 'live' | 'ordered'; pair: string | null; article_url: string | null;
    payment_status?: string | null;
    order_month?: string | null;
  };
  const map = new Map<string, Rec>();
  const usedTabs: string[] = [];
  const skippedTabs: string[] = [];
  let skipped = 0;

  for (const t of tables) {
    const idx = {
      site: colIndex(t.headers, m.site), live: colIndex(t.headers, m.live_url), vendor: colIndex(t.headers, m.vendor),
      date: colIndex(t.headers, m.date), price: colIndex(t.headers, m.price), currency: colIndex(t.headers, m.currency),
      status: colIndex(t.headers, m.status), notes: colIndex(t.headers, m.notes),
      pair: colIndex(t.headers, m.pair), article: colIndex(t.headers, m.article),
      payment_status: colIndex(t.headers, m.payment_status),
    };
    if (idx.site < 0 && idx.live < 0) {
      skippedTabs.push(t.tab);
      continue;
    }
    usedTabs.push(t.tab);
    for (const r of t.body) {
      const live = cleanUrl(cell(r, idx.live));
      const domain = normalizeDomain(cell(r, idx.site)) ?? (live ? normalizeDomain(live) : null);
      if (!domain) {
        skipped++;
        continue;
      }
      const vendorName = cellText(cell(r, idx.vendor));
      const date = parseDate(cell(r, idx.date));
      const priceRaw = cell(r, idx.price);
      const st = parseIndexStatus(cell(r, idx.status));
      const key = live ? `u:${live.toLowerCase()}` : `d:${domain}|${date ?? ''}|${(vendorName ?? '').toLowerCase()}`;
      const inferredMonth = inferMonthFromTabName(t.tab);
      const orderMonth = inferredMonth ? inferredMonth.monthStart : (date ? `${date.slice(0, 7)}-01` : null);
      map.set(key, {
        source_id: src.id, source_key: key, source_tab: t.tab, domain, live_url: live,
        vendor_id: vendorName ? vendorByName.get(vendorName.toLowerCase()) ?? null : null,
        vendor_name: vendorName, order_date: date, order_month: orderMonth, price_paid: parseMoney(priceRaw),
        currency: parseCurrency(idx.currency >= 0 && cell(r, idx.currency) ? cell(r, idx.currency) : priceRaw, src.default_currency || CURRENCY),
        notes: cellText(cell(r, idx.notes)),
        sheet_status: st === 'indexed' || st === 'not_indexed' ? st : null,
        order_status: live ? 'live' : 'ordered',
        pair: cellText(cell(r, idx.pair)),
        article_url: cellText(cell(r, idx.article)),
        payment_status: cellText(cell(r, idx.payment_status)),
      });
    }
  }

  if (!usedTabs.length) throw new Error('Map at least the website column or the live link column (and check the header row), then try again.');
  if (map.size === 0) throw new Error('No valid order rows were found. Nothing was changed. Check the column mapping and header row.');

  // Upsert only touches the columns above, so Google-check history of existing orders is preserved.
  const records = Array.from(map.values());
  await safeUpsertOrders(db, records);

  // The sheet's Status column drives the portal status for links that have not been checked on Google yet.
  for (const status of ['indexed', 'not_indexed'] as const) {
    const keys = records.filter((r) => r.sheet_status === status && r.live_url).map((r) => r.source_key);
    for (let i = 0; i < keys.length; i += 100) {
      const { error } = await db
        .from('orders')
        .update({ indexed_status: status, index_error: null })
        .eq('source_id', src.id)
        .in('source_key', keys.slice(i, i + 100))
        .is('last_checked_at', null);
      if (error) throw new Error(`Database error while applying sheet status: ${error.message}`);
    }
  }
  return { ok: true, rows: records.length, message: summary('orders imported/updated', records.length, usedTabs, skippedTabs, skipped, missing).replace('rows skipped', 'rows skipped (no live link or website)') };
}

/* ------------------------------------------------------------------ payments */
async function syncPaymentsSheet(db: Db, src: Source, tables: SheetTable[], missing: string[], startedAt: string): Promise<SyncResult> {
  const m = src.mapping || {};
  const vendorByName = await loadVendorNames(db);

  type Rec = {
    source_id: string; source_key: string; vendor_id: string | null; vendor_name: string; amount: number; currency: string;
    paid_date: string; paid_time: string | null; method: string | null; reference: string | null; notes: string | null; updated_at: string;
  };
  const records: Rec[] = [];
  const seen = new Map<string, number>();
  const usedTabs: string[] = [];
  const skippedTabs: string[] = [];
  let skipped = 0;

  for (const t of tables) {
    const idx = {
      vendor: colIndex(t.headers, m.vendor), amount: colIndex(t.headers, m.amount), date: colIndex(t.headers, m.date),
      time: colIndex(t.headers, m.time), method: colIndex(t.headers, m.method), reference: colIndex(t.headers, m.reference),
      currency: colIndex(t.headers, m.currency), notes: colIndex(t.headers, m.notes),
    };
    if (idx.vendor < 0 || idx.amount < 0 || idx.date < 0) {
      skippedTabs.push(t.tab);
      continue;
    }
    usedTabs.push(t.tab);
    for (const r of t.body) {
      const vendorName = cellText(cell(r, idx.vendor));
      const amount = parseMoney(cell(r, idx.amount));
      const date = parseDate(cell(r, idx.date));
      if (!vendorName || amount === null || amount <= 0 || !date) {
        skipped++;
        continue;
      }
      const timeRaw = cell(r, idx.time);
      // If there is no time column, a date cell that also holds a time (e.g. 45201.6) still gives the time.
      const time = parseTime(timeRaw) ?? (idx.time < 0 ? parseTime(cell(r, idx.date)) : null);
      const reference = cellText(cell(r, idx.reference));
      const base = `${date}|${time ?? ''}|${vendorName.toLowerCase()}|${amount}|${(reference ?? '').toLowerCase()}`;
      const n = (seen.get(base) ?? 0) + 1; // two identical rows stay two payments
      seen.set(base, n);
      records.push({
        source_id: src.id, source_key: `${base}#${n}`, vendor_id: vendorByName.get(vendorName.toLowerCase()) ?? null,
        vendor_name: vendorName, amount, currency: parseCurrency(idx.currency >= 0 ? cell(r, idx.currency) : undefined, src.default_currency || CURRENCY),
        paid_date: date, paid_time: time, method: cellText(cell(r, idx.method)), reference, notes: cellText(cell(r, idx.notes)), updated_at: startedAt,
      });
    }
  }

  if (!usedTabs.length) throw new Error('The Vendor, Amount and Payment date columns were not found. Open the sheet settings and map the columns again.');
  if (records.length === 0) throw new Error('No valid payment rows were found. Nothing was changed. Check the column mapping and header row.');

  for (let i = 0; i < records.length; i += CHUNK) {
    const { error } = await db.from('payments').upsert(records.slice(i, i + CHUNK), { onConflict: 'source_id,source_key' });
    if (error) throw new Error(`Database error while saving payments: ${error.message}`);
  }
  // Payments removed from the sheet are removed here too (payments typed in by hand are never touched).
  const { error: delErr } = await db.from('payments').delete().eq('source_id', src.id).lt('updated_at', startedAt);
  if (delErr) throw new Error(`Database error while cleaning old payments: ${delErr.message}`);
  return { ok: true, rows: records.length, message: summary('payments synced', records.length, usedTabs, skippedTabs, skipped, missing) };
}

/* ------------------------------------------------------------------ vendor ledger (bought links + payments) */
async function syncLedgerSheet(db: Db, src: Source, startedAt: string): Promise<SyncResult> {
  if (!src.vendor_id) throw new Error('A vendor must be assigned to this ledger.');
  const { data: vData } = await db.from('vendors').select('name').eq('id', src.vendor_id).maybeSingle();
  const defaultVendorName = (vData as { name: string } | null)?.name ?? 'Vendor';

  // 1. Resolve tabs
  const allTabs = await fetchSheetTabs(src.spreadsheet_id);
  let orderTabs = Array.isArray(src.order_tabs) && src.order_tabs.length > 0 ? [...src.order_tabs] : [];
  if (!orderTabs.length && src.tab_name) {
    const { tabs } = await resolveTabs(src.spreadsheet_id, src.tab_name);
    orderTabs = tabs;
  }
  if (!orderTabs.length) {
    orderTabs = allTabs.filter((t) => inferMonthFromTabName(t) !== null);
  }

  // Detect payment tab
  const paymentTab = src.payment_tab || allTabs.find((t) => /payment/i.test(t)) || null;

  // Auto include new month tabs
  let tabsUpdated = false;
  if (src.auto_include_new_tabs ?? true) {
    for (const t of allTabs) {
      if (t === paymentTab) continue;
      if (inferMonthFromTabName(t) !== null && !orderTabs.includes(t)) {
        orderTabs.push(t);
        tabsUpdated = true;
      }
    }
  }

  if (paymentTab) {
    orderTabs = orderTabs.filter((t) => t !== paymentTab);
  }

  if (!orderTabs.length) {
    throw new Error('No month/order tabs found or selected in this spreadsheet.');
  }

  // 2. Fetch order tables
  const { tables: orderTables } = await fetchTables(src.spreadsheet_id, orderTabs.join(','), src.header_row);

  // 3. Fetch payment table if configured
  let paymentTable: SheetTable | null = null;
  if (paymentTab) {
    try {
      const { tables: pTables } = await fetchTables(src.spreadsheet_id, paymentTab, src.header_row);
      paymentTable = pTables[0] ?? null;
    } catch {
      // Payment tab might have different columns or be missing
    }
  }

  // 4. Parse orders & payments
  const parsedOrders = parseLedgerOrders(orderTables, src.mapping || {}, {
    requireLiveLink: src.require_live_link ?? true,
    defaultCurrency: src.default_currency || 'PKR',
  });

  const parsedPayments = parseLedgerPayments(paymentTable, src.payment_mapping || {}, src.default_currency || 'PKR');

  // 5. Save orders
  if (parsedOrders.orders.length > 0) {
    const orderRecords = parsedOrders.orders.map((o) => ({
      source_id: src.id,
      source_key: o.source_key,
      source_tab: o.source_tab,
      domain: o.domain,
      live_url: o.live_url,
      vendor_id: src.vendor_id,
      vendor_name: defaultVendorName,
      order_date: o.order_date,
      order_month: o.order_month,
      price_paid: o.price_paid,
      currency: o.currency,
      notes: o.notes,
      sheet_status: o.sheet_status,
      order_status: 'live' as const,
      pair: o.pair,
      article_url: o.article_url,
      payment_status: o.payment_status,
      updated_at: startedAt,
    }));

    await safeUpsertOrders(db, orderRecords);

    // Clean up orders of this source that disappeared from the sheet
    const { error: delErr } = await db.from('orders').delete().eq('source_id', src.id).lt('updated_at', startedAt);
    if (delErr) console.error('Database error cleaning removed ledger orders:', delErr.message);

    // Apply sheet index status to orders that have not yet been checked on Google
    for (const status of ['indexed', 'not_indexed'] as const) {
      const keys = orderRecords.filter((r) => r.sheet_status === status && r.live_url).map((r) => r.source_key);
      for (let i = 0; i < keys.length; i += 100) {
        await db
          .from('orders')
          .update({ indexed_status: status, index_error: null })
          .eq('source_id', src.id)
          .in('source_key', keys.slice(i, i + 100))
          .is('last_checked_at', null);
      }
    }
  }

  // 6. Save payments
  if (parsedPayments.payments.length > 0) {
    const payRecords = parsedPayments.payments.map((p) => ({
      source_id: src.id,
      source_key: p.source_key,
      vendor_id: src.vendor_id,
      vendor_name: defaultVendorName,
      amount: p.amount,
      currency: p.currency,
      paid_date: p.paid_date,
      paid_time: p.paid_time,
      method: p.method,
      reference: p.reference,
      notes: p.notes,
      updated_at: startedAt,
    }));

    for (let i = 0; i < payRecords.length; i += CHUNK) {
      const { error } = await db.from('payments').upsert(payRecords.slice(i, i + CHUNK), { onConflict: 'source_id,source_key' });
      if (error) console.error('Error importing ledger payments:', error.message);
    }
  }

  // Always delete payments for this source that disappeared from the sheet
  const { error: delPErr } = await db.from('payments').delete().eq('source_id', src.id).lt('updated_at', startedAt);
  if (delPErr) console.error('Error cleaning removed ledger payments:', delPErr.message);

  // Build per-tab diagnostics
  const tabDiagnostics: TabDiagnostic[] = [...parsedOrders.tabDiagnostics];
  if (parsedPayments.diagnostic) {
    tabDiagnostics.push(parsedPayments.diagnostic);
  }
  const processedTabs = new Set([
    ...parsedOrders.usedTabs,
    ...(paymentTable ? [paymentTable.tab] : []),
  ]);
  for (const t of allTabs) {
    if (!processedTabs.has(t)) {
      tabDiagnostics.push({
        tab: t,
        type: 'ignored',
        reason: 'Ignored: name does not contain a recognized month name',
      });
    }
  }

  // Update order_tabs and sync_diagnostics in DB
  try {
    const updatePayload: Record<string, any> = {
      sync_diagnostics: {
        synced_at: startedAt,
        tabs: tabDiagnostics,
      },
    };
    if (tabsUpdated) updatePayload.order_tabs = orderTabs;
    await db.from('sheet_sources').update(updatePayload).eq('id', src.id);
  } catch (diagErr) {
    console.warn('Could not save sync_diagnostics on source:', diagErr);
  }

  const message = `${parsedOrders.orders.length} links (PKR ${Math.round(parsedOrders.totalOrderedPKR).toLocaleString()}) from ${parsedOrders.usedTabs.length} tabs; ${parsedOrders.skippedNoLink} rows skipped (no live link); ${parsedPayments.payments.length} payments (PKR ${Math.round(parsedPayments.totalPaidPKR).toLocaleString()}).`;

  return {
    ok: true,
    rows: parsedOrders.orders.length + parsedPayments.payments.length,
    message,
  };
}

export async function previewLedgerSource(sourceId: string): Promise<ParsedLedger> {
  const db = createAdminClient();
  const { data, error } = await db.from('sheet_sources').select('*').eq('id', sourceId).maybeSingle();
  if (error || !data) throw new Error('Sheet not found.');
  const src = data as Source;

  const allTabs = await fetchSheetTabs(src.spreadsheet_id);
  let orderTabs = Array.isArray(src.order_tabs) && src.order_tabs.length > 0 ? [...src.order_tabs] : [];
  if (!orderTabs.length && src.tab_name) {
    const { tabs } = await resolveTabs(src.spreadsheet_id, src.tab_name);
    orderTabs = tabs;
  }
  if (!orderTabs.length) {
    orderTabs = allTabs.filter((t) => inferMonthFromTabName(t) !== null);
  }
  const paymentTab = src.payment_tab || allTabs.find((t) => /payment/i.test(t)) || null;

  if (src.auto_include_new_tabs ?? true) {
    for (const t of allTabs) {
      if (t === paymentTab) continue;
      if (inferMonthFromTabName(t) !== null && !orderTabs.includes(t)) {
        orderTabs.push(t);
      }
    }
  }

  if (paymentTab) {
    orderTabs = orderTabs.filter((t) => t !== paymentTab);
  }

  const { tables: orderTables } = await fetchTables(src.spreadsheet_id, orderTabs.join(','), src.header_row);

  let paymentTable: SheetTable | null = null;
  if (paymentTab) {
    try {
      const { tables: pTables } = await fetchTables(src.spreadsheet_id, paymentTab, src.header_row);
      paymentTable = pTables[0] ?? null;
    } catch {
      /* ignore */
    }
  }

  return previewLedger(orderTables, paymentTable, src.mapping || {}, src.payment_mapping || {}, {
    requireLiveLink: src.require_live_link ?? true,
    defaultCurrency: src.default_currency || 'PKR',
    allSheetTabs: allTabs,
  });
}

export async function previewLedgerFromParams(params: {
  spreadsheetId: string;
  headerRow: number;
  orderTabs: string[];
  paymentTab?: string | null;
  autoIncludeNewTabs?: boolean;
  orderMapping: Record<string, string>;
  paymentMapping: Record<string, string>;
  requireLiveLink?: boolean;
  defaultCurrency?: string;
}): Promise<ParsedLedger> {
  const allTabs = await fetchSheetTabs(params.spreadsheetId);
  let orderTabs = [...params.orderTabs];
  if (!orderTabs.length) {
    orderTabs = allTabs.filter((t) => inferMonthFromTabName(t) !== null);
  }
  const paymentTab = params.paymentTab || allTabs.find((t) => /payment/i.test(t)) || null;

  if (params.autoIncludeNewTabs ?? true) {
    for (const t of allTabs) {
      if (t === paymentTab) continue;
      if (inferMonthFromTabName(t) !== null && !orderTabs.includes(t)) {
        orderTabs.push(t);
      }
    }
  }

  if (paymentTab) {
    orderTabs = orderTabs.filter((t) => t !== paymentTab);
  }

  const { tables: orderTables } = await fetchTables(params.spreadsheetId, orderTabs.join(','), params.headerRow);

  let paymentTable: SheetTable | null = null;
  if (paymentTab) {
    try {
      const { tables: pTables } = await fetchTables(params.spreadsheetId, paymentTab, params.headerRow);
      paymentTable = pTables[0] ?? null;
    } catch {
      /* ignore */
    }
  }

  return previewLedger(orderTables, paymentTable, params.orderMapping, params.paymentMapping, {
    requireLiveLink: params.requireLiveLink ?? true,
    defaultCurrency: params.defaultCurrency || 'PKR',
    allSheetTabs: allTabs,
  });
}

/* ------------------------------------------------------------------ entry points */
export async function syncSource(sourceId: string): Promise<SyncResult> {
  const db = createAdminClient();
  const { data, error } = await db.from('sheet_sources').select('*').eq('id', sourceId).maybeSingle();
  if (error || !data) return { ok: false, rows: 0, message: 'Sheet not found.' };
  const src = data as Source;
  const startedAt = new Date().toISOString();
  try {
    let result: SyncResult;
    if (src.kind === 'ledger') {
      result = await syncLedgerSheet(db, src, startedAt);
    } else {
      const tabSpec = src.order_tabs && src.order_tabs.length > 0 ? src.order_tabs.join(',') : src.tab_name;
      const { tables, missing } = await fetchTables(src.spreadsheet_id, tabSpec, src.header_row);
      result =
        src.kind === 'vendor' ? await syncVendorSheet(db, src, tables, missing, startedAt)
        : src.kind === 'payments' ? await syncPaymentsSheet(db, src, tables, missing, startedAt)
        : await syncOrdersSheet(db, src, tables, missing);
    }
    await db
      .from('sheet_sources')
      .update({ last_synced_at: new Date().toISOString(), last_sync_status: 'ok', last_sync_message: result.message, last_sync_rows: result.rows })
      .eq('id', sourceId);
    return result;
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    await db.from('sheet_sources').update({ last_sync_status: 'error', last_sync_message: message.slice(0, 500) }).eq('id', sourceId);
    return { ok: false, rows: 0, message };
  }
}

/** Sync every active sheet (of active vendors). Stops politely when the time budget is used up. */
export async function syncAllSources(budgetMs: number): Promise<{ total: number; synced: number; failed: number; skipped: number; errors: string[] }> {
  const db = createAdminClient();
  const { data, error } = await db
    .from('sheet_sources')
    .select('id,label,kind,active,vendors(active)')
    .eq('active', true)
    .order('last_synced_at', { ascending: true, nullsFirst: true });
  if (error) throw new Error(error.message);
  const list = ((data ?? []) as any[]).filter((s) => {
    if (s.kind === 'vendor' || s.kind === 'ledger') {
      const v = Array.isArray(s.vendors) ? s.vendors[0] : s.vendors;
      return !v || v.active;
    }
    return true;
  });
  const deadline = Date.now() + budgetMs;
  let synced = 0;
  let failed = 0;
  let skipped = 0;
  const errors: string[] = [];
  for (const s of list) {
    if (Date.now() > deadline) {
      skipped++;
      continue;
    }
    const r = await syncSource(s.id);
    if (r.ok) synced++;
    else {
      failed++;
      errors.push(`${s.label ?? s.id}: ${r.message}`);
    }
  }
  return { total: list.length, synced, failed, skipped, errors };
}
