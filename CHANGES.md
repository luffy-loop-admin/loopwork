# What changed in this version (replace these files, then push)

## Latest Update: Vendor Sheet Sync (Live link, Status, Date, DOC column)
1. **Vendor Sheet Column Matching:** Added fields for **Live link URL**, **Status**, **Date / Order date**, **Article doc link (DOC)**, and **Pair** to the vendor sheet mapper. When clicking "Load columns", headers like `Live Link`, `Status`, `Date`, `Article Doc` / `DOC` now auto-match automatically.
2. **Vendor Sheet Synchronization:** When syncing a vendor sheet, rows containing live links or order data are automatically imported into `orders` (assigned to that vendor), as well as `vendor_sites` for search availability.
3. **Indexing Checks & History:** All live links synced from vendor sheets are automatically tracked for Google indexing via Serper, displayed with their status and doc link in **Orders & indexing**, and counted in the vendor's balance and spend.

## Step 1 - Supabase
If you haven't already run migration 0003:
In Supabase -> SQL Editor run:
- `supabase/migrations/0003_order_pair_article.sql`
(If you already ran it, no SQL changes needed!)

## Step 2 - Upload to GitHub
Easiest: unzip, then on GitHub use **Add file -> Upload files**, drag in EVERYTHING (folders included). Files with the same name are replaced.
Vercel redeploys on its own. No new environment variables are needed.

## New files
- supabase/migrations/0002_pkr_payments_tabs.sql
- supabase/migrations/0003_order_pair_article.sql
- lib/config.ts
- app/actions/payments.ts
- app/manifest.ts
- app/(app)/admin/payments/page.tsx
- app/(app)/admin/orders/new/page.tsx
- app/(app)/orders/page.tsx            (vendor: orders assigned to them)
- app/(app)/payments/page.tsx          (vendor: payments made to them)
- components/InstallPrompt.tsx, components/PwaRegister.tsx
- public/sw.js, public/offline.html, public/favicon.png, public/icons/*.png
- Order-History-Template.xlsx

## Changed files
- lib/: fields.ts, format.ts, parse.ts, sheets.ts, sync.ts, indexing.ts
- app/actions/: auth.ts (clear login errors), sheets.ts, orders.ts
- app/layout.tsx, middleware.ts, app/login/page.tsx
- app/(app)/: layout.tsx, page.tsx, search/page.tsx
- app/(app)/admin/: orders/page.tsx, orders/[id]/page.tsx, sheets/page.tsx, sheets/new/page.tsx, vendors/page.tsx
- components/: OrderFields.tsx, SheetForm.tsx
- app/(app)/admin/orders/[id]/page.tsx also shows Pair + Article doc
- README.md

## Already included from your earlier fixes
- Private key reader that accepts messy pasted keys (lib/sheets.ts)
- Login shows the real error message (app/actions/auth.ts)
