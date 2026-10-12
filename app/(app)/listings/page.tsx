import Link from 'next/link';
import { requireProfile } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { money, num } from '@/lib/format';
import Pager from '@/components/Pager';

const PAGE_SIZE = 50;

export default async function ListingsPage({ searchParams }: { searchParams: Promise<{ q?: string; vendor?: string; page?: string }> }) {
  const sp = await searchParams;
  const profile = await requireProfile();
  const isAdmin = profile.role === 'admin';
  const page = Math.max(1, Number(sp.page) || 1);
  const q = (sp.q ?? '').toLowerCase().replace(/[%_,()*\\]/g, '').trim();
  const vendorFilter = isAdmin ? sp.vendor ?? '' : '';
  const supabase = await createClient();

  let query = supabase
    .from('vendor_sites')
    .select('id,domain,price,currency,da,dr,traffic,niche,vendors(name)', { count: 'exact' })
    .order('price', { ascending: true, nullsFirst: false })
    .order('domain', { ascending: true })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  if (q) query = query.ilike('domain', `%${q}%`);
  if (vendorFilter) query = query.eq('vendor_id', vendorFilter);

  const [{ data, count }, vendorsRes] = await Promise.all([
    query,
    isAdmin ? supabase.from('vendors').select('id,name').order('name') : Promise.resolve({ data: [] as any[] }),
  ]);
  const rows = (data ?? []) as any[];
  const vendors = (vendorsRes.data ?? []) as { id: string; name: string }[];

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">{isAdmin ? 'All listings' : 'My listings'}</h1>
      <form method="get" className="flex flex-col gap-2 sm:flex-row">
        <input name="q" defaultValue={sp.q ?? ''} placeholder="Filter by website" className="input" aria-label="Filter by website" />
        {isAdmin && (
          <select name="vendor" defaultValue={vendorFilter} className="input sm:max-w-[14rem]" aria-label="Vendor">
            <option value="">All vendors</option>
            {vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
          </select>
        )}
        <button className="btn btn-primary" type="submit">Filter</button>
        {(q || vendorFilter) && <Link href="/listings" className="btn btn-ghost no-underline">Clear</Link>}
      </form>

      <div className="card overflow-x-auto">
        <table className="w-full min-w-[640px] border-collapse">
          <thead>
            <tr>
              <th className="th">Website</th>
              {isAdmin && <th className="th">Vendor</th>}
              <th className="th">Price</th>
              <th className="th">DA</th>
              <th className="th">DR</th>
              <th className="th">Traffic</th>
              <th className="th">Niche</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const v = Array.isArray(r.vendors) ? r.vendors[0] : r.vendors;
              return (
                <tr key={r.id}>
                  <td className="td font-medium"><Link className="link" href={`/search?q=${encodeURIComponent(r.domain)}`}>{r.domain}</Link></td>
                  {isAdmin && <td className="td">{v?.name ?? '-'}</td>}
                  <td className="td">{money(r.price, r.currency)}</td>
                  <td className="td">{r.da ?? '-'}</td>
                  <td className="td">{r.dr ?? '-'}</td>
                  <td className="td">{num(r.traffic)}</td>
                  <td className="td">{r.niche ?? '-'}</td>
                </tr>
              );
            })}
            {rows.length === 0 && <tr><td className="td text-muted" colSpan={isAdmin ? 7 : 6}>No sites found.</td></tr>}
          </tbody>
        </table>
      </div>
      <Pager basePath="/listings" params={{ q: sp.q, vendor: vendorFilter }} page={page} pageSize={PAGE_SIZE} total={count ?? 0} />
    </div>
  );
}
