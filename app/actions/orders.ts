'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { getAdmin } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { cleanUrl, normalizeDomain } from '@/lib/domain';
import { str } from '@/lib/form';
import { checkOrders } from '@/lib/indexing';
import { parseDate, parseMoney } from '@/lib/parse';
import type { ActionResult } from '@/lib/types';

const DENIED: ActionResult = { ok: false, message: 'Not allowed.' };

function refresh() {
  revalidatePath('/');
  revalidatePath('/admin/orders');
  revalidatePath('/admin/vendors');
}

export async function saveOrder(formData: FormData): Promise<ActionResult> {
  if (!(await getAdmin())) return DENIED;
  const id = str(formData, 'id');
  const liveRaw = str(formData, 'live_url');
  const live = liveRaw ? cleanUrl(liveRaw) : null;
  if (liveRaw && !live) return { ok: false, message: 'The live link URL is not valid.' };
  const domain = normalizeDomain(str(formData, 'domain')) ?? (live ? normalizeDomain(live) : null);
  if (!domain) return { ok: false, message: 'Enter the website or the live link URL.' };

  const db = createAdminClient();
  const vendorId = str(formData, 'vendor_id');
  let vendorName = str(formData, 'vendor_name') || null;
  if (vendorId) {
    const { data } = await db.from('vendors').select('name').eq('id', vendorId).maybeSingle();
    vendorName = (data as { name: string } | null)?.name ?? vendorName;
  }

  const row: Record<string, unknown> = {
    domain,
    live_url: live,
    vendor_id: vendorId || null,
    vendor_name: vendorName,
    order_date: parseDate(str(formData, 'order_date')),
    price_paid: parseMoney(str(formData, 'price_paid')),
    currency: (str(formData, 'currency') || 'USD').toUpperCase().slice(0, 3),
    notes: str(formData, 'notes') || null,
    updated_at: new Date().toISOString(),
  };

  if (id) {
    const { data: before } = await db.from('orders').select('live_url').eq('id', id).maybeSingle();
    if ((before as { live_url: string | null } | null)?.live_url !== live) {
      Object.assign(row, { indexed_status: 'pending', last_checked_at: null, index_result_count: null, index_error: null });
    }
    const { error } = await db.from('orders').update(row).eq('id', id);
    if (error) return { ok: false, message: error.message };
    refresh();
    redirect('/admin/orders');
  }
  const { error } = await db.from('orders').insert(row);
  if (error) return { ok: false, message: error.message };
  refresh();
  return { ok: true, message: 'Order added.' };
}

export async function deleteOrder(id: string): Promise<ActionResult> {
  if (!(await getAdmin())) return DENIED;
  const db = createAdminClient();
  const { error } = await db.from('orders').delete().eq('id', id);
  if (error) return { ok: false, message: error.message };
  refresh();
  redirect('/admin/orders');
}

export async function checkOrderAction(id: string): Promise<ActionResult> {
  if (!(await getAdmin())) return DENIED;
  try {
    const r = await checkOrders({ ids: [id], budgetMs: 30_000 });
    refresh();
    const res = r.results[0];
    if (!res) return { ok: false, message: 'This order has no live link to check.' };
    if (res.error) return { ok: false, message: `Check failed: ${res.error}` };
    return { ok: true, message: res.status === 'indexed' ? 'Indexed.' : 'Not indexed.' };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : 'Check failed.' };
  }
}

/** Checks as many links as fit in ~55 seconds (oldest first). Click again to continue. */
export async function checkAllAction(): Promise<ActionResult> {
  if (!(await getAdmin())) return DENIED;
  try {
    const r = await checkOrders({ budgetMs: 55_000, concurrency: 6 });
    refresh();
    if (r.total === 0) return { ok: true, message: 'No live links to check yet.' };
    const left = r.remaining > 0 ? ` ${r.remaining} left: click again to continue.` : '';
    return { ok: r.failed === 0, message: `${r.checked} checked${r.failed ? `, ${r.failed} failed` : ''}.${left}` };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : 'Check failed.' };
  }
}
