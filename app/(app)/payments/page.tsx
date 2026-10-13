import { redirect } from 'next/navigation';
import { requireProfile } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { fmtDate, money } from '@/lib/format';
import Pager from '@/components/Pager';

const PAGE_SIZE = 50;

function fmtTime(t: string | null): string {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
}

// What the vendor sees: payments made to THEM only (enforced by Row Level Security).
export default async function VendorPaymentsPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const profile = await requireProfile();
  if (profile.role === 'admin') redirect('/admin/payments');
  const page = Math.max(1, Number((await searchParams).page) || 1);
  const supabase = await createClient();
  const [{ data, count }, balRes] = await Promise.all([
    supabase
      .from('payments')
      .select('id,amount,currency,paid_date,paid_time,method,reference,notes', { count: 'exact' })
      .order('paid_date', { ascending: false })
      .order('paid_time', { ascending: false, nullsFirst: false })
      .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1),
    supabase.from('vendor_balance').select('currency,ordered_total,paid_total,balance'),
  ]);
  const rows = (data ?? []) as any[];
  const bal = (balRes.data ?? []) as any[];

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Payments</h1>
      {bal.length > 0 && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {bal.map((b) => (
            <div key={b.currency} className="contents">
              <div className="card p-4"><div className="text-sm text-muted">Ordered</div><div className="text-xl font-semibold">{money(b.ordered_total, b.currency)}</div></div>
              <div className="card p-4"><div className="text-sm text-muted">Paid to you</div><div className="text-xl font-semibold">{money(b.paid_total, b.currency)}</div></div>
              <div className="card p-4"><div className="text-sm text-muted">Balance due</div><div className="text-xl font-semibold">{money(b.balance, b.currency)}</div></div>
            </div>
          ))}
        </div>
      )}
      <div className="card overflow-x-auto">
        <table className="w-full min-w-[560px] border-collapse">
          <thead>
            <tr>
              <th className="th">Date & time</th>
              <th className="th">Amount</th>
              <th className="th">Method</th>
              <th className="th">Reference</th>
              <th className="th">Notes</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => (
              <tr key={p.id}>
                <td className="td whitespace-nowrap">{fmtDate(p.paid_date)}{p.paid_time && <div className="text-xs text-muted">{fmtTime(p.paid_time)}</div>}</td>
                <td className="td font-semibold">{money(p.amount, p.currency)}</td>
                <td className="td">{p.method ?? '-'}</td>
                <td className="td break-all">{p.reference ?? '-'}</td>
                <td className="td">{p.notes ?? '-'}</td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td className="td text-muted" colSpan={5}>No payments yet.</td></tr>}
          </tbody>
        </table>
      </div>
      <Pager basePath="/payments" params={{}} page={page} pageSize={PAGE_SIZE} total={count ?? 0} />
    </div>
  );
}
