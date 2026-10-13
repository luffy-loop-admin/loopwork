import type { SupabaseClient } from '@supabase/supabase-js';

export type SiteHit = {
  id: string; domain: string; site_url: string | null; price: number | null; currency: string | null;
  da: number | null; dr: number | null; traffic: number | null; niche: string | null;
  vendor_id: string; vendor_name: string;
};

export type OrderHit = {
  id: string; domain: string; live_url: string | null; vendor_id: string | null; vendor_name: string | null;
  order_date: string | null; price_paid: number | null; currency: string | null;
  indexed_status: 'pending' | 'indexed' | 'not_indexed'; last_checked_at: string | null;
  pair?: string | null; article_url?: string | null;
};

export type DomainResult = { domain: string; offers: SiteHit[]; orders: OrderHit[] };

const CHUNK = 25;

/** Runs under the caller's session, so Row Level Security decides what they can see. */
export async function searchDomains(supabase: SupabaseClient, domains: string[]): Promise<{ sites: SiteHit[]; orders: OrderHit[] }> {
  const sites: SiteHit[] = [];
  const orders: OrderHit[] = [];
  for (let i = 0; i < domains.length; i += CHUNK) {
    const chunk = domains.slice(i, i + CHUNK);
    const [s, o] = await Promise.all([
      supabase
        .from('vendor_sites')
        .select('id,domain,site_url,price,currency,da,dr,traffic,niche,vendor_id,vendors!inner(name,active)')
        .in('domain', chunk)
        .eq('vendors.active', true)
        .limit(5000),
      supabase
        .from('orders')
        .select('id,domain,live_url,vendor_id,vendor_name,order_date,price_paid,currency,indexed_status,last_checked_at,pair,article_url')
        .in('domain', chunk)
        .order('order_date', { ascending: false, nullsFirst: false })
        .limit(5000),
    ]);
    if (s.error) throw new Error(s.error.message);
    if (o.error) throw new Error(o.error.message);
    for (const r of (s.data ?? []) as any[]) {
      const v = Array.isArray(r.vendors) ? r.vendors[0] : r.vendors;
      sites.push({
        id: r.id, domain: r.domain, site_url: r.site_url, price: r.price === null ? null : Number(r.price), currency: r.currency,
        da: r.da, dr: r.dr, traffic: r.traffic === null ? null : Number(r.traffic), niche: r.niche,
        vendor_id: r.vendor_id, vendor_name: v?.name ?? 'Unknown',
      });
    }
    for (const r of (o.data ?? []) as any[]) {
      orders.push({ ...r, price_paid: r.price_paid === null ? null : Number(r.price_paid) });
    }
  }
  return { sites, orders };
}

/** Group hits per domain; offers sorted cheapest first (no price last). Keeps input order. */
export function buildResults(domains: string[], sites: SiteHit[], orders: OrderHit[]): DomainResult[] {
  const offerMap = new Map<string, SiteHit[]>();
  const orderMap = new Map<string, OrderHit[]>();
  for (const s of sites) offerMap.set(s.domain, [...(offerMap.get(s.domain) ?? []), s]);
  for (const o of orders) orderMap.set(o.domain, [...(orderMap.get(o.domain) ?? []), o]);
  return domains.map((domain) => ({
    domain,
    offers: (offerMap.get(domain) ?? []).sort((a, b) => {
      if (a.price === null && b.price === null) return a.vendor_name.localeCompare(b.vendor_name);
      if (a.price === null) return 1;
      if (b.price === null) return -1;
      return a.price - b.price || a.vendor_name.localeCompare(b.vendor_name);
    }),
    orders: orderMap.get(domain) ?? [],
  }));
}
