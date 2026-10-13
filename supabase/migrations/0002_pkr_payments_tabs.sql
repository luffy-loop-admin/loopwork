-- =====================================================================
-- Update 2: PKR pricing, payments, order status, sheet "Status" column, multi-tab sheets
-- Run this ONCE in Supabase -> SQL Editor, after 0001_init.sql.
-- Safe to run twice (it skips what already exists).
-- =====================================================================

-- 1) PKR everywhere ---------------------------------------------------
alter table public.sheet_sources alter column default_currency set default 'PKR';
alter table public.orders        alter column currency          set default 'PKR';
-- Everything you have so far is in PKR, so relabel existing rows too:
update public.sheet_sources set default_currency = 'PKR';
update public.orders        set currency = 'PKR';
update public.vendor_sites  set currency = 'PKR';

-- 2) Orders: assignment status, status text from the sheet, which tab it came from ----
alter table public.orders add column if not exists order_status text not null default 'ordered';
alter table public.orders drop constraint if exists orders_order_status_check;
alter table public.orders add constraint orders_order_status_check check (order_status in ('ordered', 'live', 'cancelled'));
alter table public.orders add column if not exists sheet_status text;   -- 'indexed' / 'not_indexed' as written in the sheet
alter table public.orders drop constraint if exists orders_sheet_status_check;
alter table public.orders add constraint orders_sheet_status_check check (sheet_status in ('indexed', 'not_indexed'));
alter table public.orders add column if not exists source_tab text;
update public.orders set order_status = 'live' where live_url is not null and order_status = 'ordered';
create index if not exists orders_order_status_idx on public.orders (order_status);

-- 3) A third sheet type: payments --------------------------------------
alter table public.sheet_sources drop constraint if exists sheet_sources_kind_check;
alter table public.sheet_sources
  add constraint sheet_sources_kind_check check (kind in ('vendor', 'orders', 'payments'));

-- 4) Payments (typed in by hand and/or imported from a payments sheet) ----
create table if not exists public.payments (
  id          uuid primary key default gen_random_uuid(),
  source_id   uuid references public.sheet_sources (id) on delete cascade,
  source_key  text,
  vendor_id   uuid references public.vendors (id) on delete set null,
  vendor_name text,
  order_id    uuid references public.orders (id) on delete set null,
  amount      numeric(14, 2) not null check (amount > 0),
  currency    text not null default 'PKR',
  paid_date   date not null,
  paid_time   time,
  method      text,
  reference   text,
  notes       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint payments_source_key_unique unique (source_id, source_key)
);
create index if not exists payments_vendor_idx on public.payments (vendor_id);
create index if not exists payments_date_idx   on public.payments (paid_date desc);

-- 5) Views --------------------------------------------------------------
create or replace view public.vendor_spend with (security_invoker = true) as
select
  o.vendor_id,
  coalesce(v.name, o.vendor_name, 'Unknown') as vendor_name,
  coalesce(o.currency, 'PKR')                as currency,
  count(*)::int                              as orders_count,
  coalesce(sum(o.price_paid), 0)             as total_spent
from public.orders o
left join public.vendors v on v.id = o.vendor_id
group by o.vendor_id, coalesce(v.name, o.vendor_name, 'Unknown'), coalesce(o.currency, 'PKR');

-- Per vendor: total ordered, total paid, balance still due (cancelled orders ignored)
create or replace view public.vendor_balance with (security_invoker = true) as
with o as (
  select vendor_id, coalesce(currency, 'PKR') as currency, count(*)::int as orders_count, sum(coalesce(price_paid, 0)) as ordered
  from public.orders
  where vendor_id is not null and order_status <> 'cancelled'
  group by vendor_id, coalesce(currency, 'PKR')
),
p as (
  select vendor_id, currency, count(*)::int as payments_count, sum(amount) as paid
  from public.payments
  where vendor_id is not null
  group by vendor_id, currency
)
select
  coalesce(o.vendor_id, p.vendor_id)            as vendor_id,
  v.name                                        as vendor_name,
  coalesce(o.currency, p.currency)              as currency,
  coalesce(o.orders_count, 0)                   as orders_count,
  coalesce(p.payments_count, 0)                 as payments_count,
  coalesce(o.ordered, 0)                        as ordered_total,
  coalesce(p.paid, 0)                           as paid_total,
  coalesce(o.ordered, 0) - coalesce(p.paid, 0)  as balance
from o
full join p on o.vendor_id = p.vendor_id and o.currency = p.currency
join public.vendors v on v.id = coalesce(o.vendor_id, p.vendor_id);

-- 6) Privileges + RLS (read-only for logged-in users, same rules as before) ----
revoke all on public.payments, public.vendor_balance from anon, authenticated;
grant select on public.payments, public.vendor_balance, public.vendor_spend to authenticated;

alter table public.payments enable row level security;
drop policy if exists "payments: admin sees all, vendor sees own" on public.payments;
create policy "payments: admin sees all, vendor sees own"
  on public.payments for select to authenticated
  using (public.is_admin() or vendor_id = public.current_vendor_id());
