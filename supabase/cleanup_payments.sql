-- =====================================================================
-- Payments Cleanup & Reset Script: Vendor Guest Post Portal
-- Run in Supabase -> SQL Editor
-- =====================================================================

-- Step 1: Delete all sheet-imported payments
-- (Manually typed payments with source_id is null are kept safe)
delete from public.payments where source_id is not null;

-- Optional Step 1b: Delete manually typed payments too
-- ONLY uncomment the line below if you want a totally empty start for payments:
-- delete from public.payments where source_id is null;

-- Step 2: Backfill order_month for any existing orders with an order_date
update public.orders
set order_month = date_trunc('month', order_date)::date
where order_month is null and order_date is not null;

-- Step 3: Deactivate any old standalone "payments" sources that are superseded by vendor ledger
-- update public.sheet_sources set active = false where kind = 'payments';

-- After running this SQL, go to the portal and click "Sync all now" (or "Reset synced payments" on the Payments page).
-- Every ledger source will cleanly re-import its Payment History tab with zero duplicates.
