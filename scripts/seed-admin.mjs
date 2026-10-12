// Optional alternative to supabase/seed.sql: creates the admin login AND profile in one go.
// Usage: put ADMIN_EMAIL / ADMIN_PASSWORD (+ Supabase keys) in .env.local, then: npm run seed:admin
import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const email = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
const password = process.env.ADMIN_PASSWORD || '';

if (!url || !key || !email || password.length < 10) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ADMIN_EMAIL or ADMIN_PASSWORD (min 10 chars).');
  process.exit(1);
}

const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

let userId;
const created = await db.auth.admin.createUser({ email, password, email_confirm: true });
if (created.error) {
  const { data, error } = await db.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (error) { console.error(error.message); process.exit(1); }
  const existing = data.users.find((u) => (u.email || '').toLowerCase() === email);
  if (!existing) { console.error(created.error.message); process.exit(1); }
  userId = existing.id;
  await db.auth.admin.updateUserById(userId, { password, email_confirm: true });
  console.log('User already existed - password updated.');
} else {
  userId = created.data.user.id;
  console.log('Auth user created.');
}

const { error: pErr } = await db
  .from('profiles')
  .upsert({ id: userId, email, role: 'admin', vendor_id: null }, { onConflict: 'id' });
if (pErr) { console.error(pErr.message); process.exit(1); }
console.log(`Done. ${email} is now an admin. You can log in.`);
