'use client';
import { useState } from 'react';
import { previewLedgerSourceAction } from '@/app/actions/sheets';
import LedgerPreviewModal from './LedgerPreviewModal';
import type { ParsedLedger } from '@/lib/ledger';

export default function SheetPreviewButton({ sourceId }: { sourceId: string }) {
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState<ParsedLedger | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleClick = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await previewLedgerSourceAction(sourceId);
      if (!res.ok || !res.preview) throw new Error(res.message || 'Preview failed');
      setPreview(res.preview);
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Could not preview ledger');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        disabled={loading}
        className="btn btn-ghost btn-sm"
        title="Dry-run comparison against sheet without saving"
      >
        {loading ? 'Reading…' : '🔍 Preview'}
      </button>
      {preview && <LedgerPreviewModal preview={preview} onClose={() => setPreview(null)} />}
    </>
  );
}
