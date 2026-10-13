import Link from 'next/link';
import { requireProfile } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { fmtDateTime, money, num } from '@/lib/format';
import SearchBox from '@/components/SearchBox';
import ActionButton from '@/components/ActionButton';
import InstallPrompt from '@/components/InstallPrompt';
import { syncAllAction } from '@/app/actions/sheets';

export const maxDuration = 300;

function Tile({ label, value, href, tone }: { label: string; value: string | number; href?: string; tone?: 'bad' }) {
  const inner = (
    <div className="card h-full p-4">
      <div className={`text-2xl font-semibold ${tone === 'bad' ? 'text-bad' : ''}`}>{value}</div>
      <div className="mt-1 text-sm text-muted">{label}</div>
    </div>
  );
  return href ? <Link href={href} className="no-underline hover:opacity-90">{inner}</Link> : inner;
}

async function count(q: PromiseLike<{ count: number | null }>): Promise<number> {
  const r = await q;
  return r.count ?? 0;
}

export default async function Dashboard() {
  const profile = await requireProfile();
  const supabase = await createClient();
  const isAdmin = profile.role === 'admin';

  const [sites, orders, spendRes, sourcesRes, vendorsRes] = await Promise.all([
    count(supabase.from('vendor_sites').select('id', { count: 'exact', head: true })),
    count(supabase.from('orders').select('id', { count: 'exact', head: true })),
    supabase.from('vendor_balance').select('vendor_name,currency,orders_count,ordered_total,paid_total,balance').order('vendor_name'),
    supabase.from('sheet_sources').select('id,kind,label,last_synced_at,last_sync_status,last_sync_message,vendors(name)').order('created_at'),
    supabase.from('vendors').select('id,name').eq('active', true).order('name'),
  ]);
  const spendData = (spendRes.data ?? []) as { vendor_name: string; currency: string; orders_count: number; ordered_total: number; paid_total: number; balance: number }[];
  const spendMap = new Map<string, typeof spendData[0]>();
  for (const s of spendData) spendMap.set(s.vendor_name.toLowerCase(), s);
  const allVendorsList = (vendorsRes.data ?? []) as { id: string; name: string }[];
  const spend = allVendorsList.length
    ? allVendorsList.map((v) => spendMap.get(v.name.toLowerCase()) ?? { vendor_name: v.name, currency: 'PKR', orders_count: 0, ordered_total: 0, paid_total: 0, balance: 0 })
    : spendData;
  const sources = (sourcesRes.data ?? []) as any[];

  let vendorsActive = 0, notIndexed = 0, pending = 0;
  if (isAdmin) {
    [vendorsActive, notIndexed, pending] = await Promise.all([
      count(supabase.from('vendors').select('id', { count: 'exact', head: true }).eq('active', true)),
      count(supabase.from('orders').select('id', { count: 'exact', head: true }).eq('indexed_status', 'not_indexed').not('live_url', 'is', null)),
      count(supabase.from('orders').select('id', { count: 'exact', head: true }).eq('indexed_status', 'pending').not('live_url', 'is', null)),
    ]);
  }

  return (
    <div className="space-y-8">
      <section>
        <h1 className="mb-3 text-xl font-semibold">{isAdmin ? 'Which site do you need?' : `Welcome, ${profile.vendor_name}`}</h1>
        <SearchBox />
        <p className="mt-2 text-sm text-muted">
          Or <Link className="link" href="/search/bulk">search many sites at once</Link>.
        </p>
      </section>

      <section>
        <InstallPrompt variant="card" />
      </section>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {isAdmin ? (
          <>
            <Tile label="Active vendors" value={vendorsActive} href="/admin/vendors" />
            <Tile label="Sites listed" value={num(sites)} href="/listings" />
            <Tile label="Links bought" value={num(orders)} href="/admin/orders" />
            <Tile label="Not indexed" value={num(notIndexed)} href="/admin/orders?status=not_indexed" tone={notIndexed ? 'bad' : undefined} />
            {pending > 0 && <Tile label="Waiting for first index check" value={num(pending)} href="/admin/orders?status=pending" />}
          </>
        ) : (
          <>
            <Tile label="Your sites listed" value={num(sites)} href="/listings" />
            <Tile label="Orders from us" value={num(orders)} />
          </>
        )}
      </section>

      <section>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-semibold">{isAdmin ? 'Spent, paid and balance per vendor' : 'Your account with us'}</h2>
        </div>
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[560px] border-collapse">
            <thead>
              <tr>
                <th className="th">Vendor</th>
                <th className="th">Orders</th>
                <th className="th">Ordered</th>
                <th className="th">Paid</th>
                <th className="th">Balance due</th>
              </tr>
            </thead>
            <tbody>
              {spend.map((s, i) => (
                <tr key={`${s.vendor_name}-${s.currency}-${i}`}>
                  <td className="td font-medium">{s.vendor_name}</td>
                  <td className="td">{s.orders_count}</td>
                  <td className="td">{money(s.ordered_total, s.currency)}</td>
                  <td className="td">{money(s.paid_total, s.currency)}</td>
                  <td className={`td font-semibold ${Number(s.balance) > 0 ? 'text-warn' : 'text-good'}`}>{money(s.balance, s.currency)}</td>
                </tr>
              ))}
              {spend.length === 0 && (
                <tr><td className="td text-muted" colSpan={5}>No orders yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-semibold">Sheets</h2>
          {isAdmin && <ActionButton action={syncAllAction} label="Sync all now" className="btn btn-primary btn-sm" />}
        </div>
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[560px] border-collapse">
            <thead>
              <tr>
                <th className="th">Sheet</th>
                <th className="th">Last sync</th>
                <th className="th">Result</th>
              </tr>
            </thead>
            <tbody>
              {sources.map((s) => {
                const vendor = Array.isArray(s.vendors) ? s.vendors[0] : s.vendors;
                return (
                  <tr key={s.id}>
                    <td className="td font-medium">{s.kind === 'orders' ? s.label || 'Order history' : s.kind === 'payments' ? s.label || 'Payments' : vendor?.name ?? s.label ?? 'Sheet'}</td>
                    <td className="td">{fmtDateTime(s.last_synced_at)}</td>
                    <td className="td">
                      {s.last_sync_status === 'error' ? <span className="text-bad">{s.last_sync_message}</span> : <span className="text-muted">{s.last_sync_message ?? 'Not synced yet'}</span>}
                    </td>
                  </tr>
                );
              })}
              {sources.length === 0 && (
                <tr><td className="td text-muted" colSpan={3}>{isAdmin ? <>No sheets yet. <Link className="link" href="/admin/sheets">Add one</Link>.</> : 'No sheet linked yet.'}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
