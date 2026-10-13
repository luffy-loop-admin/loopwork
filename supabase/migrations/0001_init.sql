-- =====================================================================
-- Vendor Guest Post Portal - initial schema, RLS and views
-- Run this whole file once in Supabase -> SQL Editor.
-- =====================================================================

-- ---------- Tables ----------
create table public.vendors (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  contact_email text,
  notes         text,
  active        boolean not null default true,
  created_at    timestamptz not null default now()
);
create unique index vendors_name_lower_key on public.vendors (lower(name));

create table public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  email      text not null,
  role       text not null check (role in ('admin', 'vendor')),
  vendor_id  uuid references public.vendors (id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint vendor_role_needs_vendor check (role <> 'vendor' or vendor_id is not null)
);
create index profiles_vendor_idx on public.profiles (vendor_id);

-- One row per Google Sheet. kind = 'vendor' (price list) or 'orders' (my purchase history)
create table public.sheet_sources (
  id                uuid primary key default gen_random_uuid(),
  kind              text not null check (kind in ('vendor', 'orders')),
  vendor_id         uuid references public.vendors (id) on delete cascade,
  label             text,
  sheet_url         text not null,
  spreadsheet_id    text not null,
  tab_name          text,
  header_row        int  not null default 1 check (header_row >= 1),
  default_currency  text not null default 'USD',
  mapping           jsonb not null default '{}'::jsonb,
  active            boolean not null default true,
  last_synced_at    timestamptz,
  last_sync_status  text check (last_sync_status in ('ok', 'error')),
  last_sync_message text,
  last_sync_rows    int,
  created_at        timestamptz not null default now(),
  constraint vendor_sheet_needs_vendor check (kind <> 'vendor' or vendor_id is not null)
);
create index sheet_sources_vendor_idx on public.sheet_sources (vendor_id);

-- Every site found in vendor sheets (normalised domain)
create table public.vendor_sites (
  id        uuid primary key default gen_random_uuid(),
  source_id uuid not null references public.sheet_sources (id) on delete cascade,
  vendor_id uuid not null references public.vendors (id) on delete cascade,
  domain    text not null,
  site_url  text,
  price     numeric(12, 2),
  currency  text,
  da        int,
  dr        int,
  traffic   bigint,
  niche     text,
  synced_at timestamptz not null default now(),
  constraint vendor_sites_source_domain_key unique (source_id, domain)
);
create index vendor_sites_domain_idx on public.vendor_sites (domain);
create index vendor_sites_vendor_idx on public.vendor_sites (vendor_id);

-- My purchase history (+ indexing status of the live link)
create table public.orders (
  id               uuid primary key default gen_random_uuid(),
  source_id        uuid references public.sheet_sources (id) on delete set null,
  source_key       text,
  domain           text not null,
  live_url         text,
  vendor_id        uuid references public.vendors (id) on delete set null,
  vendor_name      text,
  order_date       date,
  price_paid       numeric(12, 2),
  currency         text default 'USD',
  notes            text,
  indexed_status   text not null default 'pending' check (indexed_status in ('pending', 'indexed', 'not_indexed')),
  last_checked_at  timestamptz,
  index_result_count int,
  index_error      text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint orders_source_key_unique unique (source_id, source_key)
);
create index orders_domain_idx  on public.orders (domain);
create index orders_vendor_idx  on public.orders (vendor_id);
create index orders_status_idx  on public.orders (indexed_status);

-- ---------- Helper functions (security definer so policies never recurse) ----------
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin');
$$;

-- Returns the vendor the logged-in user belongs to, only while that vendor is active.
create or replace function public.current_vendor_id()
returns uuid language sql stable security definer set search_path = public as $$
  select p.vendor_id
  from public.profiles p
  join public.vendors v on v.id = p.vendor_id
  where p.id = auth.uid() and p.role = 'vendor' and v.active;
$$;

revoke all on function public.is_admin() from public, anon;
revoke all on function public.current_vendor_id() from public, anon;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.current_vendor_id() to authenticated;

-- ---------- Views (run with the caller's permissions, so RLS still applies) ----------
create view public.vendor_spend with (security_invoker = true) as
select
  o.vendor_id,
  coalesce(v.name, o.vendor_name, 'Unknown') as vendor_name,
  coalesce(o.currency, 'USD')                as currency,
  count(*)::int                              as orders_count,
  coalesce(sum(o.price_paid), 0)             as total_spent
from public.orders o
left join public.vendors v on v.id = o.vendor_id
group by o.vendor_id, coalesce(v.name, o.vendor_name, 'Unknown'), coalesce(o.currency, 'USD');

create view public.vendor_site_counts with (security_invoker = true) as
select vendor_id, count(*)::int as sites_count
from public.vendor_sites
group by vendor_id;

-- ---------- Privileges: logged-in users can ONLY read. Nobody but the server (service role) can write. ----------
revoke all on public.vendors, public.profiles, public.sheet_sources, public.vendor_sites, public.orders,
              public.vendor_spend, public.vendor_site_counts from anon, authenticated;
grant select on public.vendors, public.profiles, public.sheet_sources, public.vendor_sites, public.orders,
                public.vendor_spend, public.vendor_site_counts to authenticated;

-- ---------- Row Level Security ----------
alter table public.vendors       enable row level security;
alter table public.profiles      enable row level security;
alter table public.sheet_sources enable row level security;
alter table public.vendor_sites  enable row level security;
alter table public.orders        enable row level security;

create policy "vendors: admin sees all, vendor sees own"
  on public.vendors for select to authenticated
  using (public.is_admin() or id = public.current_vendor_id());

create policy "profiles: admin sees all, user sees self"
  on public.profiles for select to authenticated
  using (public.is_admin() or id = auth.uid());

create policy "sheet_sources: admin sees all, vendor sees own"
  on public.sheet_sources for select to authenticated
  using (public.is_admin() or (kind = 'vendor' and vendor_id = public.current_vendor_id()));

create policy "vendor_sites: admin sees all, vendor sees own"
  on public.vendor_sites for select to authenticated
  using (public.is_admin() or vendor_id = public.current_vendor_id());

create policy "orders: admin sees all, vendor sees orders placed with them"
  on public.orders for select to authenticated
  using (public.is_admin() or vendor_id = public.current_vendor_id());

-- No INSERT / UPDATE / DELETE policies exist and the privileges are revoked above,
-- so vendors (and even the admin's browser session) cannot change data directly.
-- All writes go through server code using the service-role key after an admin check.
