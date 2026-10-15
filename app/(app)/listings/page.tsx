import Link from 'next/link';
import { requireProfile } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { fmtDate, money } from '@/lib/format';
import { weekStart, weekLabel } from '@/lib/ledger';
import Pager from '@/components/Pager';
import StatusBadge from '@/components/StatusBadge';
import type { IndexStatus } from '@/lib/types';

const PAGE_SIZE = 50;

function PaymentBadge({ status }: { status: string | null }) {
  if (!status) return <span className="text-muted">-</span>;
  const s = status.trim().toLowerCase();
  if (/paid|clear|done|received/i.test(s) && !/not|un/i.test(s)) {
    return <span className="badge bg-good-soft text-good">{status}</span>;
  }
  if (/pending|remaining|due|partial/i.test(s)) {
    return <span className="badge bg-warn-soft text-warn">{status}</span>;
  }
  if (/unpaid|not paid|failed/i.test(s)) {
    return <span className="badge bg-bad-soft text-bad">{status}</span>;
  }
  return <span className="badge bg-paper text-muted border border-line">{status}</span>;
}

export default async function ListingsPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    vendor?: string;
    view?: string;
    month?: string;
    week?: string;
    tab?: string;
    page?: string;
  }>;
}) {
  const sp = await searchParams;
  const profile = await requireProfile();
  const isAdmin = profile.role === 'admin';
  const page = Math.max(1, Number(sp.page) || 1);
  const q = (sp.q ?? '').toLowerCase().replace(/[%_,()*\\]/g, '').trim();
  const vendorId = isAdmin ? (sp.vendor ?? '') : (profile.vendor_id ?? '');
  const view = sp.view === 'prices' ? 'prices' : 'ledger'; // default to ledger
  const monthFilter = sp.month ?? '';
  const weekFilter = sp.week ?? '';
  const tabFilter = sp.tab ?? '';

  const supabase = await createClient();

  // Load vendors list for admin tabs
  const vendorsPromise = isAdmin
    ? supabase.from('vendors').select('id,name,active').order('active', { ascending: false }).order('name')
    : Promise.resolve({ data: [] as any[] });

  // Load balance for single vendor
  const balancePromise = vendorId
    ? supabase.from('vendor_balance').select('*').eq('vendor_id', vendorId).maybeSingle()
    : Promise.resolve({ data: null });

  const [vendorsRes, balanceRes] = await Promise.all([vendorsPromise, balancePromise]);
  const vendors = (vendorsRes.data ?? []) as { id: string; name: string; active: boolean }[];
  const balance = balanceRes.data as { ordered_total: number; paid_total: number; balance: number; currency: string } | null;

  // VIEW 1: Links Bought (Ledger from orders table)
  if (view === 'ledger') {
    let query = supabase
      .from('orders')
      .select('id,domain,live_url,price_paid,currency,order_date,order_month,source_tab,article_url,indexed_status,index_error,vendor_name,vendor_id', { count: 'exact' })
      .order('order_date', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false })
      .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);

    if (vendorId) query = query.eq('vendor_id', vendorId);
    if (q) query = query.ilike('domain', `%${q}%`);
    if (tabFilter) query = query.eq('source_tab', tabFilter);

    // Month filter: effective date is order_date if present, else order_month
    if (monthFilter) {
      // monthFilter is YYYY-MM
      const nextMonth = new Date(`${monthFilter}-01T00:00:00Z`);
      nextMonth.setUTCMonth(nextMonth.getUTCMonth() + 1);
      const nextMonthStr = nextMonth.toISOString().slice(0, 10);
      const monthStartStr = `${monthFilter}-01`;

      query = query.or(
        `and(order_date.gte.${monthStartStr},order_date.lt.${nextMonthStr}),and(order_date.is.null,order_month.gte.${monthStartStr},order_month.lt.${nextMonthStr})`
      );
    }

    // Week filter: effective date Monday of week
    if (weekFilter) {
      // weekFilter is YYYY-MM-DD (Monday)
      const weekStartD = new Date(`${weekFilter}T00:00:00Z`);
      const weekEndD = new Date(weekStartD);
      weekEndD.setUTCDate(weekEndD.getUTCDate() + 7);
      const weekEndStr = weekEndD.toISOString().slice(0, 10);

      query = query.or(
        `and(order_date.gte.${weekFilter},order_date.lt.${weekEndStr}),and(order_date.is.null,order_month.gte.${weekFilter},order_month.lt.${weekEndStr})`
      );
    }

    const { data, count } = await query;
    const orders = (data ?? []) as any[];

    // Calculate total PKR and link count for current filter
    let totalsQuery = supabase.from('orders').select('price_paid');
    if (vendorId) totalsQuery = totalsQuery.eq('vendor_id', vendorId);
    if (q) totalsQuery = totalsQuery.ilike('domain', `%${q}%`);
    if (tabFilter) totalsQuery = totalsQuery.eq('source_tab', tabFilter);
    if (monthFilter) {
      const nextMonth = new Date(`${monthFilter}-01T00:00:00Z`);
      nextMonth.setUTCMonth(nextMonth.getUTCMonth() + 1);
      const nextMonthStr = nextMonth.toISOString().slice(0, 10);
      totalsQuery = totalsQuery.or(
        `and(order_date.gte.${monthFilter}-01,order_date.lt.${nextMonthStr}),and(order_date.is.null,order_month.gte.${monthFilter}-01,order_month.lt.${nextMonthStr})`
      );
    }
    if (weekFilter) {
      const weekStartD = new Date(`${weekFilter}T00:00:00Z`);
      const weekEndD = new Date(weekStartD);
      weekEndD.setUTCDate(weekEndD.getUTCDate() + 7);
      totalsQuery = totalsQuery.or(
        `and(order_date.gte.${weekFilter},order_date.lt.${weekEndD.toISOString().slice(0, 10)}),and(order_date.is.null,order_month.gte.${weekFilter},order_month.lt.${weekEndD.toISOString().slice(0, 10)})`
      );
    }
    const { data: totalsData } = await totalsQuery;
    const filteredTotalPKR = (totalsData ?? []).reduce((sum, r: any) => sum + (Number(r.price_paid) || 0), 0);

    // Collect available months and tabs for filters
    let metaQuery = supabase.from('orders').select('order_date,order_month,source_tab').not('source_tab', 'is', null);
    if (vendorId) metaQuery = metaQuery.eq('vendor_id', vendorId);
    const { data: metaData } = await metaQuery.limit(2000);

    const availableMonths = new Set<string>();
    const availableTabs = new Set<string>();
    for (const r of (metaData ?? []) as any[]) {
      if (r.source_tab) availableTabs.add(r.source_tab);
      const d = r.order_date || r.order_month;
      if (d && typeof d === 'string' && d.length >= 7) {
        availableMonths.add(d.slice(0, 7));
      }
    }
    const sortedMonths = Array.from(availableMonths).sort().reverse();
    const sortedTabs = Array.from(availableTabs).sort();

    // Weeks inside selected month
    const weeksInMonth: { start: string; label: string }[] = [];
    if (monthFilter) {
      const [y, m] = monthFilter.split('-').map(Number);
      const daysInMonth = new Date(y, m, 0).getDate();
      const seenWeeks = new Set<string>();
      for (let day = 1; day <= daysInMonth; day++) {
        const dateStr = `${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const ws = weekStart(dateStr);
        if (!seenWeeks.has(ws)) {
          seenWeeks.add(ws);
          weeksInMonth.push({ start: ws, label: weekLabel(dateStr) });
        }
      }
    }

    return (
      <div className="space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <h1 className="text-xl font-semibold">{isAdmin ? 'All listings' : 'My listings'}</h1>
        </div>

        {/* Admin Vendor Tab Strip */}
        {isAdmin && (
          <div className="flex items-center gap-1.5 overflow-x-auto border-b border-line pb-2.5">
            <Link
              href="/listings?view=ledger"
              className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                !vendorId ? 'bg-accent text-white shadow-sm' : 'bg-paper text-muted hover:text-ink hover:bg-line'
              }`}
            >
              All Vendors
            </Link>
            {vendors.map((v) => (
              <Link
                key={v.id}
                href={`/listings?vendor=${v.id}&view=ledger`}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                  vendorId === v.id
                    ? 'bg-accent text-white shadow-sm'
                    : 'bg-paper text-muted hover:text-ink hover:bg-line'
                } ${!v.active ? 'opacity-60' : ''}`}
              >
                {v.name} {!v.active && '(Inactive)'}
              </Link>
            ))}
          </div>
        )}

        {/* Single Vendor Balance Cards */}
        {vendorId && balance && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="card p-3 sm:p-4 text-center">
              <span className="text-xs font-semibold text-muted uppercase">Total Ordered</span>
              <p className="text-lg sm:text-xl font-bold mt-1 text-ink">{money(balance.ordered_total, balance.currency)}</p>
            </div>
            <div className="card p-3 sm:p-4 text-center">
              <span className="text-xs font-semibold text-muted uppercase">Total Paid</span>
              <p className="text-lg sm:text-xl font-bold mt-1 text-good">{money(balance.paid_total, balance.currency)}</p>
            </div>
            <div className="card p-3 sm:p-4 text-center">
              <span className="text-xs font-semibold text-muted uppercase">Current Balance</span>
              <p className={`text-lg sm:text-xl font-bold mt-1 ${balance.balance > 0 ? 'text-warn' : balance.balance < 0 ? 'text-good' : 'text-muted'}`}>
                {money(balance.balance, balance.currency)}
              </p>
            </div>
          </div>
        )}

        {/* View Segmented Control */}
        <div className="flex items-center gap-2 border-b border-line pb-3">
          <Link
            href={`/listings?${new URLSearchParams({ ...(vendorId ? { vendor: vendorId } : {}), view: 'ledger' }).toString()}`}
            className="btn btn-sm btn-primary"
          >
            📋 Links bought (Ledger)
          </Link>
          <Link
            href={`/listings?${new URLSearchParams({ ...(vendorId ? { vendor: vendorId } : {}), view: 'prices' }).toString()}`}
            className="btn btn-sm btn-ghost"
          >
            💲 Price list
          </Link>
        </div>

        {/* Filters Form */}
        <form method="get" className="flex flex-wrap items-center gap-2 text-xs">
          {vendorId && <input type="hidden" name="vendor" value={vendorId} />}
          <input type="hidden" name="view" value="ledger" />

          <input
            name="q"
            defaultValue={sp.q ?? ''}
            placeholder="Search website"
            className="input input-sm max-w-[12rem]"
          />

          {/* Month Dropdown */}
          <select name="month" defaultValue={monthFilter} className="input input-sm max-w-[10rem]">
            <option value="">All months</option>
            {sortedMonths.map((m) => {
              const [y, mon] = m.split('-').map(Number);
              const label = new Date(y, mon - 1, 1).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
              return (
                <option key={m} value={m}>{label}</option>
              );
            })}
          </select>

          {/* Week Dropdown */}
          {monthFilter && weeksInMonth.length > 0 && (
            <select name="week" defaultValue={weekFilter} className="input input-sm max-w-[12rem]">
              <option value="">All weeks in month</option>
              {weeksInMonth.map((w) => (
                <option key={w.start} value={w.start}>{w.label}</option>
              ))}
            </select>
          )}

          {/* Tab Filter */}
          {sortedTabs.length > 0 && (
            <select name="tab" defaultValue={tabFilter} className="input input-sm max-w-[10rem]">
              <option value="">All tabs</option>
              {sortedTabs.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          )}

          <button className="btn btn-primary btn-sm" type="submit">Filter</button>
          {(q || monthFilter || weekFilter || tabFilter) && (
            <Link
              href={`/listings?${new URLSearchParams({ ...(vendorId ? { vendor: vendorId } : {}), view: 'ledger' }).toString()}`}
              className="btn btn-ghost btn-sm no-underline"
            >
              Clear
            </Link>
          )}
        </form>

        {/* Totals Bar */}
        <div className="rounded-lg border border-accent/20 bg-accent-soft/30 px-4 py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs font-medium text-foreground">
          <div className="flex items-center gap-4">
            <span>
              <strong>{count ?? 0}</strong> links found
            </span>
            <span>
              Total: <strong>PKR {Math.round(filteredTotalPKR).toLocaleString()}</strong>
            </span>
          </div>
          {(monthFilter || weekFilter || tabFilter) && (
            <span className="text-muted">
              Filtered by: {[monthFilter, weekFilter && `Week of ${weekFilter}`, tabFilter].filter(Boolean).join(' · ')}
            </span>
          )}
        </div>

        {/* Ledger Orders Table */}
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[760px] border-collapse text-xs sm:text-sm">
            <thead>
              <tr>
                <th className="th">Date</th>
                <th className="th">Website</th>
                {!vendorId && <th className="th">Vendor</th>}
                <th className="th">Price</th>
                <th className="th">Live link</th>
                <th className="th">Article Doc</th>
                <th className="th">Index Status</th>
                <th className="th">Tab</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((r) => (
                <tr key={r.id}>
                  <td className="td text-muted whitespace-nowrap">
                    {r.order_date ? fmtDate(r.order_date) : r.order_month ? `${fmtDate(r.order_month)} (Month)` : '-'}
                  </td>
                  <td className="td font-medium">
                    <Link className="link" href={`/search?q=${encodeURIComponent(r.domain)}`}>{r.domain}</Link>
                  </td>
                  {!vendorId && <td className="td text-muted">{r.vendor_name ?? '-'}</td>}
                  <td className="td font-semibold whitespace-nowrap">
                    {r.price_paid !== null ? money(r.price_paid, r.currency) : <span className="text-muted">-</span>}
                  </td>
                  <td className="td max-w-[12rem] truncate">
                    {r.live_url ? (
                      <a href={r.live_url} target="_blank" rel="noopener noreferrer" className="link">
                        {r.live_url.replace(/^https?:\/\//, '')}
                      </a>
                    ) : (
                      <span className="text-muted">-</span>
                    )}
                  </td>
                  <td className="td max-w-[10rem] truncate">
                    {r.article_url ? (
                      /^https?:\/\//i.test(r.article_url) ? (
                        <a href={r.article_url} target="_blank" rel="noopener noreferrer" className="link">
                          Doc Link ↗
                        </a>
                      ) : (
                        <span>{r.article_url}</span>
                      )
                    ) : (
                      <span className="text-muted">-</span>
                    )}
                  </td>
                  <td className="td">
                    <StatusBadge status={r.indexed_status as IndexStatus} hasLink={!!r.live_url} error={r.index_error} />
                  </td>
                  <td className="td text-muted whitespace-nowrap">
                    {r.source_tab ? <span className="badge bg-paper border border-line text-xs">{r.source_tab}</span> : '-'}
                  </td>
                </tr>
              ))}
              {orders.length === 0 && (
                <tr>
                  <td className="td text-muted text-center py-6" colSpan={vendorId ? 7 : 8}>
                    No links found matching your filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <Pager
          basePath="/listings"
          params={{
            q: sp.q,
            vendor: vendorId,
            view: 'ledger',
            month: monthFilter,
            week: weekFilter,
            tab: tabFilter,
          }}
          page={page}
          pageSize={PAGE_SIZE}
          total={count ?? 0}
        />
      </div>
    );
  }

  // VIEW 2: Price List (from vendor_sites table)
  let siteQuery = supabase
    .from('vendor_sites')
    .select('id,domain,price,currency,payment_status,payment_date,source_tab,vendors(name)', { count: 'exact' })
    .order('price', { ascending: true, nullsFirst: false })
    .order('domain', { ascending: true })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);

  if (vendorId) siteQuery = siteQuery.eq('vendor_id', vendorId);
  if (q) siteQuery = siteQuery.ilike('domain', `%${q}%`);
  if (tabFilter) siteQuery = siteQuery.eq('source_tab', tabFilter);

  const { data: sitesData, count: sitesCount } = await siteQuery;
  const sites = (sitesData ?? []) as any[];

  // Collect distinct source_tab for price lists
  let siteMetaQuery = supabase.from('vendor_sites').select('source_tab').not('source_tab', 'is', null);
  if (vendorId) siteMetaQuery = siteMetaQuery.eq('vendor_id', vendorId);
  const { data: siteTabsData } = await siteMetaQuery.limit(2000);
  const distinctSiteTabs = Array.from(new Set((siteTabsData ?? []).map((s: any) => s.source_tab).filter(Boolean))).sort();

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <h1 className="text-xl font-semibold">{isAdmin ? 'All listings' : 'My listings'}</h1>
      </div>

      {/* Admin Vendor Tab Strip */}
      {isAdmin && (
        <div className="flex items-center gap-1.5 overflow-x-auto border-b border-line pb-2.5">
          <Link
            href="/listings?view=prices"
            className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
              !vendorId ? 'bg-accent text-white shadow-sm' : 'bg-paper text-muted hover:text-ink hover:bg-line'
            }`}
          >
            All Vendors
          </Link>
          {vendors.map((v) => (
            <Link
              key={v.id}
              href={`/listings?vendor=${v.id}&view=prices`}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                vendorId === v.id
                  ? 'bg-accent text-white shadow-sm'
                  : 'bg-paper text-muted hover:text-ink hover:bg-line'
              } ${!v.active ? 'opacity-60' : ''}`}
            >
              {v.name} {!v.active && '(Inactive)'}
            </Link>
          ))}
        </div>
      )}

      {/* View Segmented Control */}
      <div className="flex items-center gap-2 border-b border-line pb-3">
        <Link
          href={`/listings?${new URLSearchParams({ ...(vendorId ? { vendor: vendorId } : {}), view: 'ledger' }).toString()}`}
          className="btn btn-sm btn-ghost"
        >
          📋 Links bought (Ledger)
        </Link>
        <Link
          href={`/listings?${new URLSearchParams({ ...(vendorId ? { vendor: vendorId } : {}), view: 'prices' }).toString()}`}
          className="btn btn-sm btn-primary"
        >
          💲 Price list
        </Link>
      </div>

      {/* Filters Form */}
      <form method="get" className="flex flex-wrap items-center gap-2 text-xs">
        {vendorId && <input type="hidden" name="vendor" value={vendorId} />}
        <input type="hidden" name="view" value="prices" />

        <input
          name="q"
          defaultValue={sp.q ?? ''}
          placeholder="Filter by website"
          className="input input-sm max-w-[12rem]"
        />

        {/* Tab filter for price lists */}
        {distinctSiteTabs.length > 0 && (
          <select name="tab" defaultValue={tabFilter} className="input input-sm max-w-[10rem]">
            <option value="">All tabs</option>
            {distinctSiteTabs.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        )}

        <button className="btn btn-primary btn-sm" type="submit">Filter</button>
        {(q || tabFilter) && (
          <Link
            href={`/listings?${new URLSearchParams({ ...(vendorId ? { vendor: vendorId } : {}), view: 'prices' }).toString()}`}
            className="btn btn-ghost btn-sm no-underline"
          >
            Clear
          </Link>
        )}
      </form>

      {/* Price List Table */}
      <div className="card overflow-x-auto">
        <table className="w-full min-w-[640px] border-collapse text-xs sm:text-sm">
          <thead>
            <tr>
              <th className="th">Website</th>
              {!vendorId && <th className="th">Vendor</th>}
              <th className="th">Price</th>
              <th className="th">Payment status</th>
              <th className="th">Date</th>
              <th className="th">Tab</th>
            </tr>
          </thead>
          <tbody>
            {sites.map((r) => {
              const v = Array.isArray(r.vendors) ? r.vendors[0] : r.vendors;
              return (
                <tr key={r.id}>
                  <td className="td font-medium">
                    <Link className="link" href={`/search?q=${encodeURIComponent(r.domain)}`}>{r.domain}</Link>
                  </td>
                  {!vendorId && <td className="td text-muted">{v?.name ?? '-'}</td>}
                  <td className="td font-semibold whitespace-nowrap">{money(r.price, r.currency)}</td>
                  <td className="td"><PaymentBadge status={r.payment_status} /></td>
                  <td className="td text-muted whitespace-nowrap">{fmtDate(r.payment_date)}</td>
                  <td className="td text-muted whitespace-nowrap">
                    {r.source_tab ? <span className="badge bg-paper border border-line text-xs">{r.source_tab}</span> : '-'}
                  </td>
                </tr>
              );
            })}
            {sites.length === 0 && (
              <tr>
                <td className="td text-muted text-center py-6" colSpan={vendorId ? 5 : 6}>
                  No sites found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Pager
        basePath="/listings"
        params={{ q: sp.q, vendor: vendorId, view: 'prices', tab: tabFilter }}
        page={page}
        pageSize={PAGE_SIZE}
        total={sitesCount ?? 0}
      />
    </div>
  );
}
