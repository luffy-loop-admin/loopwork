# Summary of Updates & Features

## 1. 📱 Download / Install App on Mobile Devices (Dashboard & Login)
- Added an install card directly on both the **Dashboard** and the **Login page**.
- **Android / Chrome / Edge:** One-tap "Download / Install App" button triggers the native browser install prompt.
- **iPhone / iPad (Safari):** Displays clear, visual step-by-step instructions (*Share -> Add to Home Screen*).
- Once installed as a PWA, it runs in full screen just like a native mobile app.

---

## 2. 📋 "All Listings" Section: Payment Status & Date
- In **All listings** (`/listings`):
  - Removed **DA**, **DR**, and **Niche** columns.
  - Added **Payment status** with colored badges:
    - 🟢 **Paid / Clear / Received** (Green)
    - 🟡 **Pending / Remaining / Due** (Yellow)
    - 🔴 **Unpaid / Not Paid** (Red)
  - Added **Date** column displaying the date formatted cleanly.
- Updated the sheet column matcher in `lib/fields.ts`:
  - Recognizes `Payment Status`, `Payment`, `Paid`, `Status`, `Date`, and `Payment Date`.
  - When you resync vendor sheets, the payment status and date are imported directly into the listings table.

---

## 3. 🔔 Admin Order Alert Bell & Vendor Device Ringtone
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
    - **Visual Modal:** Displays a prominent, full-screen popup with:
      - Website name
      - Price (PKR)
      - Date
      - **"🔇 Stop Ring / Got it"** button (silences sound and acknowledges alert)
      - **"View Orders →"** button
- **Test Sound Button:**
  - Added a **🔔 Test Sound** button in the top navigation bar so anyone can test their speaker and hear the ringtone at any time.

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

---

### Step 3: Resync Your Sheets
1. Go to **Sheets** in the portal.
2. If you added a new column in Google Sheets (e.g. `Payment Status` or `Payment Date`):
   - Click **Edit** on that sheet -> **Load columns** -> verify `Payment status` is matched -> **Save & sync**.
3. Go to **All listings** to see your updated sites with Payment Status and Date!
4. Go to **Orders & indexing** to test the 🔔 **Ring** button!
