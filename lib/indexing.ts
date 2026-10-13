import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';

/** "https://www.site.com/post/?a=1#x" -> "site:www.site.com/post/?a=1" */
export function siteQuery(liveUrl: string): string {
  const s = liveUrl.trim().replace(/^[a-z][a-z0-9+.-]*:\/\//i, '').replace(/#.*$/, '').replace(/\/+$/, '');
  return `site:${s}`;
}

/** Uses the Serper.dev API (never scrapes Google). Indexed = at least one organic result. */
export async function serperIndexCheck(liveUrl: string): Promise<{ indexed: boolean; count: number }> {
  const key = process.env.SERPER_API_KEY;
  if (!key) throw new Error('SERPER_API_KEY is not set.');
  const res = await fetch('https://google.serper.dev/search', {
    method: 'POST',
    headers: { 'X-API-KEY': key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ q: siteQuery(liveUrl), num: 10 }),
    cache: 'no-store',
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
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
  if (!process.env.SERPER_API_KEY) throw new Error('SERPER_API_KEY is not set. Add it in your environment variables.');

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
  return summary;
}
