import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { fmtDate, fmtDateTime, money } from '@/lib/format';
import ActionForm from '@/components/ActionForm';
import ActionButton from '@/components/ActionButton';
import OrderFields from '@/components/OrderFields';
import Pager from '@/components/Pager';
import StatusBadge from '@/components/StatusBadge';
import { checkAllAction, checkOrderAction, saveOrder } from '@/app/actions/orders';

export const maxDuration = 300;
const PAGE_SIZE = 50;
const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'not_indexed', label: 'Not indexed' },
  { key: 'pending', label: 'Pending' },
  { key: 'indexed', label: 'Indexed' },
] as const;

export default async function OrdersPage({ searchParams }: { searchParams: Promise<{ status?: string; q?: string; page?: string }> }) {
  const sp = await searchParams;
  const status = FILTERS.some((f) => f.key === sp.status) ? (sp.status as string) : 'all';
  const page = Math.max(1, Number(sp.page) || 1);
  const q = (sp.q ?? '').toLowerCase().replace(/[%_,()*\\]/g, '').trim();
  const supabase = await createClient();

  let query = supabase
    .from('orders')
    .select('id,domain,live_url,vendor_id,vendor_name,order_date,price_paid,currency,notes,indexed_status,last_checked_at,index_error', { count: 'exact' })
    .order('order_date', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  if (status !== 'all') query = query.eq('indexed_status', status).not('live_url', 'is', null);
  if (q) query = query.or(`domain.ilike.%${q}%,vendor_name.ilike.%${q}%`);

  const countFor = async (s: string) => {
    let c = supabase.from('orders').select('id', { count: 'exact', head: true });
    if (s !== 'all') c = c.eq('indexed_status', s).not('live_url', 'is', null);
    return (await c).count ?? 0;
  };

  const [{ data, count }, vendorsRes, cAll, cNot, cPending, cIdx] = await Promise.all([
    query,
    supabase.from('vendors').select('id,name').order('name'),
    countFor('all'), countFor('not_indexed'), countFor('pending'), countFor('indexed'),
  ]);
  const counts: Record<string, number> = { all: cAll, not_indexed: cNot, pending: cPending, indexed: cIdx };
  const rows = (data ?? []) as any[];
  const vendors = (vendorsRes.data ?? []) as { id: string; name: string }[];
  const href = (s: string) => `/admin/orders?${new URLSearchParams({ ...(s !== 'all' ? { status: s } : {}), ...(q ? { q } : {}) }).toString()}`;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">Orders & indexing</h1>
        <ActionButton action={checkAllAction} label="Check all now" pendingLabel="Checking… (up to a minute)" className="btn btn-primary" />
      </div>

      <details className="card p-4 sm:p-5">
        <summary className="cursor-pointer font-semibold">Add an order</summary>
        <ActionForm action={saveOrder} submitLabel="Add order" resetOnSuccess className="mt-4">
          <OrderFields vendors={vendors} />
        </ActionForm>
        <p className="mt-3 text-xs text-muted">Tip: link your order history sheet under Sheets to import orders automatically.</p>
      </details>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-2" role="tablist" aria-label="Filter by index status">
          {FILTERS.map((f) => (
            <Link key={f.key} href={href(f.key)} role="tab" aria-selected={status === f.key} className={`btn btn-sm no-underline ${status === f.key ? 'btn-primary' : 'btn-ghost'}`}>
              {f.label} ({counts[f.key]})
            </Link>
          ))}
        </div>
        <form method="get" className="flex gap-2">
          {status !== 'all' && <input type="hidden" name="status" value={status} />}
          <input name="q" defaultValue={sp.q ?? ''} placeholder="Search site or vendor" className="input" aria-label="Search orders" />
          <button className="btn btn-ghost" type="submit">Search</button>
        </form>
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full min-w-[980px] border-collapse">
          <thead>
            <tr>
              <th className="th">Site</th>
              <th className="th">Vendor</th>
              <th className="th">Date</th>
              <th className="th">Paid</th>
              <th className="th">Live link</th>
              <th className="th">Index status</th>
              <th className="th">Last checked</th>
              <th className="th">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((o) => (
              <tr key={o.id}>
                <td className="td font-medium">{o.domain}</td>
                <td className="td">{o.vendor_name ?? '-'}</td>
                <td className="td">{fmtDate(o.order_date)}</td>
                <td className="td">{money(o.price_paid, o.currency)}</td>
                <td className="td max-w-[16rem] break-all">
                  {o.live_url ? <a className="link" href={o.live_url} target="_blank" rel="noopener noreferrer nofollow">{o.live_url}</a> : <span className="text-muted">-</span>}
                </td>
                <td className="td"><StatusBadge status={o.indexed_status} hasLink={!!o.live_url} error={o.index_error} /></td>
                <td className="td text-muted">{o.last_checked_at ? fmtDateTime(o.last_checked_at) : '-'}</td>
                <td className="td">
                  <div className="flex flex-wrap items-start gap-2">
                    {o.live_url && <ActionButton action={checkOrderAction.bind(null, o.id)} label="Check now" />}
                    <Link href={`/admin/orders/${o.id}`} className="btn btn-ghost btn-sm no-underline">Edit</Link>
                  </div>
                </td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td className="td text-muted" colSpan={8}>{status === 'not_indexed' ? 'Every checked link is indexed.' : 'No orders found.'}</td></tr>}
          </tbody>
        </table>
      </div>
      <Pager basePath="/admin/orders" params={{ status: status === 'all' ? undefined : status, q: sp.q }} page={page} pageSize={PAGE_SIZE} total={count ?? 0} />
    </div>
  );
}
