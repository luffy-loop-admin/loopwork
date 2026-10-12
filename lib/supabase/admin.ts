import 'server-only';
import { createClient } from '@supabase/supabase-js';

/** Service-role client. Bypasses RLS. Only ever use it in server code AFTER checking the caller is an admin (or a cron secret). */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Supabase environment variables are missing (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY).');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
