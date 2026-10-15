-- =====================================================================
-- Diagnostics Script: Vendor Guest Post Portal
-- Run in Supabase -> SQL Editor (READ-ONLY queries)
-- =====================================================================

-- 1. What kind of payments exist, and how much money in each group
select
  coalesce(s.kind, 'manual') as origin,
  count(*) as rows,
  coalesce(sum(p.amount), 0) as total_pkr
from public.payments p
left join public.sheet_sources s on s.id = p.source_id
group by 1
order by 1;

-- 2. Payments with no vendor (these are never counted in the balance)
select
  count(*) as payments_without_vendor,
  coalesce(sum(amount), 0) as total_unassigned_pkr
from public.payments
where vendor_id is null;

-- 3. Possible duplicates (same vendor, date, time, amount, reference)
select
  p.vendor_id,
  coalesce(v.name, p.vendor_name, 'Unknown') as vendor_name,
  p.paid_date,
  p.paid_time,
  p.amount,
  p.reference,
  count(*) as copies
from public.payments p
left join public.vendors v on v.id = p.vendor_id
group by p.vendor_id, coalesce(v.name, p.vendor_name, 'Unknown'), p.paid_date, p.paid_time, p.amount, p.reference
having count(*) > 1
order by copies desc, p.paid_date desc;

-- 4. Per vendor: ordered, paid, balance as the app computes them
select
  vendor_name,
  currency,
  orders_count,
  payments_count,
  ordered_total,
  paid_total,
  balance
from public.vendor_balance
order by vendor_name;

-- 5. Orders without vendor or without order_month
select
  count(*) filter (where vendor_id is null) as orders_without_vendor,
  count(*) filter (where order_month is null and order_date is null) as orders_missing_both_dates,
  count(*) filter (where order_month is null and order_date is not null) as orders_missing_order_month_only
from public.orders;

-- 6. Current sheet sources configuration
select
  id,
  kind,
  label,
  active,
  order_tabs,
  payment_tab,
  auto_include_new_tabs,
  write_status_back,
  last_synced_at,
  last_sync_status,
  last_sync_message
from public.sheet_sources
order by kind, created_at;
