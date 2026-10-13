'use client';
import { useState } from 'react';
import ActionForm from './ActionForm';
import { fieldsFor, type SheetKind } from '@/lib/fields';
import type { ActionResult } from '@/lib/types';

type Initial = {
  id?: string;
  vendor_id?: string | null;
  label?: string | null;
  sheet_url?: string;
  tab_name?: string | null;
  header_row?: number;
  default_currency?: string;
  active?: boolean;
  mapping?: Record<string, string>;
};

type Props = {
  kind: SheetKind;
  vendors: { id: string; name: string }[];
  serviceEmail: string;
  action: (formData: FormData) => Promise<ActionResult | void>;
  initial?: Initial;
};

export default function SheetForm({ kind, vendors, serviceEmail, action, initial = {} }: Props) {
  const fields = fieldsFor(kind);
  const [url, setUrl] = useState(initial.sheet_url ?? '');
  const [tab, setTab] = useState(initial.tab_name ?? '');
  const [row, setRow] = useState(String(initial.header_row ?? 1));
  const [mapping, setMapping] = useState<Record<string, string>>(initial.mapping ?? {});
  const [headers, setHeaders] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function loadColumns() {
    setLoading(true);
    setMsg(null);
    try {
      const qs = new URLSearchParams({ url, tab, row });
      const res = await fetch(`/api/admin/sheet-headers?${qs.toString()}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Could not read the sheet.');
      const list = json.headers as string[];
      setHeaders(list);
      // Pre-select obvious columns the admin has not mapped yet.
      setMapping((prev) => {
        const next = { ...prev };
        for (const f of fields) {
          if (next[f.key] && list.includes(next[f.key])) continue;
          const hit = list.find((h) => f.guess.test(h));
          if (hit) next[f.key] = hit;
          else delete next[f.key];
        }
        return next;
      });
      setMsg({ ok: true, text: `Found ${list.length} columns. Check the matches below.` });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : 'Could not read the sheet.' });
    } finally {
      setLoading(false);
    }
  }

  return (
    <ActionForm action={action} submitLabel={initial.id ? 'Save and sync' : 'Add sheet and sync'} className="space-y-6">
      {initial.id && <input type="hidden" name="id" value={initial.id} />}
      <input type="hidden" name="kind" value={kind} />

      <div className="card space-y-4 p-4 sm:p-5">
        <p className="rounded-md bg-accent-soft p-3 text-sm">
          Share the Google Sheet with <strong className="break-all">{serviceEmail || 'your service account email'}</strong> (Viewer access). Then paste the link below.
        </p>

        {kind === 'vendor' && (
          <div>
            <label className="label" htmlFor="vendor_id">Vendor</label>
            <select id="vendor_id" name="vendor_id" required defaultValue={initial.vendor_id ?? ''} className="input">
              <option value="" disabled>Choose a vendor…</option>
              {vendors.map((v) => (
                <option key={v.id} value={v.id}>{v.name}</option>
              ))}
            </select>
          </div>
        )}

        <div>
          <label className="label" htmlFor="sheet_url">Google Sheet link</label>
          <input id="sheet_url" name="sheet_url" required className="input" placeholder="https://docs.google.com/spreadsheets/d/…" value={url} onChange={(e) => setUrl(e.target.value)} />
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label className="label" htmlFor="tab_name">Tabs to read</label>
            <input id="tab_name" name="tab_name" className="input" placeholder="First tab" value={tab} onChange={(e) => setTab(e.target.value)} />
            <p className="mt-1 text-xs text-muted">Empty = first tab. <strong>*</strong> = every tab (e.g. one tab per month). Or list names: Jan 2026, Feb 2026</p>
          </div>
          <div>
            <label className="label" htmlFor="header_row">Header row number</label>
            <input id="header_row" name="header_row" type="number" min={1} className="input" value={row} onChange={(e) => setRow(e.target.value)} />
          </div>
          <div>
            <label className="label" htmlFor="default_currency">Default currency</label>
            <input id="default_currency" name="default_currency" maxLength={3} className="input" defaultValue={initial.default_currency ?? 'PKR'} />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="label">Label (optional)</label>
            <input id="label" name="label" className="input" defaultValue={initial.label ?? ''} placeholder={kind === 'orders' ? 'My order history' : kind === 'payments' ? 'Payments' : 'Main price list'} />
          </div>
          <label className="flex items-center gap-2 self-end pb-2 text-sm">
            <input type="checkbox" name="active" defaultChecked={initial.active ?? true} className="h-4 w-4" />
            Include in automatic sync
          </label>
        </div>
      </div>

      <div className="card space-y-4 p-4 sm:p-5">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="font-semibold">Match your columns</h2>
          <button type="button" className="btn btn-ghost btn-sm" onClick={loadColumns} disabled={loading || !url}>
            {loading ? 'Reading…' : 'Load columns'}
          </button>
          {msg && <span role="status" className={`text-sm ${msg.ok ? 'text-good' : 'text-bad'}`}>{msg.text}</span>}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          {fields.map((f) => {
            const current = mapping[f.key] ?? '';
            const options = headers.length ? headers : current ? [current] : [];
            return (
              <div key={f.key}>
                <label className="label" htmlFor={`map_${f.key}`}>
                  {f.label}
                  {f.required && <span className="text-bad"> *</span>}
                </label>
                <select
                  id={`map_${f.key}`}
                  name={`map_${f.key}`}
                  className="input"
                  value={current}
                  onChange={(e) => setMapping((m) => ({ ...m, [f.key]: e.target.value }))}
                >
                  <option value="">Not used</option>
                  {options.map((h) => (
                    <option key={h} value={h}>{h}</option>
                  ))}
                </select>
                {f.hint && <p className="mt-1 text-xs text-muted">{f.hint}</p>}
              </div>
            );
          })}
        </div>
      </div>
    </ActionForm>
  );
}
