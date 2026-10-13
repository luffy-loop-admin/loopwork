'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { getAdmin, requireProfile } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { CURRENCY } from '@/lib/config';
import { cleanUrl, normalizeDomain } from '@/lib/domain';
import { str } from '@/lib/form';
import { checkOrders } from '@/lib/indexing';
import { parseDate, parseMoney } from '@/lib/parse';
import type { ActionResult } from '@/lib/types';

const DENIED: ActionResult = { ok: false, message: 'Not allowed.' };
const ORDER_STATUSES = ['ordered', 'live', 'cancelled'];
const INDEX_STATUSES = ['pending', 'indexed', 'not_indexed'];

function refresh() {
  for (const p of ['/', '/admin/orders', '/admin/vendors', '/admin/payments', '/orders']) revalidatePath(p);
}

/** Creates or edits an order. Choosing a vendor ASSIGNS the order to them (they see it under "Orders"). */
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

  let orderStatus = str(formData, 'order_status');
  if (!ORDER_STATUSES.includes(orderStatus)) orderStatus = live ? 'live' : 'ordered';
  if (live && orderStatus === 'ordered') orderStatus = 'live'; // a live link means the order is delivered

  const row: Record<string, unknown> = {
    domain,
    live_url: live,
    vendor_id: vendorId || null,
    vendor_name: vendorName,
    order_date: parseDate(str(formData, 'order_date')),
    price_paid: parseMoney(str(formData, 'price_paid')),
    currency: (str(formData, 'currency') || CURRENCY).toUpperCase().slice(0, 3),
    notes: str(formData, 'notes') || null,
    pair: str(formData, 'pair') || null,
    article_url: str(formData, 'article_url') || null,
    order_status: orderStatus,
    updated_at: new Date().toISOString(),
  };

  const indexIn = str(formData, 'indexed_status');
  if (id) {
    const { data: before } = await db.from('orders').select('live_url').eq('id', id).maybeSingle();
    if ((before as { live_url: string | null } | null)?.live_url !== live) {
      Object.assign(row, { indexed_status: 'pending', last_checked_at: null, index_result_count: null, index_error: null });
    } else if (INDEX_STATUSES.includes(indexIn)) {
      row.indexed_status = indexIn;
    }
    const { error } = await db.from('orders').update(row).eq('id', id);
    if (error) return { ok: false, message: error.message };
    refresh();
    redirect('/admin/orders');
  }

  if (INDEX_STATUSES.includes(indexIn)) row.indexed_status = indexIn;

  const ringVendor = formData.get('ring_vendor');
  if (vendorId && (ringVendor === 'on' || ringVendor === 'true')) {
    row.alerted_at = new Date().toISOString();
    row.acknowledged_at = null;
  }

  const { error } = await db.from('orders').insert(row);
  if (error) return { ok: false, message: error.message };
  refresh();
  const after = str(formData, 'after');
  if (after.startsWith('/admin/')) redirect(after);
  return { ok: true, message: vendorName ? (row.alerted_at ? `Order added and ringing ${vendorName}'s device! 🔔` : `Order added and assigned to ${vendorName}.`) : 'Order added.' };
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

/** Admin rings/alerts the vendor for a specific order */
export async function alertOrderVendorAction(orderId: string): Promise<ActionResult> {
  if (!(await getAdmin())) return DENIED;
  const db = createAdminClient();
  const { data: order } = await db.from('orders').select('id,domain,vendor_id,vendor_name').eq('id', orderId).maybeSingle();
  if (!order) return { ok: false, message: 'Order not found.' };
  if (!order.vendor_id) return { ok: false, message: 'This order has no assigned vendor to alert.' };

  const { error } = await db.from('orders').update({
    alerted_at: new Date().toISOString(),
    acknowledged_at: null,
  }).eq('id', orderId);

  if (error) return { ok: false, message: error.message };
  refresh();
  return { ok: true, message: `🔔 Alert sent! Ringing ${order.vendor_name || 'vendor'}'s device.` };
}

/** Vendor stops the ringtone and acknowledges the order alert */
export async function acknowledgeOrderAlertAction(orderId: string): Promise<ActionResult> {
  const profile = await requireProfile();
  const db = createAdminClient();
  let q = db.from('orders').update({ acknowledged_at: new Date().toISOString() }).eq('id', orderId);
  if (profile.role !== 'admin' && profile.vendor_id) {
    q = q.eq('vendor_id', profile.vendor_id);
  }
  const { error } = await q;
  if (error) return { ok: false, message: error.message };
  refresh();
  return { ok: true, message: 'Alert acknowledged.' };
}

/** Vendor device checks for any active ringing order alerts */
export async function getActiveOrderAlertAction(): Promise<{
  hasAlert: boolean;
  order?: { id: string; domain: string; price_paid: number | null; currency: string; order_date: string | null; alerted_at: string };
}> {
  const profile = await requireProfile();
  if (profile.role !== 'vendor' || !profile.vendor_id) return { hasAlert: false };
  const db = createAdminClient();
  const { data } = await db
    .from('orders')
    .select('id,domain,price_paid,currency,order_date,alerted_at')
    .eq('vendor_id', profile.vendor_id)
    .not('alerted_at', 'is', null)
    .is('acknowledged_at', null)
    .order('alerted_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (data) {
    return { hasAlert: true, order: data as any };
  }
  return { hasAlert: false };
}

