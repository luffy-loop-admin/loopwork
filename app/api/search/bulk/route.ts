import { NextResponse } from 'next/server';
import { getSessionProfile } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { parseDomainList } from '@/lib/domain';
import { buildResults, searchDomains } from '@/lib/search';

export const dynamic = 'force-dynamic';
const MAX = 1000;

export async function POST(req: Request) {
  if (!(await getSessionProfile())) return NextResponse.json({ error: 'Please sign in again.' }, { status: 401 });
  let text = '';
  try {
    text = String((await req.json())?.text ?? '');
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }
  const parsed = parseDomainList(text);
  const truncated = parsed.domains.length > MAX;
  const domains = parsed.domains.slice(0, MAX);
  if (!domains.length) return NextResponse.json({ error: 'No valid websites found in what you pasted.', invalid: parsed.invalid.slice(0, 20) }, { status: 400 });

  try {
    const supabase = await createClient();
    const { sites, orders } = await searchDomains(supabase, domains);
    const rows = buildResults(domains, sites, orders).map((r) => {
      const best = r.offers[0];
      const last = r.orders[0];
      return {
        domain: r.domain,
        available: r.offers.length > 0,
        offers_count: r.offers.length,
        best_price: best?.price ?? null,
        best_currency: best?.currency ?? null,
        best_vendor: best?.vendor_name ?? null,
        all_offers: r.offers.map((o) => `${o.vendor_name}: ${o.price === null ? 'n/a' : `${o.price} ${o.currency ?? ''}`.trim()}`).join('; '),
        bought: r.orders.length > 0,
        bought_count: r.orders.length,
        bought_date: last?.order_date ?? null,
        bought_vendor: last?.vendor_name ?? null,
        bought_price: last?.price_paid ?? null,
        bought_currency: last?.currency ?? null,
        live_url: last?.live_url ?? null,
      };
    });
    return NextResponse.json({ rows, invalid: parsed.invalid.slice(0, 50), truncated });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Search failed.' }, { status: 500 });
  }
}
