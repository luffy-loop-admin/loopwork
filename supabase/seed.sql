-- =====================================================================
-- Make an existing Supabase Auth user the ADMIN.
-- 1) Supabase -> Authentication -> Users -> "Add user" (tick "Auto Confirm User").
-- 2) Put that same email below, then run this in the SQL Editor.
-- =====================================================================
insert into public.profiles (id, email, role)
select id, email, 'admin'
from auth.users
where lower(email) = lower('you@example.com')   -- <-- CHANGE THIS
on conflict (id) do update set role = 'admin', vendor_id = null;

-- Check it worked (should return one row with role = admin):
select id, email, role from public.profiles;
