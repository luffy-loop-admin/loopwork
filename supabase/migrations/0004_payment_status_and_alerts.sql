-- =====================================================================
-- Update 4: Listing Payment Status & Order Alert Bell
-- Run ONCE in Supabase -> SQL Editor (after 0003). Safe to run multiple times.
-- =====================================================================

-- 1) Payment status and date on vendor listings
alter table public.vendor_sites add column if not exists payment_status text;
alter table public.vendor_sites add column if not exists payment_date   date;

-- 2) Payment status on orders
alter table public.orders add column if not exists payment_status text;

-- 3) Order alerts for vendor device notifications
alter table public.orders add column if not exists alerted_at      timestamptz;
alter table public.orders add column if not exists acknowledged_at timestamptz;

create index if not exists orders_alerted_idx on public.orders (vendor_id, alerted_at) where alerted_at is not null;
