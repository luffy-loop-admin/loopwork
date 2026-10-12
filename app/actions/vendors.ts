'use server';
import { revalidatePath } from 'next/cache';
import { getAdmin } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { bool, str } from '@/lib/form';
import type { ActionResult } from '@/lib/types';

const DENIED: ActionResult = { ok: false, message: 'Not allowed.' };
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function createVendor(formData: FormData): Promise<ActionResult> {
  if (!(await getAdmin())) return DENIED;
  const name = str(formData, 'name');
  const email = str(formData, 'email').toLowerCase();
  const password = String(formData.get('password') ?? '');
  const notes = str(formData, 'notes');
  if (!name) return { ok: false, message: 'Enter the vendor name.' };
  if (!EMAIL.test(email)) return { ok: false, message: 'Enter a valid login email.' };
  if (password.length < 10) return { ok: false, message: 'Password must be at least 10 characters.' };

  const db = createAdminClient();
  const { data: vendor, error: vErr } = await db
    .from('vendors')
    .insert({ name, contact_email: email, notes: notes || null })
    .select('id')
    .single();
  if (vErr || !vendor) {
    return { ok: false, message: vErr?.code === '23505' ? 'A vendor with that name already exists.' : vErr?.message ?? 'Could not create vendor.' };
  }

  const { data: created, error: uErr } = await db.auth.admin.createUser({ email, password, email_confirm: true });
  if (uErr || !created?.user) {
    await db.from('vendors').delete().eq('id', vendor.id);
    return { ok: false, message: uErr?.message ?? 'Could not create the login.' };
  }

  const { error: pErr } = await db.from('profiles').insert({ id: created.user.id, email, role: 'vendor', vendor_id: vendor.id });
  if (pErr) {
    await db.auth.admin.deleteUser(created.user.id);
    await db.from('vendors').delete().eq('id', vendor.id);
    return { ok: false, message: pErr.message };
  }
  revalidatePath('/admin/vendors');
  return { ok: true, message: `Vendor created. They can sign in with ${email}.` };
}

export async function updateVendor(formData: FormData): Promise<ActionResult> {
  if (!(await getAdmin())) return DENIED;
  const id = str(formData, 'id');
  const name = str(formData, 'name');
  if (!id || !name) return { ok: false, message: 'Vendor name is required.' };
  const db = createAdminClient();
  const { error } = await db.from('vendors').update({ name, notes: str(formData, 'notes') || null }).eq('id', id);
  if (error) return { ok: false, message: error.code === '23505' ? 'A vendor with that name already exists.' : error.message };
  revalidatePath('/admin/vendors');
  return { ok: true, message: 'Saved.' };
}

/** Disable/enable: blocks login and hides the vendor's sites from search. Data is kept. */
export async function setVendorActive(vendorId: string, active: boolean): Promise<ActionResult> {
  if (!(await getAdmin())) return DENIED;
  const db = createAdminClient();
  const { error } = await db.from('vendors').update({ active }).eq('id', vendorId);
  if (error) return { ok: false, message: error.message };
  const { data: profiles } = await db.from('profiles').select('id').eq('vendor_id', vendorId);
  for (const p of (profiles ?? []) as { id: string }[]) {
    await db.auth.admin.updateUserById(p.id, { ban_duration: active ? 'none' : '876000h' });
  }
  revalidatePath('/admin/vendors');
  revalidatePath('/');
  return { ok: true, message: active ? 'Vendor enabled.' : 'Vendor disabled.' };
}

export async function resetVendorPassword(formData: FormData): Promise<ActionResult> {
  if (!(await getAdmin())) return DENIED;
  const vendorId = str(formData, 'vendor_id');
  const password = String(formData.get('password') ?? '');
  if (password.length < 10) return { ok: false, message: 'Password must be at least 10 characters.' };
  const db = createAdminClient();
  const { data: profiles } = await db.from('profiles').select('id').eq('vendor_id', vendorId).eq('role', 'vendor');
  const list = (profiles ?? []) as { id: string }[];
  if (!list.length) return { ok: false, message: 'This vendor has no login.' };
  for (const p of list) {
    const { error } = await db.auth.admin.updateUserById(p.id, { password });
    if (error) return { ok: false, message: error.message };
  }
  return { ok: true, message: 'Password changed. Share it with the vendor securely.' };
}
