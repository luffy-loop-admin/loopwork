import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { fmtDateTime } from '@/lib/format';
import { serviceAccountEmail } from '@/lib/sheets';
import ActionButton from '@/components/ActionButton';
import { deleteSource, syncAllAction, syncSourceAction } from '@/app/actions/sheets';

export const maxDuration = 300;

export default async function SheetsPage({ searchParams }: { searchParams: Promise<{ saved?: string }> }) {
  const { saved } = await searchParams;
  const supabase = await createClient();
  const { data } = await supabase
    .from('sheet_sources')
    .select('id,kind,label,sheet_url,tab_name,active,last_synced_at,last_sync_status,last_sync_message,last_sync_rows,vendors(name)')
    .order('kind')
    .order('created_at');
  const sources = (data ?? []) as any[];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">Google Sheets</h1>
        <div className="flex flex-wrap gap-2">
          <Link href="/admin/sheets/new?kind=vendor" className="btn btn-ghost no-underline">Add vendor sheet</Link>
          <Link href="/admin/sheets/new?kind=orders" className="btn btn-ghost no-underline">Add order history sheet</Link>
          <ActionButton action={syncAllAction} label="Sync all now" className="btn btn-primary" />
        </div>
      </div>

      {saved && (
        <p role="status" className={`rounded-md p-3 text-sm ${saved === 'ok' ? 'bg-good-soft text-good' : 'bg-warn-soft text-warn'}`}>
          {saved === 'ok' ? 'Sheet added and synced.' : 'Sheet saved, but the first sync failed. See the result column.'}
        </p>
      )}

      <p className="text-sm text-muted">
        Sheets sync automatically every 6 hours. Each sheet must be shared (Viewer) with <strong className="break-all text-ink">{serviceAccountEmail() || 'your service account email'}</strong>.
      </p>

      <div className="card overflow-x-auto">
        <table className="w-full min-w-[860px] border-collapse">
          <thead>
            <tr>
              <th className="th">Sheet</th>
              <th className="th">Type</th>
              <th className="th">Last sync</th>
              <th className="th">Result</th>
              <th className="th">Actions</th>
            </tr>
          </thead>
          <tbody>
            {sources.map((s) => {
              const vendor = Array.isArray(s.vendors) ? s.vendors[0] : s.vendors;
              return (
                <tr key={s.id} className={s.active ? '' : 'bg-paper text-muted'}>
                  <td className="td">
                    <div className="font-medium">{s.kind === 'vendor' ? vendor?.name ?? 'Vendor' : s.label || 'Order history'}</div>
                    <a href={s.sheet_url} target="_blank" rel="noopener noreferrer" className="link text-xs">Open sheet{s.tab_name ? ` (${s.tab_name})` : ''}</a>
                    {!s.active && <div className="text-xs">Paused</div>}
                  </td>
                  <td className="td">{s.kind === 'vendor' ? 'Vendor prices' : 'Order history'}</td>
                  <td className="td">{fmtDateTime(s.last_synced_at)}</td>
                  <td className="td max-w-xs">
                    {s.last_sync_status === 'error' ? <span className="text-bad">{s.last_sync_message}</span> : <span className="text-muted">{s.last_sync_message ?? 'Not synced yet'}</span>}
                  </td>
                  <td className="td">
                    <div className="flex flex-wrap items-start gap-2">
                      <ActionButton action={syncSourceAction.bind(null, s.id)} label="Sync now" />
                      <Link href={`/admin/sheets/${s.id}`} className="btn btn-ghost btn-sm no-underline">Edit</Link>
                      <ActionButton
                        action={deleteSource.bind(null, s.id)}
                        label="Remove"
                        className="btn btn-danger btn-sm"
                        confirm={s.kind === 'vendor' ? 'Remove this sheet and all the sites imported from it?' : 'Remove this sheet link? Orders already imported are kept.'}
                      />
                    </div>
                  </td>
                </tr>
              );
            })}
            {sources.length === 0 && <tr><td className="td text-muted" colSpan={5}>No sheets yet. Add a vendor sheet to get started.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
