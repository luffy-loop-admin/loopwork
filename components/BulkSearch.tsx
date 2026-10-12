'use client';
import { useMemo, useState } from 'react';
import { fmtDate, money } from '@/lib/format';

type Row = {
  domain: string; available: boolean; offers_count: number; best_price: number | null; best_currency: string | null;
  best_vendor: string | null; all_offers: string; bought: boolean; bought_count: number; bought_date: string | null;
  bought_vendor: string | null; bought_price: number | null; bought_currency: string | null; live_url: string | null;
};
type Filter = 'all' | 'available' | 'missing' | 'bought';

function csvCell(v: unknown): string {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export default function BulkSearch() {
  const [text, setText] = useState('');
  const [rows, setRows] = useState<Row[] | null>(null);
  const [invalid, setInvalid] = useState<string[]>([]);
  const [truncated, setTruncated] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<Filter>('all');

  async function run() {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/search/bulk', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }) });
      const ct = res.headers.get('content-type') || '';
      if (!ct.includes('json')) throw new Error('Your session expired. Reload the page and sign in again.');
      const json = await res.json();
      if (!res.ok) {
        setRows(null);
        setInvalid(json.invalid ?? []);
        throw new Error(json.error || 'Search failed.');
      }
      setRows(json.rows);
      setInvalid(json.invalid ?? []);
      setTruncated(!!json.truncated);
      setFilter('all');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Search failed.');
    } finally {
      setLoading(false);
    }
  }

  const shown = useMemo(() => {
    if (!rows) return [];
    if (filter === 'available') return rows.filter((r) => r.available);
    if (filter === 'missing') return rows.filter((r) => !r.available);
    if (filter === 'bought') return rows.filter((r) => r.bought);
    return rows;
  }, [rows, filter]);

  function exportCsv() {
    const head = ['Website', 'Available', 'Cheapest price', 'Currency', 'Cheapest vendor', 'Vendors', 'All offers', 'Already bought', 'Bought date', 'Bought from', 'Price paid', 'Live link'];
    const lines = [head.join(',')].concat(
      shown.map((r) =>
        [r.domain, r.available ? 'Yes' : 'Not available', r.best_price, r.best_currency, r.best_vendor, r.offers_count, r.all_offers, r.bought ? 'Yes' : 'No', r.bought_date, r.bought_vendor, r.bought_price, r.live_url]
          .map(csvCell)
          .join(','),
      ),
    );
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'bulk-search.csv';
    a.click();
    URL.revokeObjectURL(a.href);
  }

  const counts = rows
    ? { all: rows.length, available: rows.filter((r) => r.available).length, missing: rows.filter((r) => !r.available).length, bought: rows.filter((r) => r.bought).length }
    : null;

  return (
    <div className="space-y-6">
      <div className="card p-4 sm:p-5">
        <label htmlFor="bulk" className="label">Paste websites (one per line, or separated by commas)</label>
        <textarea
          id="bulk"
          className="input min-h-[160px] font-mono"
          placeholder={'example.com\nhttps://www.another-site.net/\nthird-site.org'}
          value={text}
          onChange={(e) => setText(e.target.value)}
          spellCheck={false}
        />
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button type="button" className="btn btn-primary" onClick={run} disabled={loading || !text.trim()}>
            {loading ? 'Searching…' : 'Search all'}
          </button>
          {error && <p role="alert" className="text-sm text-bad">{error}</p>}
        </div>
        {invalid.length > 0 && <p className="mt-3 text-sm text-warn">Skipped {invalid.length} entries that are not websites: {invalid.slice(0, 5).join(', ')}{invalid.length > 5 ? '…' : ''}</p>}
        {truncated && <p className="mt-2 text-sm text-warn">Only the first 1,000 websites were searched.</p>}
      </div>

      {rows && counts && (
        <div>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap gap-2" role="tablist" aria-label="Filter results">
              {([
                ['all', `All (${counts.all})`],
                ['available', `Available (${counts.available})`],
                ['missing', `Not available (${counts.missing})`],
                ['bought', `Already bought (${counts.bought})`],
              ] as [Filter, string][]).map(([k, label]) => (
                <button key={k} type="button" role="tab" aria-selected={filter === k} onClick={() => setFilter(k)} className={`btn btn-sm ${filter === k ? 'btn-primary' : 'btn-ghost'}`}>
                  {label}
                </button>
              ))}
            </div>
            <button type="button" className="btn btn-ghost btn-sm" onClick={exportCsv}>Download CSV</button>
          </div>

          <div className="card overflow-x-auto">
            <table className="w-full min-w-[760px] border-collapse">
              <thead>
                <tr>
                  <th className="th">Website</th>
                  <th className="th">Availability</th>
                  <th className="th">Cheapest</th>
                  <th className="th">Vendor</th>
                  <th className="th">Vendors</th>
                  <th className="th">Already bought</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((r) => (
                  <tr key={r.domain}>
                    <td className="td font-medium">{r.domain}</td>
                    <td className="td">
                      {r.available ? <span className="badge bg-good-soft text-good">Available</span> : <span className="badge bg-paper text-muted border border-line">Not available</span>}
                    </td>
                    <td className="td">{r.available ? money(r.best_price, r.best_currency) : '-'}</td>
                    <td className="td">{r.best_vendor ?? '-'}</td>
                    <td className="td" title={r.all_offers}>{r.offers_count || '-'}</td>
                    <td className="td">
                      {r.bought ? (
                        <div className="space-y-0.5">
                          <span className="badge bg-accent-soft text-accent">Yes{r.bought_count > 1 ? ` (${r.bought_count})` : ''}</span>
                          <div className="text-xs text-muted">
                            {fmtDate(r.bought_date)} · {r.bought_vendor ?? 'Unknown vendor'} · {money(r.bought_price, r.bought_currency)}
                          </div>
                          {r.live_url && (
                            <a className="link break-all text-xs" href={r.live_url} target="_blank" rel="noopener noreferrer nofollow">{r.live_url}</a>
                          )}
                        </div>
                      ) : (
                        <span className="text-muted">No</span>
                      )}
                    </td>
                  </tr>
                ))}
                {shown.length === 0 && (
                  <tr><td className="td text-muted" colSpan={6}>Nothing matches this filter.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
