import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { cleanUrl, normalizeDomain } from '@/lib/domain';
import { cellText, parseCurrency, parseDate, parseIntSafe, parseMoney } from '@/lib/parse';
import { colIndex, fetchSheetRows, readTable } from '@/lib/sheets';

type Db = ReturnType<typeof createAdminClient>;
type Source = {
  id: string;
  kind: 'vendor' | 'orders';
  vendor_id: string | null;
  spreadsheet_id: string;
  tab_name: string | null;
  header_row: number;
  default_currency: string;
  mapping: Record<string, string>;
};

export type SyncResult = { ok: boolean; message: string; rows: number };

const CHUNK = 500;

function cell(row: unknown[], idx: number): unknown {
  return idx >= 0 ? row[idx] : undefined;
}

async function syncVendorSheet(db: Db, src: Source, rows: unknown[][], startedAt: string): Promise<SyncResult> {
  const m = src.mapping || {};
  const { headers, body } = readTable(rows, src.header_row);
  const idx = {
    site: colIndex(headers, m.site),
    price: colIndex(headers, m.price),
    currency: colIndex(headers, m.currency),
    da: colIndex(headers, m.da),
    dr: colIndex(headers, m.dr),
    traffic: colIndex(headers, m.traffic),
    niche: colIndex(headers, m.niche),
  };
  if (idx.site < 0) {
    throw new Error(`Website column "${m.site ?? ''}" was not found in header row ${src.header_row}. Open the sheet settings and map the columns again.`);
  }

  type Rec = {
    source_id: string; vendor_id: string; domain: string; site_url: string | null; price: number | null;
    currency: string; da: number | null; dr: number | null; traffic: number | null; niche: string | null; synced_at: string;
  };
  const map = new Map<string, Rec>();
  let skipped = 0;

  for (const r of body) {
    const raw = cell(r, idx.site);
    const domain = normalizeDomain(raw);
    if (!domain) {
      skipped++;
      continue;
    }
    const priceRaw = cell(r, idx.price);
    const price = parseMoney(priceRaw);
    const currencyRaw = idx.currency >= 0 && cell(r, idx.currency) ? cell(r, idx.currency) : priceRaw;
    const rec: Rec = {
      source_id: src.id,
      vendor_id: src.vendor_id as string,
      domain,
      site_url: cellText(raw),
      price,
      currency: parseCurrency(currencyRaw, src.default_currency),
      da: parseIntSafe(cell(r, idx.da)),
      dr: parseIntSafe(cell(r, idx.dr)),
      traffic: parseIntSafe(cell(r, idx.traffic)),
      niche: cellText(cell(r, idx.niche)),
      synced_at: startedAt,
    };
    const prev = map.get(domain);
    // Duplicate domain inside one sheet: keep the cheapest priced row.
    if (!prev || (price !== null && (prev.price === null || price < prev.price))) map.set(domain, rec);
  }

  if (map.size === 0) {
    throw new Error('No valid website rows were found. Nothing was changed. Check the column mapping and header row.');
  }

  const records = Array.from(map.values());
  for (let i = 0; i < records.length; i += CHUNK) {
    const { error } = await db.from('vendor_sites').upsert(records.slice(i, i + CHUNK), { onConflict: 'source_id,domain' });
    if (error) throw new Error(`Database error while saving sites: ${error.message}`);
  }
  // Remove sites that are no longer in the sheet.
  const { error: delErr } = await db.from('vendor_sites').delete().eq('source_id', src.id).lt('synced_at', startedAt);
  if (delErr) throw new Error(`Database error while cleaning old sites: ${delErr.message}`);

  return { ok: true, rows: records.length, message: `${records.length} sites synced${skipped ? `, ${skipped} rows skipped` : ''}.` };
}

async function syncOrdersSheet(db: Db, src: Source, rows: unknown[][]): Promise<SyncResult> {
  const m = src.mapping || {};
  const { headers, body } = readTable(rows, src.header_row);
  const idx = {
    site: colIndex(headers, m.site),
    live: colIndex(headers, m.live_url),
    vendor: colIndex(headers, m.vendor),
    date: colIndex(headers, m.date),
    price: colIndex(headers, m.price),
    currency: colIndex(headers, m.currency),
    notes: colIndex(headers, m.notes),
  };
  if (idx.site < 0 && idx.live < 0) {
    throw new Error('Map at least the website column or the live link column, then try again.');
  }

  const { data: vendorRows, error: vErr } = await db.from('vendors').select('id,name');
  if (vErr) throw new Error(vErr.message);
  const vendorByName = new Map<string, string>();
  for (const v of (vendorRows ?? []) as { id: string; name: string }[]) vendorByName.set(v.name.trim().toLowerCase(), v.id);

  type Rec = {
    source_id: string; source_key: string; domain: string; live_url: string | null; vendor_id: string | null;
    vendor_name: string | null; order_date: string | null; price_paid: number | null; currency: string; notes: string | null;
  };
  const map = new Map<string, Rec>();
  let skipped = 0;

  for (const r of body) {
    const live = cleanUrl(cell(r, idx.live));
    const domain = normalizeDomain(cell(r, idx.site)) ?? (live ? normalizeDomain(live) : null);
    if (!domain) {
      skipped++;
      continue;
    }
    const vendorName = cellText(cell(r, idx.vendor));
    const date = parseDate(cell(r, idx.date));
    const priceRaw = cell(r, idx.price);
    const key = live ? `u:${live.toLowerCase()}` : `d:${domain}|${date ?? ''}|${(vendorName ?? '').toLowerCase()}`;
    map.set(key, {
      source_id: src.id,
      source_key: key,
      domain,
      live_url: live,
      vendor_id: vendorName ? vendorByName.get(vendorName.toLowerCase()) ?? null : null,
      vendor_name: vendorName,
      order_date: date,
      price_paid: parseMoney(priceRaw),
      currency: parseCurrency(idx.currency >= 0 && cell(r, idx.currency) ? cell(r, idx.currency) : priceRaw, src.default_currency),
      notes: cellText(cell(r, idx.notes)),
    });
  }

  if (map.size === 0) throw new Error('No valid order rows were found. Nothing was changed. Check the column mapping and header row.');

  // Upsert only touches the columns above, so indexing status/history of existing orders is preserved.
  const records = Array.from(map.values());
  for (let i = 0; i < records.length; i += CHUNK) {
    const { error } = await db.from('orders').upsert(records.slice(i, i + CHUNK), { onConflict: 'source_id,source_key' });
    if (error) throw new Error(`Database error while saving orders: ${error.message}`);
  }
  return { ok: true, rows: records.length, message: `${records.length} orders imported/updated${skipped ? `, ${skipped} rows skipped` : ''}.` };
}

export async function syncSource(sourceId: string): Promise<SyncResult> {
  const db = createAdminClient();
  const { data, error } = await db.from('sheet_sources').select('*').eq('id', sourceId).maybeSingle();
  if (error || !data) return { ok: false, rows: 0, message: 'Sheet not found.' };
  const src = data as Source;
  const startedAt = new Date().toISOString();
  try {
    const rows = await fetchSheetRows(src.spreadsheet_id, src.tab_name);
    const result = src.kind === 'vendor' ? await syncVendorSheet(db, src, rows, startedAt) : await syncOrdersSheet(db, src, rows);
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
  const { data, error } = await db.from('sheet_sources').select('id,label,kind,active,vendors(active)').eq('active', true).order('last_synced_at', { ascending: true, nullsFirst: true });
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
