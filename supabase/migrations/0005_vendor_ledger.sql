-- =====================================================================
-- Update 5: Vendor Ledger Sheet Type, Tab Multi-Select & Google Write-Back
-- Run ONCE in Supabase -> SQL Editor (after 0004). Safe to run multiple times.
-- =====================================================================

-- 1) Extend sheet_sources.kind to include 'ledger'
alter table public.sheet_sources drop constraint if exists sheet_sources_kind_check;
alter table public.sheet_sources
  add constraint sheet_sources_kind_check check (kind in ('vendor', 'orders', 'payments', 'ledger'));

-- Ledger sources must be bound to a vendor
alter table public.sheet_sources drop constraint if exists vendor_sheet_needs_vendor;
alter table public.sheet_sources
  add constraint vendor_sheet_needs_vendor check (kind not in ('vendor', 'ledger') or vendor_id is not null);

-- 2) Settings stored on sheet_sources for ledger and multi-tab sync
alter table public.sheet_sources add column if not exists order_tabs             text[];
alter table public.sheet_sources add column if not exists auto_include_new_tabs  boolean not null default true;
alter table public.sheet_sources add column if not exists payment_tab            text;
alter table public.sheet_sources add column if not exists payment_mapping        jsonb not null default '{}'::jsonb;
alter table public.sheet_sources add column if not exists require_live_link      boolean not null default true;
alter table public.sheet_sources add column if not exists write_status_back      boolean not null default false;
alter table public.sheet_sources add column if not exists last_writeback_at      timestamptz;
alter table public.sheet_sources add column if not exists last_writeback_error   text;
alter table public.sheet_sources add column if not exists sync_diagnostics        jsonb;

-- 3) Originating tab for vendor price listings
alter table public.vendor_sites add column if not exists source_tab text;
create index if not exists vendor_sites_source_tab_idx on public.vendor_sites (source_tab);

-- 4) Inferred month for orders (first day of month YYYY-MM-01) for date/month/week filtering
alter table public.orders add column if not exists order_month date;
create index if not exists orders_order_month_idx on public.orders (order_month);

-- Backfill order_month for any existing orders with an order_date
update public.orders
set order_month = date_trunc('month', order_date)::date
where order_month is null and order_date is not null;

-- 5) RLS policy: allow vendors to view their own ledger sources
drop policy if exists "sheet_sources: admin sees all, vendor sees own" on public.sheet_sources;
create policy "sheet_sources: admin sees all, vendor sees own"
  on public.sheet_sources for select to authenticated
  using (public.is_admin() or (kind in ('vendor', 'ledger') and vendor_id = public.current_vendor_id()));

-- 6) View for vendor months aggregation (avoids 1000-row PostgREST limit)
create or replace view public.vendor_months with (security_invoker = true) as
select
  vendor_id,
  coalesce(date_trunc('month', order_date)::date, order_month) as month,
  count(*)::int as links_count,
  coalesce(sum(price_paid), 0)::numeric as total_price
from public.orders
where vendor_id is not null
  and coalesce(order_status, '') <> 'cancelled'
  and coalesce(date_trunc('month', order_date)::date, order_month) is not null
group by vendor_id, coalesce(date_trunc('month', order_date)::date, order_month)
order by month desc;

-- 7) Privileges: grant select to authenticated
grant select on public.sheet_sources, public.vendor_sites, public.orders, public.vendor_months to authenticated;

