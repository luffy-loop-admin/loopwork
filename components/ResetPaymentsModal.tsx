'use client';
import { useState } from 'react';
import ActionForm from './ActionForm';
import { resetSyncedPaymentsAction } from '@/app/actions/payments';

type Props = {
  syncedCount: number;
  syncedPKR: number;
  manualCount: number;
  manualPKR: number;
};

export default function ResetPaymentsModal({ syncedCount, syncedPKR, manualCount, manualPKR }: Props) {
  const [open, setOpen] = useState(false);
  const [alsoDeleteManual, setAlsoDeleteManual] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="btn btn-danger btn-sm"
        title="Delete sheet-imported payments and re-sync from Payment History tabs"
      >
        ⚠️ Reset synced payments
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="card w-full max-w-lg p-5 sm:p-6 bg-paper shadow-xl border border-line animate-in fade-in zoom-in duration-150">
            <div className="flex items-start justify-between gap-3 border-b border-line pb-3">
              <div>
                <h3 className="text-base font-semibold text-bad">⚠️ Reset Synced Payments</h3>
                <p className="text-xs text-muted mt-0.5">Clean old import history and re-sync cleanly from sheets</p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="text-muted hover:text-ink text-sm font-bold px-2 py-1"
              >
                ✕
              </button>
            </div>

            <div className="py-4 space-y-3 text-xs sm:text-sm">
              <div className="rounded-md bg-paper-soft border border-line p-3 space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-muted">Sheet-imported payments:</span>
                  <span className="font-semibold text-ink">{syncedCount} rows (PKR {Math.round(syncedPKR).toLocaleString()})</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted">Manually entered payments:</span>
                  <span className="font-semibold text-ink">{manualCount} rows (PKR {Math.round(manualPKR).toLocaleString()})</span>
                </div>
              </div>

              <p className="text-ink">
                This will delete <strong>all {syncedCount} sheet-imported payment records</strong> and immediately re-sync every active vendor ledger from its <strong>Payment History</strong> tab.
              </p>
              <p className="text-muted text-xs">
                Any old rows from previous sync versions, duplicate imports, or deleted payment sheets will be completely cleared.
              </p>

              <div className="pt-2 border-t border-line">
                <label className="flex items-center gap-2 cursor-pointer font-medium text-xs text-ink select-none">
                  <input
                    type="checkbox"
                    checked={alsoDeleteManual}
                    onChange={(e) => setAlsoDeleteManual(e.target.checked)}
                    className="rounded border-line"
                  />
                  <span>Also delete manually typed payments ({manualCount} rows) for a completely fresh start</span>
                </label>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-line pt-4">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="btn btn-ghost btn-sm"
              >
                Cancel
              </button>
              <ActionForm
                action={async (fd) => {
                  if (alsoDeleteManual) {
                    if (!confirm('Are you sure you want to delete ALL payments including manually entered ones? This cannot be undone.')) {
                      return;
                    }
                  }
                  const res = await resetSyncedPaymentsAction(fd);
                  setOpen(false);
                  return res;
                }}
                submitLabel={alsoDeleteManual ? 'Delete all & re-sync ledgers' : 'Reset sheet payments & re-sync'}
                className="inline"
              >
                <input type="hidden" name="also_delete_manual" value={alsoDeleteManual ? 'true' : 'false'} />
                <button
                  type="submit"
                  className="btn btn-danger btn-sm"
                >
                  {alsoDeleteManual ? 'Delete all & re-sync' : 'Reset & re-sync ledgers'}
                </button>
              </ActionForm>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
