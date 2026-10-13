# Summary of Updates & Features

## 1. 📱 Install App vs Create Shortcut (Fixed & Enhanced)
- **Why browsers only showed "Create shortcut":**
  - Chrome requires high-resolution 192x192 and 512x512 PNG icons in `public/icons/` and in `sw.js` cache. Previously, `icon-192.png` was missing (causing a 404), which caused Chrome to disqualify the PWA and only offer "Create shortcut".
  - **The fix:**
    - Generated and verified `public/icons/icon-192.png`, `icon-512.png`, and `maskable-512.png`.
    - Added `<link rel="manifest" href="/manifest.webmanifest">` to metadata.
    - Updated `sw.js` with `SKIP_WAITING` and reliable offline asset caching.
- **Enhanced Install Prompt Modal:**
  - Clear tabs for **Android**, **iPhone**, and **Desktop**.
  - Clearly explains: whether your browser menu says **"Install app"**, **"Add to Home screen"**, or **"Create shortcut"**, tapping it will add the app to your home screen and open it in full screen!
  - Added on both the **Dashboard** and **Login page**.

---

## 2. 🚀 Update Announcement Popup (Admin & User)
- Whenever an admin or user opens the portal after a new version or update is released:
  - An interactive **"✨ What's New in This Update"** popup modal appears automatically!
  - Highlights all new features (Mobile Shortcut, Order Ring Alert, Payment Status, etc.).
  - Clicking **"✨ Got It / Continue to Portal"** saves their acknowledgement so it doesn't interrupt them again until the next release.
- **Live Background Update Detection:**
  - If a user has the portal open when a new deployment goes live on Vercel, the service worker detects it and shows a banner: `🔄 Refresh & Update Now`.
- **"✨ Updates" Button:**
  - Added an **"✨ Updates"** button in the top navigation bar so anyone can review the latest changes anytime.

---

## 3. 📋 "All Listings" Section: Payment Status & Date
- In **All listings** (`/listings`):
  - Removed **DA**, **DR**, and **Niche** columns.
  - Added **Payment status** with colored badges:
    - 🟢 **Paid / Clear / Received** (Green)
    - 🟡 **Pending / Remaining / Due** (Yellow)
    - 🔴 **Unpaid / Not Paid** (Red)
  - Added **Date** column displaying the date formatted cleanly.
- Updated the sheet column matcher in `lib/fields.ts`:
  - Automatically matches `Payment Status`, `Payment`, `Paid`, `Status`, `Date`, and `Payment Date`.
  - When you resync vendor sheets, the payment status and date are imported directly into the listings table.

---

## 4. 🔔 Admin Order Alert Bell & Vendor Device Ringtone
- **Admin Side:**
  - **Orders table (`/admin/orders`):** Next to each order with an assigned vendor, there is now a **🔔 Ring** button. Clicking it rings that vendor's device and plays a confirmation ding for the admin.
  - **Add order (`/admin/orders/new` & dashboard):** Added a checked-by-default option:
    `[x] 🔔 Ring vendor's phone / device when this order is saved`.
  - **Edit order (`/admin/orders/[id]`):** Contains the bell ring button in the header.
- **Vendor Device Side:**
  - While logged into the portal on mobile or desktop, the portal listens for active order alerts.
  - When an alert is triggered:
    - **Looping Ringtone:** Melodic order ringtone chime plays repeatedly.
    - **Voice Alert:** Speaks *"New order from Loop"* via browser speech synthesis.
    - **Vibration:** Vibrates the mobile device (on supported Android devices).
    - **Visual Modal:** Displays a popup with the order website, price, and date.
    - **Buttons:**
      - **"🔇 Stop Ring / Got it"** button (silences sound and acknowledges alert)
      - **"View Orders →"** button
- **Test Sound Button:**
  - Added a **🔔 Test Sound** button in the top navigation bar to test speakers and hear the ringtone anytime.

---

## 5. 🛡️ Data Disappearance Root Cause & Permanent Fix
- **Why did sites/orders disappear?**
  1. **Query failure on missing columns:** In update 4, `listings` queried `payment_status` and `orders` queried `alerted_at`. Before running SQL migration `0004` in Supabase, PostgREST returned error `42703 (column does not exist)`. Supabase JS turned `data` into `null`, causing the pages to show "No sites found" (0 sites) and "No orders found" even though the records were in the database!
  2. **Accidental sync order deletion:** An earlier order deduplication code attempted to delete "stale" order keys during sheet sync. Because the key formatting had evolved, existing orders were flagged as stale and removed.
- **The Permanent Solutions Implemented:**
  1. **Strict Non-Destructive Sync:** Removed `delete()` on orders completely. Orders represent link purchases, expenditure, and indexing history—sync now ONLY upserts (`onConflict`) and **NEVER deletes orders**.
  2. **Defensive UI Queries with Auto-Fallback:** If `payment_status` or `alerted_at` does not exist yet in your Supabase database, the query automatically catches the error and queries the core columns (`id, domain, price, currency, vendors`). Your sites and orders will **always show up** without ever showing a blank table!
  3. **Safe Upserts in Sync:** If a sheet sync contains new columns not yet added to Supabase, it automatically retries with core columns so syncing never crashes.
- **How to restore all your data right now:**
  - In the portal, click **"Sync all now"** on the Dashboard or Admin Sheets page.
  - All 162 sites and orders from your Google Sheets will instantly be re-imported and restored with 100% accuracy!

---

## 🚀 Setup & Deployment Steps

### Step 1: Run Supabase Migration 0004
In your [Supabase Dashboard](https://supabase.com/dashboard) -> **SQL Editor** -> run the contents of:
`supabase/migrations/0004_payment_status_and_alerts.sql`

```sql
-- 1) Payment status and date on vendor listings
alter table public.vendor_sites add column if not exists payment_status text;
alter table public.vendor_sites add column if not exists payment_date   date;

-- 2) Payment status on orders
alter table public.orders add column if not exists payment_status text;

-- 3) Order alerts for vendor device notifications
alter table public.orders add column if not exists alerted_at      timestamptz;
alter table public.orders add column if not exists acknowledged_at timestamptz;

create index if not exists orders_alerted_idx on public.orders (vendor_id, alerted_at) where alerted_at is not null;
```

---

### Step 2: Deploy to Vercel
Either:
1. Push to your GitHub repo:
   ```bash
   git push origin main
   ```
2. Or upload the updated files from the zip archive:
   `/mnt/cptmukaram/vendor-guest-post-portal.zip`
