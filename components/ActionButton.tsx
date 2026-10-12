'use client';
import { useState, useTransition } from 'react';
import type { ActionResult } from '@/lib/types';

type Props = {
  action: () => Promise<ActionResult | void>;
  label: string;
  pendingLabel?: string;
  className?: string;
  confirm?: string;
};

/** A button that calls a (bound) server action and shows the result under it. */
export default function ActionButton({ action, label, pendingLabel = 'Working…', className = 'btn btn-ghost btn-sm', confirm }: Props) {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);
  return (
    <span className="inline-flex flex-col items-start gap-1">
      <button
        type="button"
        disabled={pending}
        className={className}
        onClick={() => {
          if (confirm && !window.confirm(confirm)) return;
          setResult(null);
          start(async () => {
            const r = await action();
            if (r) setResult(r);
          });
        }}
      >
        {pending ? pendingLabel : label}
      </button>
      {result && (
        <span role="status" className={`max-w-[18rem] text-xs ${result.ok ? 'text-good' : 'text-bad'}`}>
          {result.message}
        </span>
      )}
    </span>
  );
}
