import 'server-only';
import { cache } from 'react';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import type { Profile } from '@/lib/types';

/** Returns the logged-in user's profile, or null if logged out / no access / vendor disabled. */
export const getSessionProfile = cache(async (): Promise<Profile | null> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from('profiles')
    .select('id,email,role,vendor_id,vendors(name,active)')
    .eq('id', user.id)
    .maybeSingle();
  if (!data) return null;

  const row = data as any;
  const vendor = Array.isArray(row.vendors) ? row.vendors[0] : row.vendors;
  if (row.role === 'vendor' && (!vendor || !vendor.active)) return null; // disabled vendor
  return {
    id: row.id,
    email: row.email,
    role: row.role,
    vendor_id: row.vendor_id,
    vendor_name: vendor?.name ?? null,
  };
});

export async function requireProfile(): Promise<Profile> {
  const p = await getSessionProfile();
  if (!p) redirect('/login?error=no-access');
  return p;
}

export async function requireAdmin(): Promise<Profile> {
  const p = await requireProfile();
  if (p.role !== 'admin') redirect('/');
  return p;
}

/** For server actions / API routes: returns the admin profile or null (never redirects). */
export async function getAdmin(): Promise<Profile | null> {
  const p = await getSessionProfile();
  return p && p.role === 'admin' ? p : null;
}
