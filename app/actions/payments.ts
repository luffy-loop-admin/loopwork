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
