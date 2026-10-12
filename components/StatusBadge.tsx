import type { IndexStatus } from '@/lib/types';

export default function StatusBadge({ status, hasLink = true, error }: { status: IndexStatus; hasLink?: boolean; error?: string | null }) {
  if (!hasLink) return <span className="text-xs text-muted">No live link</span>;
  const map = {
    indexed: { label: 'Indexed', cls: 'bg-good-soft text-good' },
    not_indexed: { label: 'Not indexed', cls: 'bg-bad-soft text-bad' },
    pending: { label: 'Pending', cls: 'bg-paper text-muted border border-line' },
  } as const;
  const m = map[status] ?? map.pending;
  return (
    <span className="inline-flex flex-col items-start gap-1">
      <span className={`badge ${m.cls}`}>{m.label}</span>
      {error && (
        <span className="badge bg-warn-soft text-warn" title={error}>
          Last check failed
        </span>
      )}
    </span>
  );
}
