import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { writeIndexStatusToSheet } from '@/lib/sheets';

/** "https://www.site.com/post/?a=1#x" -> "site:www.site.com/post/?a=1" */
export function siteQuery(liveUrl: string): string {
  const s = liveUrl.trim().replace(/^[a-z][a-z0-9+.-]*:\/\//i, '').replace(/#.*$/, '').replace(/\/+$/, '');
  return `site:${s}`;
}

/** Uses the Serper.dev API (never scrapes Google). Indexed = at least one organic result. */
export async function serperIndexCheck(liveUrl: string): Promise<{ indexed: boolean; count: number }> {
  const rawKey = process.env.SERPER_API_KEY;
  const key = rawKey?.trim().replace(/^["']|["']$/g, '');
  if (!key || key === 'your_serper_api_key') {
    throw new Error('SERPER_API_KEY is not configured or is using placeholder. Add your API key from serper.dev in Vercel Environment Variables, then redeploy.');
  }
  const res = await fetch('https://google.serper.dev/search', {
    method: 'POST',
    headers: { 'X-API-KEY': key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ q: siteQuery(liveUrl), num: 10 }),
    cache: 'no-store',
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    if (res.status === 403) {
      throw new Error(`Serper error 403: Invalid or unauthorized API key. Make sure the SERPER_API_KEY in Vercel matches your Serper.dev key and your account has credits.`);
    }
    throw new Error(`Serper error ${res.status}: ${text.slice(0, 160)}`);
  }
  const json = (await res.json()) as { organic?: unknown[] };
  const count = Array.isArray(json.organic) ? json.organic.length : 0;
  return { indexed: count > 0, count };
}

export type CheckSummary = {
  checked: number;
  failed: number;
  total: number;
  remaining: number;
  results: { id: string; status?: 'indexed' | 'not_indexed'; error?: string }[];
};

/**
 * Check live links. Oldest-checked first, so repeated runs work through long lists.
 * ids: only these orders. onlyStaleHours: skip orders checked more recently than this.
 */
export async function checkOrders(opts: { ids?: string[]; onlyStaleHours?: number; budgetMs: number; concurrency?: number }): Promise<CheckSummary> {
  const db = createAdminClient();
  let q = db.from('orders').select('id,live_url').not('live_url', 'is', null).neq('order_status', 'cancelled');
  if (opts.ids && opts.ids.length) q = q.in('id', opts.ids);
  if (opts.onlyStaleHours) {
    const cutoff = new Date(Date.now() - opts.onlyStaleHours * 3600 * 1000).toISOString();
    q = q.or(`last_checked_at.is.null,last_checked_at.lt.${cutoff}`);
  }
  const { data, error } = await q.order('last_checked_at', { ascending: true, nullsFirst: true }).limit(2000);
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as { id: string; live_url: string }[];

  const summary: CheckSummary = { checked: 0, failed: 0, total: rows.length, remaining: 0, results: [] };
  if (!rows.length) return summary;
  const checkKey = (process.env.SERPER_API_KEY ?? '').trim().replace(/^["']|["']$/g, '');
  if (!checkKey || checkKey === 'your_serper_api_key') throw new Error('SERPER_API_KEY is not set. Add your Serper API key in Vercel Environment Variables, then redeploy.');

  const deadline = Date.now() + opts.budgetMs;
  let next = 0;

  async function worker() {
    while (Date.now() < deadline) {
      const i = next++;
      if (i >= rows.length) return;
      const row = rows[i];
      try {
        const r = await serperIndexCheck(row.live_url);
        const status = r.indexed ? 'indexed' : 'not_indexed';
        await db
          .from('orders')
          .update({ indexed_status: status, last_checked_at: new Date().toISOString(), index_result_count: r.count, index_error: null })
          .eq('id', row.id);
        summary.checked++;
        summary.results.push({ id: row.id, status });
      } catch (e) {
        const message = e instanceof Error ? e.message : 'Check failed';
        await db.from('orders').update({ index_error: message.slice(0, 300) }).eq('id', row.id);
        summary.failed++;
        summary.results.push({ id: row.id, error: message });
      }
    }
  }

  await Promise.all(Array.from({ length: opts.concurrency ?? 5 }, () => worker()));
  summary.remaining = Math.max(0, rows.length - summary.checked - summary.failed);

  // Trigger Google Sheet write-back if enabled for checked orders
  if (summary.checked > 0) {
    try {
      await triggerWritebackForOrders(summary.results);
    } catch (err) {
      console.error('Sheet write-back error:', err);
    }
  }

  return summary;
}

/**
 * For orders whose sheet has write_status_back enabled, writes the Serper verification back to the sheet.
 */
export async function triggerWritebackForOrders(
  results: { id: string; status?: 'indexed' | 'not_indexed'; error?: string }[]
): Promise<void> {
  const valid = results.filter((r) => r.status === 'indexed' || r.status === 'not_indexed');
  if (!valid.length) return;

  const db = createAdminClient();
  const orderIds = valid.map((r) => r.id);

  const { data: ordersData } = await db
    .from('orders')
    .select('id,source_id,source_tab,live_url,indexed_status')
    .in('id', orderIds)
    .not('source_id', 'is', null);

  if (!ordersData || !ordersData.length) return;

  const bySource = new Map<string, typeof ordersData>();
  for (const o of ordersData) {
    if (!o.source_id) continue;
    const list = bySource.get(o.source_id) ?? [];
    list.push(o);
    bySource.set(o.source_id, list);
  }

  const sourceIds = Array.from(bySource.keys());
  const { data: sourcesData } = await db
    .from('sheet_sources')
    .select('id,spreadsheet_id,header_row,mapping,write_status_back')
    .in('id', sourceIds);

  if (!sourcesData || !sourcesData.length) return;

  for (const src of sourcesData) {
    if (!src.write_status_back) continue;
    const mapping = (src.mapping || {}) as Record<string, string>;
    if (!mapping.status || !mapping.live_url) continue;

    const sourceOrders = bySource.get(src.id) ?? [];
    const items = sourceOrders
      .filter((o) => o.source_tab && o.live_url && (o.indexed_status === 'indexed' || o.indexed_status === 'not_indexed'))
      .map((o) => ({
        source_tab: o.source_tab as string,
        live_url: o.live_url as string,
        status: o.indexed_status as 'indexed' | 'not_indexed',
      }));

    if (!items.length) continue;

    const res = await writeIndexStatusToSheet(src.spreadsheet_id, src.header_row, mapping, items);
    const now = new Date().toISOString();
    if (res.ok) {
      await db.from('sheet_sources').update({ last_writeback_at: now, last_writeback_error: null }).eq('id', src.id);
    } else {
      await db.from('sheet_sources').update({ last_writeback_at: now, last_writeback_error: res.error || 'Write-back failed' }).eq('id', src.id);
    }
  }
}
