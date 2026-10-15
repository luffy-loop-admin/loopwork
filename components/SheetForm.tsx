'use client';
import { useState } from 'react';
import ActionForm from './ActionForm';
import { fieldsFor, LEDGER_ORDER_FIELDS, LEDGER_PAYMENT_FIELDS, type SheetKind } from '@/lib/fields';
import { previewLedgerAction } from '@/app/actions/sheets';
import LedgerPreviewModal from './LedgerPreviewModal';
import type { ParsedLedger } from '@/lib/ledger';
import type { ActionResult } from '@/lib/types';

type Initial = {
  id?: string;
  vendor_id?: string | null;
  label?: string | null;
  sheet_url?: string;
  tab_name?: string | null;
  order_tabs?: string[] | null;
  auto_include_new_tabs?: boolean;
  payment_tab?: string | null;
  header_row?: number;
  default_currency?: string;
  active?: boolean;
  mapping?: Record<string, string>;
  payment_mapping?: Record<string, string>;
  require_live_link?: boolean;
  write_status_back?: boolean;
};

type Props = {
  kind: SheetKind;
  vendors: { id: string; name: string }[];
  serviceEmail: string;
  action: (formData: FormData) => Promise<ActionResult | void>;
  initial?: Initial;
};

const MONTH_REGEX = /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t|tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\b/i;

export default function SheetForm({ kind, vendors, serviceEmail, action, initial = {} }: Props) {
  const isLedger = kind === 'ledger';
  const orderFields = isLedger ? LEDGER_ORDER_FIELDS : fieldsFor(kind);
  const paymentFields = isLedger ? LEDGER_PAYMENT_FIELDS : [];

  const [url, setUrl] = useState(initial.sheet_url ?? '');
  const [tab, setTab] = useState(initial.tab_name ?? '');
  const [row, setRow] = useState(String(initial.header_row ?? 1));

  // Tabs management
  const [availableTabs, setAvailableTabs] = useState<string[]>(initial.order_tabs ?? (initial.tab_name ? [initial.tab_name] : []));
  const [selectedOrderTabs, setSelectedOrderTabs] = useState<string[]>(initial.order_tabs ?? (initial.tab_name ? [initial.tab_name] : []));
  const [selectedPaymentTab, setSelectedPaymentTab] = useState<string>(initial.payment_tab ?? '');
  const [loadingTabs, setLoadingTabs] = useState(false);

  // Column mapping
  const [mapping, setMapping] = useState<Record<string, string>>(initial.mapping ?? {});
  const [paymentMapping, setPaymentMapping] = useState<Record<string, string>>(initial.payment_mapping ?? {});
  const [headers, setHeaders] = useState<string[]>([]);
  const [loadingCols, setLoadingCols] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  // Preview
  const [previewing, setPreviewing] = useState(false);
  const [previewData, setPreviewData] = useState<ParsedLedger | null>(null);

  async function loadTabs() {
    setLoadingTabs(true);
    setMsg(null);
    try {
      const qs = new URLSearchParams({ url });
      const res = await fetch(`/api/admin/sheet-tabs?${qs.toString()}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Could not read sheet tabs.');
      const list = json.tabs as string[];
      setAvailableTabs(list);

      // Smart defaults for ledger
      if (isLedger) {
        // Pre-select payment tab
        const pTab = list.find((t) => /payment/i.test(t));
        if (pTab) setSelectedPaymentTab(pTab);

        // Pre-select month tabs for orders
        const monthTabs = list.filter((t) => t !== pTab && MONTH_REGEX.test(t));
        setSelectedOrderTabs(monthTabs.length ? monthTabs : list);
      } else if (kind === 'vendor') {
        if (!selectedOrderTabs.length) {
          setSelectedOrderTabs([list[0]]);
        }
      }
      setMsg({ ok: true, text: `Loaded ${list.length} tabs from the spreadsheet.` });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : 'Could not load tabs.' });
    } finally {
      setLoadingTabs(false);
    }
  }

  async function loadColumns() {
    setLoadingCols(true);
    setMsg(null);
    try {
      const activeTab = isLedger
        ? (selectedOrderTabs[0] || tab)
        : tab;
      const qs = new URLSearchParams({ url, tab: activeTab, row });
      const res = await fetch(`/api/admin/sheet-headers?${qs.toString()}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Could not read the sheet.');
      const list = json.headers as string[];
      setHeaders(list);

      // Pre-select order columns
      setMapping((prev) => {
        const next = { ...prev };
        for (const f of orderFields) {
          if (next[f.key] && list.includes(next[f.key])) continue;
          const hit = list.find((h) => f.guess.test(h));
          if (hit) next[f.key] = hit;
          else delete next[f.key];
        }
        return next;
      });

      // Pre-select payment columns (excluding remaining/balance)
      if (isLedger) {
        setPaymentMapping((prev) => {
          const next = { ...prev };
          for (const f of paymentFields) {
            if (next[f.key] && list.includes(next[f.key])) continue;
            // Never guess columns matching remain/balance/total
            const hit = list.find((h) => f.guess.test(h) && !/remain|balance|total|due|left/i.test(h));
            if (hit) next[f.key] = hit;
            else delete next[f.key];
          }
          return next;
        });
      }

      setMsg({ ok: true, text: `Found ${list.length} columns. Check the matches below.` });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : 'Could not read the sheet.' });
    } finally {
      setLoadingCols(false);
    }
  }

  async function handlePreview(e: React.MouseEvent) {
    e.preventDefault();
    const form = (e.currentTarget as HTMLElement).closest('form');
    if (!form) return;
    setPreviewing(true);
    setMsg(null);
    try {
      const fd = new FormData(form);
      const res = await previewLedgerAction(fd);
      if (!res.ok || !res.preview) {
        throw new Error(res.message || 'Preview failed.');
      }
      setPreviewData(res.preview);
    } catch (err) {
      setMsg({ ok: false, text: err instanceof Error ? err.message : 'Preview failed.' });
    } finally {
      setPreviewing(false);
    }
  }

  const toggleOrderTab = (t: string) => {
    setSelectedOrderTabs((prev) =>
      prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]
    );
  };

  return (
    <>
      <ActionForm action={action} submitLabel={initial.id ? 'Save and sync' : 'Add sheet and sync'} className="space-y-6">
        {initial.id && <input type="hidden" name="id" value={initial.id} />}
        <input type="hidden" name="kind" value={kind} />

        <div className="card space-y-4 p-4 sm:p-5">
          <p className="rounded-md bg-accent-soft p-3 text-sm">
            Share the Google Sheet with <strong className="break-all">{serviceEmail || 'your service account email'}</strong> ({isLedger ? 'Editor access recommended for write-back, or Viewer' : 'Viewer access'}). Then paste the link below.
          </p>

          {(kind === 'vendor' || isLedger) && (
            <div>
              <label className="label" htmlFor="vendor_id">Vendor <span className="text-bad">*</span></label>
              <select id="vendor_id" name="vendor_id" required defaultValue={initial.vendor_id ?? ''} className="input">
                <option value="" disabled>Choose a vendor…</option>
                {vendors.map((v) => (
                  <option key={v.id} value={v.id}>{v.name}</option>
                ))}
              </select>
              {isLedger && <p className="mt-1 text-xs text-muted">All orders and payments in this spreadsheet will belong to this vendor.</p>}
            </div>
          )}

          <div>
            <label className="label" htmlFor="sheet_url">Google Sheet link <span className="text-bad">*</span></label>
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                id="sheet_url"
                name="sheet_url"
                required
                className="input flex-1"
                placeholder="https://docs.google.com/spreadsheets/d/…"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
              />
              <button
                type="button"
                className="btn btn-ghost whitespace-nowrap"
                onClick={loadTabs}
                disabled={loadingTabs || !url}
              >
                {loadingTabs ? 'Loading tabs…' : 'Load tabs'}
              </button>
            </div>
          </div>

          {/* Tab Selection */}
          {(isLedger || availableTabs.length > 0) ? (
            <div className="rounded-xl border border-line bg-paper/60 p-4 space-y-4">
              <div>
                <div className="flex items-center justify-between">
                  <label className="label font-semibold">
                    {isLedger ? 'Month / Order Tabs to Read' : 'Tabs to Read'}
                  </label>
                  {availableTabs.length > 0 && (
                    <button
                      type="button"
                      className="text-xs text-accent underline cursor-pointer"
                      onClick={() => setSelectedOrderTabs(selectedOrderTabs.length === availableTabs.length ? [] : [...availableTabs])}
                    >
                      {selectedOrderTabs.length === availableTabs.length ? 'Deselect all' : 'Select all'}
                    </button>
                  )}
                </div>
                {availableTabs.length > 0 ? (
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 mt-2">
                    {availableTabs.map((t) => (
                      <label key={t} className="flex items-center gap-2 p-2 rounded-md border border-line bg-white text-xs cursor-pointer hover:bg-accent-soft/30">
                        <input
                          type="checkbox"
                          name="order_tabs"
                          value={t}
                          checked={selectedOrderTabs.includes(t)}
                          onChange={() => toggleOrderTab(t)}
                          className="h-4 w-4 rounded"
                        />
                        <span className="truncate" title={t}>{t}</span>
                      </label>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-muted">Click &quot;Load tabs&quot; to pick specific tabs, or enter names below.</p>
                )}
              </div>

              {isLedger && (
                <div>
                  <label className="label font-semibold" htmlFor="payment_tab">Payment History Tab</label>
                  <select
                    id="payment_tab"
                    name="payment_tab"
                    className="input sm:max-w-xs"
                    value={selectedPaymentTab}
                    onChange={(e) => setSelectedPaymentTab(e.target.value)}
                  >
                    <option value="">None / Not used</option>
                    {availableTabs.map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                  <p className="mt-1 text-xs text-muted">Select the tab recording payments made to this vendor (e.g. &quot;Payment History&quot;).</p>
                </div>
              )}
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <label className="label" htmlFor="tab_name">Tabs to read</label>
                <input id="tab_name" name="tab_name" className="input" placeholder="First tab" value={tab} onChange={(e) => setTab(e.target.value)} />
                <p className="mt-1 text-xs text-muted">Empty = first tab. <strong>*</strong> = every tab. Or click &quot;Load tabs&quot;.</p>
              </div>
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
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
              <input id="label" name="label" className="input" defaultValue={initial.label ?? ''} placeholder={isLedger ? 'Vendor ledger' : kind === 'orders' ? 'My order history' : 'Main price list'} />
            </div>
            <div className="space-y-2 pt-2">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" name="active" defaultChecked={initial.active ?? true} className="h-4 w-4 rounded" />
                Include in automatic sync (every 6 hours)
              </label>

              {isLedger && (
                <>
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      type="checkbox"
                      name="auto_include_new_tabs"
                      defaultChecked={initial.auto_include_new_tabs ?? true}
                      className="h-4 w-4 rounded"
                    />
                    Automatically include new month tabs when created
                  </label>

                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      type="checkbox"
                      name="require_live_link"
                      defaultChecked={initial.require_live_link ?? true}
                      className="h-4 w-4 rounded"
                    />
                    Require valid live link (skips summary/total rows automatically)
                  </label>

                  <label className="flex items-start gap-2 text-sm cursor-pointer">
                    <input
                      type="checkbox"
                      name="write_status_back"
                      defaultChecked={initial.write_status_back ?? false}
                      className="h-4 w-4 rounded mt-0.5"
                    />
                    <div>
                      <span>Write indexing status back to this sheet</span>
                      <p className="text-xs text-muted">Writes &quot;Indexed&quot; / &quot;Not indexed&quot; directly to the Status column after Google checks (requires Editor access).</p>
                    </div>
                  </label>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Column Mapping Card */}
        <div className="card space-y-4 p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-3">
            <div>
              <h2 className="font-semibold text-base">Match your columns</h2>
              <p className="text-xs text-muted">Click &quot;Load columns&quot; to inspect the header row and map the fields.</p>
            </div>
            <div className="flex items-center gap-2">
              <button type="button" className="btn btn-ghost btn-sm" onClick={loadColumns} disabled={loadingCols || !url}>
                {loadingCols ? 'Reading…' : 'Load columns'}
              </button>
              {isLedger && (
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={handlePreview}
                  disabled={previewing || !url}
                >
                  {previewing ? 'Calculating…' : '🔍 Preview (don\'t save)'}
                </button>
              )}
            </div>
          </div>

          {msg && (
            <p role="status" className={`rounded-md p-2.5 text-xs font-medium ${msg.ok ? 'bg-good-soft text-good' : 'bg-bad-soft text-bad'}`}>
              {msg.text}
            </p>
          )}

          {/* Order columns */}
          <div className="space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-muted">
              {isLedger ? '1. Link / Order Columns' : 'Columns'}
            </h3>
            <div className="grid gap-4 sm:grid-cols-2">
              {orderFields.map((f) => {
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

          {/* Payment columns for Ledger */}
          {isLedger && (
            <div className="space-y-3 pt-4 border-t border-line">
              <h3 className="text-xs font-bold uppercase tracking-wider text-muted">
                2. Payment History Columns (Excludes Remaining / Balance)
              </h3>
              <div className="grid gap-4 sm:grid-cols-2">
                {paymentFields.map((f) => {
                  const current = paymentMapping[f.key] ?? '';
                  const options = headers.length ? headers : current ? [current] : [];
                  return (
                    <div key={f.key}>
                      <label className="label" htmlFor={`pay_map_${f.key}`}>
                        {f.label}
                        {f.required && <span className="text-bad"> *</span>}
                      </label>
                      <select
                        id={`pay_map_${f.key}`}
                        name={`pay_map_${f.key}`}
                        className="input"
                        value={current}
                        onChange={(e) => setPaymentMapping((m) => ({ ...m, [f.key]: e.target.value }))}
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
          )}
        </div>
      </ActionForm>

      {/* Preview Modal */}
      {previewData && (
        <LedgerPreviewModal preview={previewData} onClose={() => setPreviewData(null)} />
      )}
    </>
  );
}
