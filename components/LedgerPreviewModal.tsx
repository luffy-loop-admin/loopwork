'use client';
import type { ParsedLedger } from '@/lib/ledger';

export default function LedgerPreviewModal({
  preview,
  onClose,
}: {
  preview: ParsedLedger | null;
  onClose: () => void;
}) {
  if (!preview) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 overflow-y-auto">
      <div className="card w-full max-w-2xl max-h-[90vh] overflow-y-auto p-5 sm:p-6 space-y-5 bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-line pb-3">
          <div>
            <h3 className="text-lg font-bold">Ledger Dry-Run Preview</h3>
            <p className="text-xs text-muted">Comparison against Google Sheet without saving to database.</p>
          </div>
          <button type="button" onClick={onClose} className="btn btn-ghost btn-sm">✕ Close</button>
        </div>

        {/* Top summary stats */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="rounded-lg border border-line bg-paper p-3 text-center">
            <span className="text-xs font-semibold text-muted uppercase">Links Count</span>
            <p className="text-xl font-bold mt-1">{preview.orders.length}</p>
            <p className="text-xs text-muted mt-0.5">PKR {Math.round(preview.totalOrderedPKR).toLocaleString()}</p>
          </div>
          <div className="rounded-lg border border-line bg-paper p-3 text-center">
            <span className="text-xs font-semibold text-muted uppercase">Payments Count</span>
            <p className="text-xl font-bold mt-1">{preview.payments.length}</p>
            <p className="text-xs text-muted mt-0.5">PKR {Math.round(preview.totalPaidPKR).toLocaleString()}</p>
          </div>
          <div className="rounded-lg border border-line bg-paper p-3 text-center">
            <span className="text-xs font-semibold text-muted uppercase">Resulting Balance</span>
            <p className={`text-xl font-bold mt-1 ${preview.resultingBalance > 0 ? 'text-warn' : preview.resultingBalance < 0 ? 'text-good' : ''}`}>
              PKR {Math.round(preview.resultingBalance).toLocaleString()}
            </p>
            <p className="text-xs text-muted mt-0.5">Ordered - Paid</p>
          </div>
        </div>

        {/* Skipped and anomaly reasons */}
        <div className="rounded-md border border-line bg-paper/50 p-3 text-xs space-y-1">
          <p className="font-semibold text-ink">Filtering & Row Breakdown:</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1">
            <div>
              <span className="font-medium text-bad">Skipped (No live link):</span> {preview.skippedNoLink}
            </div>
            <div>
              <span className="font-medium text-warn">No price (0 PKR):</span> {preview.noPriceCount}
            </div>
            <div>
              <span className="font-medium text-muted">Duplicates (Later won):</span> {preview.duplicateCount}
            </div>
          </div>
        </div>

        {/* Tabs read */}
        <div>
          <span className="text-xs font-semibold text-muted uppercase">Tabs Read ({preview.tabsRead.length}):</span>
          <div className="flex flex-wrap gap-1.5 mt-1.5">
            {preview.tabsRead.map((tab) => (
              <span key={tab} className="badge bg-paper border border-line text-xs font-medium">{tab}</span>
            ))}
          </div>
        </div>

        {/* Sample Orders */}
        {preview.orders.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-xs font-semibold text-muted uppercase">Sample Links ({Math.min(preview.orders.length, 5)} of {preview.orders.length})</h4>
            <div className="overflow-x-auto border border-line rounded-md text-xs">
              <table className="w-full text-left">
                <thead className="bg-paper border-b border-line">
                  <tr>
                    <th className="p-2">Domain</th>
                    <th className="p-2">Price (PKR)</th>
                    <th className="p-2">Date / Month</th>
                    <th className="p-2">Tab</th>
                    <th className="p-2">Live URL</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {preview.orders.slice(0, 5).map((o, idx) => (
                    <tr key={idx}>
                      <td className="p-2 font-medium">{o.domain}</td>
                      <td className="p-2 font-semibold">{o.price_paid !== null ? `PKR ${o.price_paid.toLocaleString()}` : '-'}</td>
                      <td className="p-2 text-muted">{o.order_date || o.order_month || '-'}</td>
                      <td className="p-2 text-muted">{o.source_tab}</td>
                      <td className="p-2 max-w-[12rem] truncate">{o.live_url}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Sample Payments */}
        {preview.payments.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-xs font-semibold text-muted uppercase">Sample Payments ({Math.min(preview.payments.length, 4)} of {preview.payments.length})</h4>
            <div className="overflow-x-auto border border-line rounded-md text-xs">
              <table className="w-full text-left">
                <thead className="bg-paper border-b border-line">
                  <tr>
                    <th className="p-2">Date</th>
                    <th className="p-2">Amount (PKR)</th>
                    <th className="p-2">Method</th>
                    <th className="p-2">Notes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {preview.payments.slice(0, 4).map((p, idx) => (
                    <tr key={idx}>
                      <td className="p-2">{p.paid_date}</td>
                      <td className="p-2 font-semibold">PKR {p.amount.toLocaleString()}</td>
                      <td className="p-2 text-muted">{p.method || '-'}</td>
                      <td className="p-2 text-muted truncate max-w-[12rem]">{p.notes || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div className="flex justify-end pt-2">
          <button type="button" onClick={onClose} className="btn btn-primary btn-sm">Got it</button>
        </div>
      </div>
    </div>
  );
}
