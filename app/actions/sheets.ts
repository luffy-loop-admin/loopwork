'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { getAdmin } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { CURRENCY } from '@/lib/config';
import { fieldsFor, LEDGER_ORDER_FIELDS, LEDGER_PAYMENT_FIELDS, type SheetKind } from '@/lib/fields';
import { bool, str } from '@/lib/form';
import { parseSpreadsheetId } from '@/lib/sheets';
import { previewLedgerFromParams, previewLedgerSource, syncAllSources, syncSource } from '@/lib/sync';
import type { ParsedLedger } from '@/lib/ledger';
import type { ActionResult } from '@/lib/types';

const DENIED: ActionResult = { ok: false, message: 'Not allowed.' };

function refresh() {
  for (const p of ['/', '/admin/sheets', '/admin/vendors', '/admin/orders', '/admin/payments', '/listings']) revalidatePath(p);
}

export async function saveSource(formData: FormData): Promise<ActionResult> {
  if (!(await getAdmin())) return DENIED;
  const id = str(formData, 'id');
  const raw = str(formData, 'kind');
  const kind: SheetKind =
    raw === 'orders' ? 'orders' : raw === 'payments' ? 'payments' : raw === 'ledger' ? 'ledger' : 'vendor';
  const vendorId = str(formData, 'vendor_id');
  const sheetUrl = str(formData, 'sheet_url');
  const spreadsheetId = parseSpreadsheetId(sheetUrl);
  const headerRow = Math.max(1, Math.floor(Number(str(formData, 'header_row')) || 1));

  if ((kind === 'vendor' || kind === 'ledger') && !vendorId) {
    return { ok: false, message: 'Choose the vendor this sheet belongs to.' };
  }
  if (!spreadsheetId) return { ok: false, message: 'That does not look like a Google Sheets link.' };

  const orderTabs = formData.getAll('order_tabs').map(String).filter(Boolean);
  const paymentTab = str(formData, 'payment_tab') || null;

  const mapping: Record<string, string> = {};
  const orderFields = kind === 'ledger' ? LEDGER_ORDER_FIELDS : fieldsFor(kind);
  for (const f of orderFields) {
    const v = str(formData, `map_${f.key}`);
    if (v) mapping[f.key] = v;
    else if (f.required) return { ok: false, message: `Choose which column holds "${f.label}". Click "Load columns" first.` };
  }

  const paymentMapping: Record<string, string> = {};
  if (kind === 'ledger') {
    for (const f of LEDGER_PAYMENT_FIELDS) {
      const v = str(formData, `pay_map_${f.key}`);
      if (v) paymentMapping[f.key] = v;
      else if (f.required && paymentTab) {
        return { ok: false, message: `Choose which payment column holds "${f.label}".` };
      }
    }
  }

  if (kind === 'ledger' && !mapping.live_url) {
    return { ok: false, message: 'Map the Live link URL column for the ledger.' };
  }
  if ((kind === 'orders' || kind === 'vendor') && !mapping.site && !mapping.live_url) {
    return { ok: false, message: 'Map the website column or the live link column.' };
  }

  const autoInclude = formData.has('auto_include_new_tabs') ? bool(formData, 'auto_include_new_tabs') : true;
  const requireLiveLink = formData.has('require_live_link') ? bool(formData, 'require_live_link') : true;
  const writeStatusBack = bool(formData, 'write_status_back');

  const row = {
    kind,
    vendor_id: (kind === 'vendor' || kind === 'ledger') ? vendorId : null,
    label: str(formData, 'label') || null,
    sheet_url: sheetUrl,
    spreadsheet_id: spreadsheetId,
    tab_name: str(formData, 'tab_name') || null,
    order_tabs: orderTabs.length > 0 ? orderTabs : null,
    auto_include_new_tabs: autoInclude,
    payment_tab: paymentTab,
    payment_mapping: paymentMapping,
    require_live_link: requireLiveLink,
    write_status_back: writeStatusBack,
    header_row: headerRow,
    default_currency: (str(formData, 'default_currency') || CURRENCY).toUpperCase().slice(0, 3),
    mapping,
    active: bool(formData, 'active'),
  };

  const db = createAdminClient();
  let sourceId = id;
  if (id) {
    const { error } = await db.from('sheet_sources').update(row).eq('id', id);
    if (error) return { ok: false, message: error.message };
  } else {
    const { data, error } = await db.from('sheet_sources').insert(row).select('id').single();
    if (error || !data) return { ok: false, message: error?.message ?? 'Could not save.' };
    sourceId = data.id as string;
  }

  const sync = await syncSource(sourceId);
  refresh();
  if (!id) redirect(`/admin/sheets?saved=${sync.ok ? 'ok' : 'error'}`);
  return { ok: sync.ok, message: sync.ok ? `Saved. ${sync.message}` : `Saved, but the first sync failed: ${sync.message}` };
}

export async function previewLedgerAction(formData: FormData): Promise<{ ok: boolean; message?: string; preview?: ParsedLedger }> {
  if (!(await getAdmin())) return { ok: false, message: 'Not allowed.' };
  const sheetUrl = str(formData, 'sheet_url');
  const spreadsheetId = parseSpreadsheetId(sheetUrl);
  if (!spreadsheetId) return { ok: false, message: 'Invalid Google Sheets link.' };
  const headerRow = Math.max(1, Math.floor(Number(str(formData, 'header_row')) || 1));
  const orderTabs = formData.getAll('order_tabs').map(String).filter(Boolean);
  const paymentTab = str(formData, 'payment_tab') || null;

  const mapping: Record<string, string> = {};
  for (const f of LEDGER_ORDER_FIELDS) {
    const v = str(formData, `map_${f.key}`);
    if (v) mapping[f.key] = v;
  }
  const paymentMapping: Record<string, string> = {};
  for (const f of LEDGER_PAYMENT_FIELDS) {
    const v = str(formData, `pay_map_${f.key}`);
    if (v) paymentMapping[f.key] = v;
  }

  try {
    const preview = await previewLedgerFromParams({
      spreadsheetId,
      headerRow,
      orderTabs,
      paymentTab,
      autoIncludeNewTabs: formData.has('auto_include_new_tabs') ? bool(formData, 'auto_include_new_tabs') : true,
      orderMapping: mapping,
      paymentMapping,
      requireLiveLink: formData.has('require_live_link') ? bool(formData, 'require_live_link') : true,
      defaultCurrency: str(formData, 'default_currency') || 'PKR',
    });
    return { ok: true, preview };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : 'Preview failed.' };
  }
}

export async function previewLedgerSourceAction(sourceId: string): Promise<{ ok: boolean; message?: string; preview?: ParsedLedger }> {
  if (!(await getAdmin())) return { ok: false, message: 'Not allowed.' };
  try {
    const preview = await previewLedgerSource(sourceId);
    return { ok: true, preview };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : 'Preview failed.' };
  }
}

export async function deleteSource(id: string): Promise<ActionResult> {
  if (!(await getAdmin())) return DENIED;
  const db = createAdminClient();
  const { error } = await db.from('sheet_sources').delete().eq('id', id);
  if (error) return { ok: false, message: error.message };
  refresh();
  return { ok: true, message: 'Sheet removed.' };
}

export async function syncSourceAction(id: string): Promise<ActionResult> {
  if (!(await getAdmin())) return DENIED;
  const r = await syncSource(id);
  refresh();
  return { ok: r.ok, message: r.message };
}

export async function syncAllAction(): Promise<ActionResult> {
  if (!(await getAdmin())) return DENIED;
  const r = await syncAllSources(240_000);
  refresh();
  const base = `${r.synced} of ${r.total} sheets synced`;
  if (r.failed) return { ok: false, message: `${base}. ${r.failed} failed: ${r.errors.slice(0, 2).join(' | ')}` };
  return { ok: true, message: r.skipped ? `${base}. ${r.skipped} left for the next run.` : `${base}.` };
}
