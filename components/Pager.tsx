import Link from 'next/link';

export default function Pager({ basePath, params, page, pageSize, total }: { basePath: string; params: Record<string, string | undefined>; page: number; pageSize: number; total: number }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;
  const href = (p: number) => {
    const sp = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => v && sp.set(k, v));
    sp.set('page', String(p));
    return `${basePath}?${sp.toString()}`;
  };
  return (
    <div className="mt-4 flex items-center justify-between text-sm">
      <span className="text-muted">Page {page} of {pages} ({total.toLocaleString('en-US')} rows)</span>
      <div className="flex gap-2">
        {page > 1 && <Link className="btn btn-ghost btn-sm no-underline" href={href(page - 1)}>Previous</Link>}
        {page < pages && <Link className="btn btn-ghost btn-sm no-underline" href={href(page + 1)}>Next</Link>}
      </div>
    </div>
  );
}
