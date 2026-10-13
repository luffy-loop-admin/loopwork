import { requireProfile } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { fmtDate, money } from '@/lib/format';
import Pager from '@/components/Pager';
import { redirect } from 'next/navigation';

const PAGE_SIZE = 50;
const BADGE: Record<string, string> = { ordered: 'bg-warn-soft text-warn', live: 'bg-good-soft text-good', cancelled: 'bg-paper text-muted border border-line' };
const LABEL: Record<string, string> = { ordered: 'Waiting for link', live: 'Live', cancelled: 'Cancelled' };

// What the vendor sees: orders placed with THEM only (enforced by Row Level Security).
export default async function VendorOrdersPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const profile = await requireProfile();
  if (profile.role === 'admin') redirect('/admin/orders');
  const page = Math.max(1, Number((await searchParams).page) || 1);
  const supabase = await createClient();
  const { data, count } = await supabase
    .from('orders')
    .select('id,domain,live_url,order_date,price_paid,currency,order_status,notes', { count: 'exact' })
    .order('order_date', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  const rows = (data ?? []) as any[];

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Orders</h1>
      <p className="text-sm text-muted">Orders we have placed with you. “Waiting for link” means we are waiting for the live URL.</p>
      <div className="card overflow-x-auto">
        <table className="w-full min-w-[640px] border-collapse">
          <thead>
            <tr>
              <th className="th">Website</th>
              <th className="th">Date</th>
              <th className="th">Price</th>
              <th className="th">Status</th>
              <th className="th">Live link</th>
              <th className="th">Notes</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((o) => (
              <tr key={o.id}>
                <td className="td font-medium">{o.domain}</td>
                <td className="td">{fmtDate(o.order_date)}</td>
                <td className="td">{money(o.price_paid, o.currency)}</td>
                <td className="td"><span className={`badge ${BADGE[o.order_status] ?? BADGE.ordered}`}>{LABEL[o.order_status] ?? o.order_status}</span></td>
                <td className="td max-w-[16rem] break-all">{o.live_url ? <a className="link" href={o.live_url} target="_blank" rel="noopener noreferrer nofollow">{o.live_url}</a> : '-'}</td>
                <td className="td">{o.notes ?? '-'}</td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td className="td text-muted" colSpan={6}>No orders yet.</td></tr>}
          </tbody>
        </table>
      </div>
      <Pager basePath="/orders" params={{}} page={page} pageSize={PAGE_SIZE} total={count ?? 0} />
    </div>
  );
}
