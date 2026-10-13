import Link from 'next/link';
import { requireProfile } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { normalizeDomain } from '@/lib/domain';
import { buildResults, searchDomains } from '@/lib/search';
import { fmtDate, money, num } from '@/lib/format';
import SearchBox from '@/components/SearchBox';
import StatusBadge from '@/components/StatusBadge';

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q = '' } = await searchParams;
  const profile = await requireProfile();
  const isAdmin = profile.role === 'admin';
  const query = q.trim();
  const domain = query ? normalizeDomain(query) : null;
  const multiple = query.split(/[\s,;]+/).filter(Boolean).length > 1;

  let result: Awaited<ReturnType<typeof buildResults>>[number] | null = null;
  if (domain && !multiple) {
    const supabase = await createClient();
    const { sites, orders } = await searchDomains(supabase, [domain]);
    result = buildResults([domain], sites, orders)[0];
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="mb-3 text-xl font-semibold">Search a website</h1>
        <SearchBox defaultValue={query} />
        <p className="mt-2 text-sm text-muted">
          Have a list? <Link className="link" href="/search/bulk">Use bulk search</Link>.
        </p>
      </div>

      {query && multiple && (
        <p className="rounded-md bg-warn-soft p-3 text-sm text-warn">
          That looks like several websites. <Link className="link" href="/search/bulk">Paste them into bulk search</Link> to check them all.
        </p>
      )}
      {query && !multiple && !domain && (
        <p role="alert" className="rounded-md bg-warn-soft p-3 text-sm text-warn">
          “{query}” does not look like a website. Try something like example.com.
        </p>
      )}

      {result && result.offers.length === 0 && result.orders.length === 0 && (
        <div className="card p-6">
          <p className="text-lg font-semibold">Not available</p>
          <p className="mt-1 text-sm text-muted">{result.domain} is not listed by any vendor and you have no link on it.</p>
        </div>
      )}

      {result && (result.offers.length > 0 || result.orders.length > 0) && (
        <>
          <section aria-labelledby="avail">
            <h2 id="avail" className="mb-2 text-lg font-semibold">Available from</h2>
            {result.offers.length === 0 ? (
              <p className="card p-4 text-sm text-muted">Not available from any vendor.</p>
            ) : (
              <div className="card overflow-x-auto">
                <table className="w-full min-w-[640px] border-collapse">
                  <thead>
                    <tr>
                      <th className="th">Vendor</th>
                      <th className="th">Price</th>
                      <th className="th">DA</th>
                      <th className="th">DR</th>
                      <th className="th">Traffic</th>
                      <th className="th">Niche</th>
                      {isAdmin && <th className="th">Order</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {result.offers.map((o, i) => (
                      <tr key={o.id} className={i === 0 && o.price !== null ? 'bg-accent-soft/50' : ''}>
                        <td className="td font-medium">
                          {o.vendor_name}
                          {i === 0 && o.price !== null && result!.offers.length > 1 && <span className="badge ml-2 bg-accent text-white">Cheapest</span>}
                        </td>
                        <td className="td font-semibold">{money(o.price, o.currency)}</td>
                        <td className="td">{o.da ?? '-'}</td>
                        <td className="td">{o.dr ?? '-'}</td>
                        <td className="td">{num(o.traffic)}</td>
                        <td className="td">{o.niche ?? '-'}</td>
                        {isAdmin && (
                          <td className="td">
                            <Link
                              className="btn btn-primary btn-sm no-underline"
                              href={`/admin/orders/new?${new URLSearchParams({ domain: o.domain, vendor: o.vendor_id, ...(o.price !== null ? { price: String(o.price) } : {}), currency: o.currency ?? 'PKR' }).toString()}`}
                            >
                              Assign order
                            </Link>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section aria-labelledby="bought">
            <h2 id="bought" className="mb-2 text-lg font-semibold">Already bought</h2>
            {result.orders.length === 0 ? (
              <p className="card p-4 text-sm text-muted">No link bought on this site yet.</p>
            ) : (
              <div className="space-y-3">
                {result.orders.map((o) => (
                  <div key={o.id} className="card p-4">
                    <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
                      <div><dt className="text-muted">Date</dt><dd className="font-medium">{fmtDate(o.order_date)}</dd></div>
                      <div><dt className="text-muted">Vendor</dt><dd className="font-medium">{o.vendor_name ?? '-'}</dd></div>
                      <div><dt className="text-muted">Price paid</dt><dd className="font-medium">{money(o.price_paid, o.currency)}</dd></div>
                      <div className="sm:col-span-3">
                        <dt className="text-muted">Live link</dt>
                        <dd className="break-all">
                          {o.live_url ? <a className="link" href={o.live_url} target="_blank" rel="noopener noreferrer nofollow">{o.live_url}</a> : <span className="text-muted">No live link yet</span>}
                        </dd>
                      </div>
                      {isAdmin && (
                        <div>
                          <dt className="mb-1 text-muted">Google index</dt>
                          <dd><StatusBadge status={o.indexed_status} hasLink={!!o.live_url} /></dd>
                        </div>
                      )}
                    </dl>
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
