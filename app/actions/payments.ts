'use server';
import { revalidatePath } from 'next/cache';
import { getAdmin } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { CURRENCY } from '@/lib/config';
import { str } from '@/lib/form';
import { parseDate, parseMoney, parseTime } from '@/lib/parse';
import type { ActionResult } from '@/lib/types';

const DENIED: ActionResult = { ok: false, message: 'Not allowed.' };

function refresh() {
  for (const p of ['/', '/admin/payments', '/admin/vendors', '/payments']) revalidatePath(p);
}

/** Records a payment you made to a vendor: which vendor, how much, date, time, method, reference. */
export async function savePayment(formData: FormData): Promise<ActionResult> {
  if (!(await getAdmin())) return DENIED;
  const vendorId = str(formData, 'vendor_id');
  const amount = parseMoney(str(formData, 'amount'));
  const date = parseDate(str(formData, 'paid_date'));
  if (!vendorId) return { ok: false, message: 'Choose the vendor you paid.' };
  if (amount === null || amount <= 0) return { ok: false, message: 'Enter the amount paid.' };
  if (!date) return { ok: false, message: 'Choose the payment date.' };

  const db = createAdminClient();
  const { data: vendor } = await db.from('vendors').select('name').eq('id', vendorId).maybeSingle();
  if (!vendor) return { ok: false, message: 'Vendor not found.' };

  const { error } = await db.from('payments').insert({
    vendor_id: vendorId,
    vendor_name: (vendor as { name: string }).name,
    order_id: str(formData, 'order_id') || null,
    amount,
    currency: (str(formData, 'currency') || CURRENCY).toUpperCase().slice(0, 3),
    paid_date: date,
    paid_time: parseTime(str(formData, 'paid_time')),
    method: str(formData, 'method') || null,
    reference: str(formData, 'reference') || null,
    notes: str(formData, 'notes') || null,
  });
  if (error) return { ok: false, message: error.message };
  refresh();
  return { ok: true, message: `Payment to ${(vendor as { name: string }).name} saved.` };
}

export async function deletePayment(id: string): Promise<ActionResult> {
  if (!(await getAdmin())) return DENIED;
  const db = createAdminClient();
  const { error } = await db.from('payments').delete().eq('id', id);
  if (error) return { ok: false, message: error.message };
  refresh();
  return { ok: true, message: 'Payment deleted.' };
}

/** Reset synced payments: deletes all sheet-imported payments and re-syncs all ledger sheets */
export async function resetSyncedPaymentsAction(formData: FormData): Promise<ActionResult> {
  if (!(await getAdmin())) return DENIED;
  const alsoDeleteManual = formData.get('also_delete_manual') === 'on' || formData.get('also_delete_manual') === 'true';

  const db = createAdminClient();

  // Query how many payments exist to report in the message
  let countQuery = db.from('payments').select('amount');
  if (!alsoDeleteManual) {
    countQuery = countQuery.not('source_id', 'is', null);
  }
  const { data: paymentsToDelete } = await countQuery;
  const count = (paymentsToDelete ?? []).length;
  const totalPKR = (paymentsToDelete ?? []).reduce((sum, p: any) => sum + (Number(p.amount) || 0), 0);

  // Delete payments
  let deleteQuery = db.from('payments').delete();
  if (!alsoDeleteManual) {
    deleteQuery = deleteQuery.not('source_id', 'is', null);
  } else {
    deleteQuery = deleteQuery.neq('id', '00000000-0000-0000-0000-000000000000');
  }
  const { error: delErr } = await deleteQuery;
  if (delErr) return { ok: false, message: `Failed to delete payments: ${delErr.message}` };

  // Immediately re-sync all active ledger sources to rebuild cleanly from Payment History tabs!
  const { syncSource } = await import('@/lib/sync');
  const { data: ledgerSources } = await db.from('sheet_sources').select('id,label').eq('kind', 'ledger').eq('active', true);
  let resynced = 0;
  for (const s of (ledgerSources ?? []) as { id: string }[]) {
    try {
      const res = await syncSource(s.id);
      if (res.ok) resynced++;
    } catch (e) {
      console.error(`Failed to re-sync ledger source ${s.id}:`, e);
    }
  }

  refresh();
  return {
    ok: true,
    message: `Reset complete: Deleted ${count} payments (PKR ${Math.round(totalPKR).toLocaleString()}). Re-synced ${resynced} ledger sources cleanly from their Payment History tabs.`,
  };
}

export async function getPaymentsStats(): Promise<{
  syncedCount: number;
  syncedPKR: number;
  manualCount: number;
  manualPKR: number;
}> {
  const db = createAdminClient();
  const { data } = await db.from('payments').select('source_id,amount');
  let syncedCount = 0, syncedPKR = 0, manualCount = 0, manualPKR = 0;
  for (const p of (data ?? []) as any[]) {
    const amt = Number(p.amount) || 0;
    if (p.source_id) {
      syncedCount++;
      syncedPKR += amt;
    } else {
      manualCount++;
      manualPKR += amt;
    }
  }
  return { syncedCount, syncedPKR, manualCount, manualPKR };
}

