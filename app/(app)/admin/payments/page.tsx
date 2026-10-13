import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { fmtDate, money } from '@/lib/format';
import ActionForm from '@/components/ActionForm';
import ActionButton from '@/components/ActionButton';
import Pager from '@/components/Pager';
import { deletePayment, savePayment } from '@/app/actions/payments';

const PAGE_SIZE = 50;

function fmtTime(t: string | null): string {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  const ap = h >= 12 ? 'PM' : 'AM';
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${ap}`;
}

export default async function PaymentsPage({ searchParams }: { searchParams: Promise<{ vendor?: string; page?: string }> }) {
  const sp = await searchParams;
  const vendorFilter = sp.vendor ?? '';
  const page = Math.max(1, Number(sp.page) || 1);
  const supabase = await createClient();

  let query = supabase
    .from('payments')
    .select('id,vendor_id,vendor_name,amount,currency,paid_date,paid_time,method,reference,notes,source_id', { count: 'exact' })
    .order('paid_date', { ascending: false })
    .order('paid_time', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  if (vendorFilter) query = query.eq('vendor_id', vendorFilter);

  const [{ data, count }, vendorsRes, balRes] = await Promise.all([
    query,
    supabase.from('vendors').select('id,name').order('name'),
    supabase.from('vendor_balance').select('vendor_name,currency,orders_count,payments_count,ordered_total,paid_total,balance').order('vendor_name'),
  ]);
  const rows = (data ?? []) as any[];
  const vendors = (vendorsRes.data ?? []) as { id: string; name: string }[];
  const balMap = new Map<string, any>();
  for (const b of (balRes.data ?? []) as any[]) balMap.set(b.vendor_name.toLowerCase(), b);
  const balances = vendors.map((v) => {
    const hit = balMap.get(v.name.toLowerCase());
    return hit ?? { vendor_name: v.name, currency: 'PKR', orders_count: 0, payments_count: 0, ordered_total: 0, paid_total: 0, balance: 0 };
  });
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">Payments</h1>
        <Link href="/admin/sheets/new?kind=payments" className="btn btn-ghost no-underline">Import from a payments sheet</Link>
      </div>

      <details className="card p-4 sm:p-5" open>
        <summary className="cursor-pointer font-semibold">Record a payment</summary>
        <ActionForm action={savePayment} submitLabel="Save payment" resetOnSuccess className="mt-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <label className="label" htmlFor="pv">Vendor paid</label>
              <select id="pv" name="vendor_id" required defaultValue={vendorFilter} className="input">
                <option value="" disabled>Choose a vendor…</option>
                {vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-[1fr_5rem] gap-3">
              <div>
                <label className="label" htmlFor="pa">Amount (PKR)</label>
                <input id="pa" name="amount" required inputMode="decimal" className="input" />
              </div>
              <div>
                <label className="label" htmlFor="pc">Currency</label>
                <input id="pc" name="currency" maxLength={3} defaultValue="PKR" className="input" />
              </div>
            </div>
            <div>
              <label className="label" htmlFor="pm">Payment method</label>
              <input id="pm" name="method" list="methods" className="input" placeholder="Bank transfer, JazzCash…" />
              <datalist id="methods">
                <option value="Bank transfer" /><option value="JazzCash" /><option value="Easypaisa" /><option value="Cash" />
                <option value="PayPal" /><option value="Payoneer" /><option value="Wise" /><option value="Other" />
              </datalist>
            </div>
            <div>
              <label className="label" htmlFor="pd">Date paid</label>
              <input id="pd" name="paid_date" type="date" required defaultValue={today} className="input" />
            </div>
            <div>
              <label className="label" htmlFor="pt">Time paid</label>
              <input id="pt" name="paid_time" type="time" className="input" />
            </div>
            <div>
              <label className="label" htmlFor="pr">Reference / transaction ID</label>
              <input id="pr" name="reference" className="input" />
            </div>
            <div className="sm:col-span-2 lg:col-span-3">
              <label className="label" htmlFor="pn">Notes</label>
              <input id="pn" name="notes" className="input" placeholder="e.g. paid for March orders" />
            </div>
          </div>
        </ActionForm>
      </details>

      <section>
        <h2 className="mb-2 font-semibold">Balance per vendor</h2>
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[620px] border-collapse">
            <thead>
              <tr>
                <th className="th">Vendor</th>
                <th className="th">Orders</th>
                <th className="th">Ordered</th>
                <th className="th">Payments</th>
                <th className="th">Paid</th>
                <th className="th">Balance due</th>
              </tr>
            </thead>
            <tbody>
              {balances.map((b, i) => (
                <tr key={`${b.vendor_name}-${b.currency}-${i}`}>
                  <td className="td font-medium">{b.vendor_name}</td>
                  <td className="td">{b.orders_count}</td>
                  <td className="td">{money(b.ordered_total, b.currency)}</td>
                  <td className="td">{b.payments_count}</td>
                  <td className="td">{money(b.paid_total, b.currency)}</td>
                  <td className={`td font-semibold ${Number(b.balance) > 0 ? 'text-warn' : 'text-good'}`}>{money(b.balance, b.currency)}</td>
                </tr>
              ))}
              {balances.length === 0 && <tr><td className="td text-muted" colSpan={6}>No orders or payments yet.</td></tr>}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-muted">Balance due = ordered (cancelled orders excluded) minus paid. A negative number means you have paid in advance.</p>
      </section>

      <section>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-semibold">Payment history</h2>
          <form method="get" className="flex gap-2">
            <select name="vendor" defaultValue={vendorFilter} className="input sm:max-w-[14rem]" aria-label="Vendor">
              <option value="">All vendors</option>
              {vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
            </select>
            <button className="btn btn-ghost" type="submit">Filter</button>
          </form>
        </div>
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[820px] border-collapse">
            <thead>
              <tr>
                <th className="th">Date & time</th>
                <th className="th">Vendor</th>
                <th className="th">Amount</th>
                <th className="th">Method</th>
                <th className="th">Reference</th>
                <th className="th">Notes</th>
                <th className="th">Source</th>
                <th className="th"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.id}>
                  <td className="td whitespace-nowrap">{fmtDate(p.paid_date)}{p.paid_time && <div className="text-xs text-muted">{fmtTime(p.paid_time)}</div>}</td>
                  <td className="td font-medium">{p.vendor_name ?? '-'}</td>
                  <td className="td font-semibold">{money(p.amount, p.currency)}</td>
                  <td className="td">{p.method ?? '-'}</td>
                  <td className="td break-all">{p.reference ?? '-'}</td>
                  <td className="td">{p.notes ?? '-'}</td>
                  <td className="td text-muted">{p.source_id ? 'Sheet' : 'Manual'}</td>
                  <td className="td">
                    <ActionButton
                      action={deletePayment.bind(null, p.id)}
                      label="Delete"
                      className="btn btn-danger btn-sm"
                      confirm={p.source_id ? 'Delete this payment? It will come back at the next sync unless you also remove the row from the sheet.' : 'Delete this payment?'}
                    />
                  </td>
                </tr>
              ))}
              {rows.length === 0 && <tr><td className="td text-muted" colSpan={8}>No payments recorded yet.</td></tr>}
            </tbody>
          </table>
        </div>
        <Pager basePath="/admin/payments" params={{ vendor: vendorFilter || undefined }} page={page} pageSize={PAGE_SIZE} total={count ?? 0} />
      </section>
    </div>
  );
}
