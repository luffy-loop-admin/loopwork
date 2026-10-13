import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { CURRENCY } from '@/lib/config';
import { cleanUrl, normalizeDomain } from '@/lib/domain';
import { cellText, parseCurrency, parseDate, parseIndexStatus, parseIntSafe, parseMoney, parseTime } from '@/lib/parse';
import { colIndex, fetchTables, type SheetTable } from '@/lib/sheets';

type Db = ReturnType<typeof createAdminClient>;
type Source = {
  id: string;
  kind: 'vendor' | 'orders' | 'payments';
  vendor_id: string | null;
  spreadsheet_id: string;
  tab_name: string | null;
  header_row: number;
  default_currency: string;
  mapping: Record<string, string>;
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

/* ------------------------------------------------------------------ vendor price lists & orders */
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
    currency: string; da: number | null; dr: number | null; traffic: number | null; niche: string | null; synced_at: string;
  };
  type OrderRec = {
    source_id: string; source_key: string; source_tab: string; domain: string; live_url: string | null; vendor_id: string | null;
    vendor_name: string | null; order_date: string | null; price_paid: number | null; currency: string; notes: string | null;
    sheet_status: 'indexed' | 'not_indexed' | null; order_status: 'live' | 'ordered'; pair: string | null; article_url: string | null;
  };
  type PayRec = {
    source_id: string; source_key: string; vendor_id: string | null; vendor_name: string | null;
    amount: number; currency: string; paid_date: string; method: string; notes: string | null;
  };

  const sitesMap = new Map<string, SiteRec>();
  const ordersMap = new Map<string, OrderRec>();
  const paymentsMap = new Map<string, PayRec>();
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

      if (!domain) {
        // Detect payment lines at the bottom of the sheet (e.g. "30,000 Only Index links Payment", "700 Remaining")
        const rowText = r.map((c) => String(c ?? '')).join(' ');
        const isPaymentRow = /pay|paid|payment|remaining|advance|sent|transferred|deposit/i.test(rowText);
        const amount = price ?? parseMoney(cell(r, idx.live)) ?? parseMoney(cell(r, idx.site));
        if (amount && amount > 0 && isPaymentRow && src.vendor_id) {
          const paidDate = date ?? parseDate(rowText) ?? startedAt.slice(0, 10);
          const pNote = doc ?? cellText(cell(r, idx.status)) ?? cellText(cell(r, idx.notes)) ?? rowText.slice(0, 150);
          const pKey = `p:${src.id}|${amount}|${paidDate}|${pNote?.slice(0, 20) ?? ''}`;
          paymentsMap.set(pKey, {
            source_id: src.id,
            source_key: pKey,
            vendor_id: src.vendor_id,
            vendor_name: vendorName,
            amount,
            currency,
            paid_date: paidDate,
            method: 'Sheet import',
            notes: pNote,
          });
        } else {
          skipped++;
        }
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
          synced_at: startedAt,
        };
        const prev = sitesMap.get(domain);
        if (!prev || (price !== null && (prev.price === null || price < prev.price))) {
          sitesMap.set(domain, siteRec);
        }
      }

      // 2. Order record: only if this row has actual order data (live URL, order date, or article doc)
      const isOrder = !!(live || date || doc);
      if (isOrder) {
        const key = live
          ? `u:${live.toLowerCase()}`
          : (doc
            ? `a:${doc.toLowerCase()}`
            : `d:${domain}|${date ?? ''}`);

        ordersMap.set(key, {
          source_id: src.id,
          source_key: key,
          source_tab: t.tab,
          domain,
          live_url: live,
          vendor_id: vendorId ?? src.vendor_id,
          vendor_name: vendorName,
          order_date: date,
          price_paid: price, // strictly the price written in front of the site in this row!
          currency,
          notes,
          sheet_status: st === 'indexed' || st === 'not_indexed' ? st : null,
          order_status: live ? 'live' : 'ordered',
          pair,
          article_url: doc,
        });
      }
    }
  }

  if (!usedTabs.length) {
    throw new Error(`The website or live link column was not found in header row ${src.header_row} of any tab. Open the sheet settings and map the columns again.`);
  }
  if (sitesMap.size === 0 && ordersMap.size === 0 && paymentsMap.size === 0) {
    throw new Error('No valid website, order, or payment rows were found. Nothing was changed. Check the column mapping and header row.');
  }

  // 1. Save vendor sites
  if (sitesMap.size > 0 && src.vendor_id) {
    const records = Array.from(sitesMap.values());
    for (let i = 0; i < records.length; i += CHUNK) {
      const { error } = await db.from('vendor_sites').upsert(records.slice(i, i + CHUNK), { onConflict: 'source_id,domain' });
      if (error) throw new Error(`Database error while saving sites: ${error.message}`);
    }
    const { error: delErr } = await db.from('vendor_sites').delete().eq('source_id', src.id).lt('synced_at', startedAt);
    if (delErr) throw new Error(`Database error while cleaning old sites: ${delErr.message}`);
  }

  // 2. Save orders & clean up stale/duplicate orders for this sheet
  if (ordersMap.size > 0) {
    const records = Array.from(ordersMap.values());
    for (let i = 0; i < records.length; i += CHUNK) {
      const { error } = await db.from('orders').upsert(records.slice(i, i + CHUNK), { onConflict: 'source_id,source_key' });
      if (error) throw new Error(`Database error while saving orders: ${error.message}`);
    }

    // Clean up duplicate or removed orders that belong to this sheet source
    const { data: existingOrders } = await db.from('orders').select('id,source_key').eq('source_id', src.id);
    const staleIds = (existingOrders ?? []).filter((o: any) => !ordersMap.has(o.source_key)).map((o: any) => o.id);
    if (staleIds.length > 0) {
      for (let i = 0; i < staleIds.length; i += 100) {
        await db.from('orders').delete().in('id', staleIds.slice(i, i + 100));
      }
    }

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

  // 3. Save auto-detected payments from sheet bottom lines
  if (paymentsMap.size > 0) {
    const payRecords = Array.from(paymentsMap.values());
    for (let i = 0; i < payRecords.length; i += CHUNK) {
      const { error } = await db.from('payments').upsert(payRecords.slice(i, i + CHUNK), { onConflict: 'source_id,source_key' });
      if (error) console.error('Error importing sheet payments:', error.message);
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
  if (paymentsMap.size > 0) {
    label += `, ${paymentsMap.size} payments imported`;
  }
  const totalCount = sitesMap.size + ordersMap.size + paymentsMap.size;
  return { ok: true, rows: totalCount, message: summary(label, totalCount, usedTabs, skippedTabs, skipped, missing) };
}

/* ------------------------------------------------------------------ order history */
async function loadVendorNames(db: Db): Promise<Map<string, string>> {
  const { data, error } = await db.from('vendors').select('id,name');
  if (error) throw new Error(error.message);
  const byName = new Map<string, string>();
  for (const v of (data ?? []) as { id: string; name: string }[]) byName.set(v.name.trim().toLowerCase(), v.id);
  return byName;
}

async function syncOrdersSheet(db: Db, src: Source, tables: SheetTable[], missing: string[]): Promise<SyncResult> {
  const m = src.mapping || {};
  const vendorByName = await loadVendorNames(db);

  type Rec = {
    source_id: string; source_key: string; source_tab: string; domain: string; live_url: string | null; vendor_id: string | null;
    vendor_name: string | null; order_date: string | null; price_paid: number | null; currency: string; notes: string | null;
    sheet_status: 'indexed' | 'not_indexed' | null; order_status: 'live' | 'ordered'; pair: string | null; article_url: string | null;
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
      map.set(key, {
        source_id: src.id, source_key: key, source_tab: t.tab, domain, live_url: live,
        vendor_id: vendorName ? vendorByName.get(vendorName.toLowerCase()) ?? null : null,
        vendor_name: vendorName, order_date: date, price_paid: parseMoney(priceRaw),
        currency: parseCurrency(idx.currency >= 0 && cell(r, idx.currency) ? cell(r, idx.currency) : priceRaw, src.default_currency || CURRENCY),
        notes: cellText(cell(r, idx.notes)),
        sheet_status: st === 'indexed' || st === 'not_indexed' ? st : null,
        order_status: live ? 'live' : 'ordered',
        pair: cellText(cell(r, idx.pair)),
        article_url: cellText(cell(r, idx.article)),
      });
    }
  }

  if (!usedTabs.length) throw new Error('Map at least the website column or the live link column (and check the header row), then try again.');
  if (map.size === 0) throw new Error('No valid order rows were found. Nothing was changed. Check the column mapping and header row.');

  // Upsert only touches the columns above, so Google-check history of existing orders is preserved.
  const records = Array.from(map.values());
  for (let i = 0; i < records.length; i += CHUNK) {
    const { error } = await db.from('orders').upsert(records.slice(i, i + CHUNK), { onConflict: 'source_id,source_key' });
    if (error) throw new Error(`Database error while saving orders: ${error.message}`);
  }

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

/* ------------------------------------------------------------------ entry points */
export async function syncSource(sourceId: string): Promise<SyncResult> {
  const db = createAdminClient();
  const { data, error } = await db.from('sheet_sources').select('*').eq('id', sourceId).maybeSingle();
  if (error || !data) return { ok: false, rows: 0, message: 'Sheet not found.' };
  const src = data as Source;
  const startedAt = new Date().toISOString();
  try {
    const { tables, missing } = await fetchTables(src.spreadsheet_id, src.tab_name, src.header_row);
    const result =
      src.kind === 'vendor' ? await syncVendorSheet(db, src, tables, missing, startedAt)
      : src.kind === 'payments' ? await syncPaymentsSheet(db, src, tables, missing, startedAt)
      : await syncOrdersSheet(db, src, tables, missing);
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
    if (s.kind !== 'vendor') return true;
    const v = Array.isArray(s.vendors) ? s.vendors[0] : s.vendors;
    return !v || v.active;
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
