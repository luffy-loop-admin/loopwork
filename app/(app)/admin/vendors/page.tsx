import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { fmtDateTime, money, num } from '@/lib/format';
import ActionForm from '@/components/ActionForm';
import ActionButton from '@/components/ActionButton';
import { createVendor, resetVendorPassword, setVendorActive, updateVendor } from '@/app/actions/vendors';

export default async function VendorsPage() {
  const supabase = await createClient();
  const [vendorsRes, profilesRes, sourcesRes, spendRes, countsRes] = await Promise.all([
    supabase.from('vendors').select('id,name,notes,active,created_at').order('name'),
    supabase.from('profiles').select('email,vendor_id').eq('role', 'vendor'),
    supabase.from('sheet_sources').select('vendor_id,last_synced_at,last_sync_status').eq('kind', 'vendor'),
    supabase.from('vendor_balance').select('vendor_id,currency,orders_count,ordered_total,paid_total,balance'),
    supabase.from('vendor_site_counts').select('vendor_id,sites_count'),
  ]);
  const vendors = (vendorsRes.data ?? []) as { id: string; name: string; notes: string | null; active: boolean }[];
  const profiles = (profilesRes.data ?? []) as { email: string; vendor_id: string }[];
  const sources = (sourcesRes.data ?? []) as { vendor_id: string; last_synced_at: string | null; last_sync_status: string | null }[];
  const spend = (spendRes.data ?? []) as { vendor_id: string; currency: string; orders_count: number; ordered_total: number; paid_total: number; balance: number }[];
  const counts = (countsRes.data ?? []) as { vendor_id: string; sites_count: number }[];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">Vendors</h1>
      </div>

      <details className="card p-4 sm:p-5" open={vendors.length === 0}>
        <summary className="cursor-pointer font-semibold">Add a vendor</summary>
        <ActionForm action={createVendor} submitLabel="Create vendor" resetOnSuccess className="mt-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="v-name">Vendor name</label>
              <input id="v-name" name="name" required className="input" />
            </div>
            <div>
              <label className="label" htmlFor="v-email">Login email</label>
              <input id="v-email" name="email" type="email" required className="input" autoComplete="off" />
            </div>
            <div>
              <label className="label" htmlFor="v-pass">Password (10+ characters)</label>
              <input id="v-pass" name="password" type="text" required minLength={10} className="input" autoComplete="off" />
            </div>
            <div>
              <label className="label" htmlFor="v-notes">Notes (private)</label>
              <input id="v-notes" name="notes" className="input" />
            </div>
          </div>
        </ActionForm>
      </details>

      <div className="card overflow-x-auto">
        <table className="w-full min-w-[900px] border-collapse">
          <thead>
            <tr>
              <th className="th">Vendor</th>
              <th className="th">Status</th>
              <th className="th">Sites</th>
              <th className="th">Last sync</th>
              <th className="th">Total spent</th>
              <th className="th">Balance due</th>
              <th className="th">Manage</th>
            </tr>
          </thead>
          <tbody>
            {vendors.map((v) => {
              const logins = profiles.filter((p) => p.vendor_id === v.id).map((p) => p.email);
              const vs = sources.filter((s) => s.vendor_id === v.id);
              const last = vs.map((s) => s.last_synced_at).filter(Boolean).sort().pop() ?? null;
              const hasError = vs.some((s) => s.last_sync_status === 'error');
              const sp = spend.filter((s) => s.vendor_id === v.id);
              const sites = counts.find((c) => c.vendor_id === v.id)?.sites_count ?? 0;
              return (
                <tr key={v.id} className={v.active ? '' : 'bg-paper text-muted'}>
                  <td className="td">
                    <div className="font-medium">{v.name}</div>
                    <div className="text-xs text-muted">{logins.join(', ') || 'No login'}</div>
                  </td>
                  <td className="td">
                    <span className={`badge ${v.active ? 'bg-good-soft text-good' : 'bg-paper text-muted border border-line'}`}>{v.active ? 'Active' : 'Disabled'}</span>
                  </td>
                  <td className="td">{num(sites)}</td>
                  <td className="td">
                    {vs.length === 0 ? <Link className="link" href={`/admin/sheets/new?kind=vendor&vendor=${v.id}`}>Add sheet</Link> : (
                      <>
                        {fmtDateTime(last)}
                        {hasError && <div className="text-xs text-bad">A sheet has a sync error</div>}
                      </>
                    )}
                  </td>
                  <td className="td">
                    {sp.length === 0 ? '-' : sp.map((s) => <div key={s.currency}>{money(s.ordered_total, s.currency)} <span className="text-xs text-muted">({s.orders_count})</span></div>)}
                  </td>
                  <td className="td">
                    {sp.length === 0 ? '-' : sp.map((s) => <div key={s.currency} className={Number(s.balance) > 0 ? 'text-warn' : 'text-good'}>{money(s.balance, s.currency)}</div>)}
                  </td>
                  <td className="td">
                    <details>
                      <summary className="cursor-pointer text-accent">Edit</summary>
                      <div className="mt-3 w-72 space-y-4 rounded-md border border-line bg-white p-3 text-ink">
                        <ActionForm action={updateVendor} submitLabel="Save" submitClassName="btn btn-primary btn-sm">
                          <input type="hidden" name="id" value={v.id} />
                          <label className="label" htmlFor={`n-${v.id}`}>Name</label>
                          <input id={`n-${v.id}`} name="name" defaultValue={v.name} required className="input" />
                          <label className="label mt-2" htmlFor={`o-${v.id}`}>Notes</label>
                          <input id={`o-${v.id}`} name="notes" defaultValue={v.notes ?? ''} className="input" />
                        </ActionForm>
                        <ActionForm action={resetVendorPassword} submitLabel="Set new password" submitClassName="btn btn-ghost btn-sm">
                          <input type="hidden" name="vendor_id" value={v.id} />
                          <label className="label" htmlFor={`p-${v.id}`}>New password</label>
                          <input id={`p-${v.id}`} name="password" minLength={10} className="input" autoComplete="off" />
                        </ActionForm>
                        <div className="flex flex-wrap gap-2">
                          <Link className="btn btn-ghost btn-sm no-underline" href={`/admin/sheets/new?kind=vendor&vendor=${v.id}`}>Add sheet</Link>
                          <ActionButton
                            action={setVendorActive.bind(null, v.id, !v.active)}
                            label={v.active ? 'Disable vendor' : 'Enable vendor'}
                            className={`btn btn-sm ${v.active ? 'btn-danger' : 'btn-primary'}`}
                            confirm={v.active ? `Disable ${v.name}? They will not be able to sign in and their sites disappear from search.` : undefined}
                          />
                        </div>
                      </div>
                    </details>
                  </td>
                </tr>
              );
            })}
            {vendors.length === 0 && <tr><td className="td text-muted" colSpan={7}>No vendors yet. Add your first one above.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
