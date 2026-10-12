# Vendor Guest Post Portal

Search any website and instantly see **which vendor sells a guest post on it, cheapest first**, whether **you already bought a link there**, and whether your live links are **indexed in Google**.

- **Next.js 15** (App Router) + **Tailwind**, hosted on **Vercel**
- **Supabase** for the database and email/password login (Row Level Security)
- **Google Sheets API** (service account) to import vendor price lists and your order history
- **Serper.dev** to check indexing (no Google scraping)

---

## What you get

| Who | What they can do |
|---|---|
| **Admin (you)** | Everything: vendors, sheets, sync, search, orders, indexing checks, spend per vendor |
| **Vendor** | Sign in, search, bulk search, see **only their own** listings and orders placed with them. **Cannot edit or delete anything.** |

How the safety works: the database only lets logged-in users **read**, and only rows that belong to them (Row Level Security in `supabase/migrations/0001_init.sql`). Every change is made by server code that first checks you are the admin. Indexing status is shown to the admin only.

---

## Before you start (about 45 minutes)

Create free accounts at: **GitHub**, **Supabase**, **Google Cloud**, **Serper.dev**, **Vercel**.

> **Important about Vercel plans:** Vercel's free *Hobby* plan only allows cron jobs that run **once per day**. This project asks for the sheet sync **every 6 hours** (`vercel.json`), which needs the **Pro** plan; on Hobby the deployment will be rejected. See [Step 7](#step-7--cron-jobs-hobby-vs-pro) for the two easy options.

---

## Step 1 - Put the code on GitHub

1. Unzip this project on your computer.
2. On github.com click **New repository**, name it `guest-post-portal`, make it **Private**, click **Create**.
3. Click **uploading an existing file**, drag in **all files and folders from the unzipped project** (keep the folder structure; `.env.example` is fine to upload, never upload a real `.env`). Click **Commit changes**.

---

## Step 2 - Supabase (database + login)

1. supabase.com -> **New project**. Choose a name, a strong database password (save it) and the region closest to you. Wait ~2 minutes.
2. **Create the tables:** left menu **SQL Editor** -> **New query**. Open `supabase/migrations/0001_init.sql` from this project, copy everything, paste it, click **Run**. You should see "Success. No rows returned".
3. **Turn off public sign-ups** (only you create accounts): **Authentication** -> **Sign In / Providers** (or *Providers -> Email*) -> switch **Allow new users to sign up** **OFF** -> Save.
4. **Copy your keys:** **Project Settings** -> **API** (or *API Keys*). You need three values:
   - **Project URL** -> `NEXT_PUBLIC_SUPABASE_URL`
   - **anon / public key** -> `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - **service_role key** -> `SUPABASE_SERVICE_ROLE_KEY` (**secret, never share it**)
5. **Create your admin login:**
   1. **Authentication** -> **Users** -> **Add user** -> **Create new user**. Enter your email and a strong password and tick **Auto Confirm User**.
   2. **SQL Editor** -> **New query**. Open `supabase/seed.sql`, replace `you@example.com` with your email, paste and **Run**. The last line shows one row with `role = admin`.

   *(Alternative for people with Node installed: fill `ADMIN_EMAIL` / `ADMIN_PASSWORD` in `.env.local` and run `npm run seed:admin`.)*

---

## Step 3 - Google service account (lets the app read your sheets)

1. console.cloud.google.com -> create a **New Project** (any name).
2. **APIs & Services** -> **Library** -> search **Google Sheets API** -> **Enable**.
3. **APIs & Services** -> **Credentials** -> **Create credentials** -> **Service account**. Name it `portal-reader`, click **Done** (no roles needed).
4. Click the new service account -> tab **Keys** -> **Add key** -> **Create new key** -> **JSON** -> **Create**. A `.json` file downloads. Keep it private.
5. Open that file in a text editor. You need two values:
   - `client_email` -> `GOOGLE_SERVICE_ACCOUNT_EMAIL`
   - `private_key` -> `GOOGLE_PRIVATE_KEY` (copy the whole value including `-----BEGIN PRIVATE KEY-----` ... `-----END PRIVATE KEY-----\n`, keep the `\n` characters exactly as they are)
6. **Share every sheet with the service account:** open each vendor Google Sheet **and** your order-history sheet -> **Share** -> paste the `client_email` address -> role **Viewer** -> uncheck "Notify" -> **Share**. *If you skip this, sync fails with a "could not open this sheet" message.*

---

## Step 4 - Serper.dev (indexing check)

1. serper.dev -> sign up -> **API Key** -> copy it -> `SERPER_API_KEY`.
2. Each link check uses 1 search credit. 1,000 live links checked daily = about 30,000 credits a month, so pick a plan to match.

The app searches `site:<your live link>` (without `https://`) and treats **at least one result as Indexed**. No result = **Not indexed**.

---

## Step 5 - Choose a cron secret

Make up a long random text (40+ characters, letters and numbers) -> `CRON_SECRET`. It stops strangers from triggering your sync URLs. Vercel sends it automatically to your cron jobs.

---

## Step 6 - Deploy on Vercel

1. vercel.com -> **Add New** -> **Project** -> **Import** your GitHub repository.
2. Framework is detected as **Next.js**. Open **Environment Variables** and add all of these (names exactly as written):

   | Name | Value |
   |---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | from Step 2 |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | from Step 2 |
   | `SUPABASE_SERVICE_ROLE_KEY` | from Step 2 |
   | `GOOGLE_SERVICE_ACCOUNT_EMAIL` | from Step 3 |
   | `GOOGLE_PRIVATE_KEY` | from Step 3 (paste as-is, with the `\n` characters) |
   | `SERPER_API_KEY` | from Step 4 |
   | `CRON_SECRET` | from Step 5 |

3. Click **Deploy**. When it finishes, open the URL Vercel gives you and sign in with your admin email and password.

If you change any variable later, go to **Deployments** -> **...** -> **Redeploy**.

---

## Step 7 - Cron jobs (Hobby vs Pro)

`vercel.json` defines two jobs:

| Job | Path | Schedule |
|---|---|---|
| Sheet sync | `/api/cron/sync` | every 6 hours (`0 */6 * * *`) |
| Indexing check | `/api/cron/index-check` | daily at 03:30 UTC (`30 3 * * *`) |

**Option A - Vercel Pro:** nothing to do. Leave `vercel.json` as is.

**Option B - Free Hobby plan:** edit `vercel.json` and change the sync schedule to once a day, e.g. `"0 3 * * *"`. Then, if you still want 6-hourly syncs for free, use any free scheduler that can call a URL, e.g. a GitHub Action. Create `.github/workflows/sync.yml` in your repo:

```yaml
name: Sync sheets
on:
  schedule: [{ cron: "0 */6 * * *" }]
  workflow_dispatch:
jobs:
  sync:
    runs-on: ubuntu-latest
    steps:
      - run: curl -fsS -H "Authorization: Bearer ${{ secrets.CRON_SECRET }}" "${{ secrets.APP_URL }}/api/cron/sync"
```

Add repository secrets `CRON_SECRET` and `APP_URL` (your full Vercel address, no trailing slash) under **Settings -> Secrets and variables -> Actions**. (cron-job.org works the same way: call the URL with the header `Authorization: Bearer YOUR_SECRET`.)

**Test a cron job by hand** (any computer with `curl`):

```
curl -H "Authorization: Bearer YOUR_CRON_SECRET" https://YOUR-APP.vercel.app/api/cron/sync
```

You should get `{"ok":true,...}`. Without the header you get `Unauthorized`.

Notes: the index check processes links **oldest-checked first** and stops before the time limit; anything left is picked up on the next run, so very large lists catch up over a couple of days (or run the job more often).

---

## Step 8 - First use (the 10-minute tour)

1. **Vendors** -> *Add a vendor*: name, their login email and a password (10+ characters). Send them the app URL and password.
2. **Sheets** -> *Add vendor sheet*: choose the vendor, paste the sheet link, optionally the tab name and header row number, click **Load columns**, check that Website and Price are matched correctly (DA, DR, Traffic, Niche optional), then **Add sheet and sync**. The first sync runs immediately.
3. **Sheets** -> *Add order history sheet*: same idea, mapping website, live link, vendor, date and payment. Re-syncing never creates duplicates (the live link identifies an order) and never loses indexing history.
4. **Search**: type `example.com`. You get **Available from** (cheapest first) and **Already bought**. Nothing found anywhere shows **Not available**.
5. **Bulk search**: paste a list, filter by Available / Not available / Already bought, download as CSV.
6. **Orders & indexing**: see the status of every live link. **Check now** per row, **Check all now** for everything, and the **Not indexed** tab for your problem list. Orders can also be added or edited by hand.

### Sheet tips
- Websites can be written any way (`https://www.Example.com/`, `example.com`); they are all cleaned to `example.com`.
- Prices like `$1,200`, `1200` or `€90` all work. If a sheet has no currency column, the **Default currency** is used. Totals and "cheapest" sorting do not convert between currencies, so keep each vendor in one currency where you can.
- Dates in the order sheet: `2025-03-07` or real Google dates are best. `07/03/2025` is read **day first**.
- If the same site appears twice in one sheet, the cheaper row is kept.
- A sync that finds **zero valid rows** changes nothing, so a wrong mapping can never wipe a vendor's data.
- Disabling a vendor blocks their login and hides their sites from search; their data is kept.

---

## Running on your own computer (optional)

```
npm install
cp .env.example .env.local     # then fill in the values
npm run dev                    # http://localhost:3000
```

Requires Node 20 or newer. Run `npm run build` to check that everything compiles before deploying.

---

## Project map

```
supabase/migrations/0001_init.sql   tables, RLS policies, helper functions, views
supabase/seed.sql                   promote your user to admin
scripts/seed-admin.mjs              optional: create the admin from the command line
vercel.json                         cron schedules
middleware.ts                       session refresh + login redirect
lib/domain.ts                       domain normalisation
lib/sheets.ts, lib/sync.ts          Google Sheets reading and import
lib/indexing.ts                     Serper index check
lib/search.ts                       single and bulk lookups
app/actions/*.ts                    all write operations (admin-checked)
app/api/cron/*                      cron endpoints (Bearer CRON_SECRET)
app/(app)/...                       pages: dashboard, search, listings, admin/*
```

---

## Troubleshooting

| Problem | Fix |
|---|---|
| Login says "Wrong email or password" | Confirm the user exists in Supabase -> Authentication -> Users and was created with *Auto Confirm* |
| Logged in but bounced back to login with "no access" | Admin: run `supabase/seed.sql` with your email. Vendor: the vendor may be disabled |
| Sync error "could not open this sheet" | Share the sheet with the service account email (Viewer); check the link and tab name |
| Sync error "column ... was not found" | Open the sheet settings, **Load columns**, re-select the columns, save |
| `GOOGLE_PRIVATE_KEY` errors | Paste the key exactly from the JSON file, wrapped in double quotes, keeping `\n` |
| "Last check failed" on a link | Hover the badge for the reason (usually Serper credits or key). The old status is kept |
| Vercel deploy rejected for cron | You are on Hobby: see Step 7 |
| Check all stops early | By design (time limit). Click again to continue |

## Security notes
- Keep `SUPABASE_SERVICE_ROLE_KEY`, `GOOGLE_PRIVATE_KEY`, `SERPER_API_KEY` and `CRON_SECRET` only in Vercel/`.env.local`. They are never sent to browsers.
- Public sign-up is disabled (Step 2.3). Even if someone signed up, a user without a profile row sees nothing.
- Vendors can read their own sheet rows, listings and orders placed with them, and nothing else. They have no write access at any level.
