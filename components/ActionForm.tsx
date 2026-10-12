'use client';
import { useState, useTransition, type ReactNode } from 'react';
import type { ActionResult } from '@/lib/types';

type Props = {
  action: (formData: FormData) => Promise<ActionResult | void>;
  children?: ReactNode;
  submitLabel: string;
  className?: string;
  submitClassName?: string;
  resetOnSuccess?: boolean;
  extraButtons?: ReactNode;
};

/** A form that calls a server action, shows a pending state and the result message. */
export default function ActionForm({ action, children, submitLabel, className, submitClassName, resetOnSuccess, extraButtons }: Props) {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);

  return (
    <form
      className={className}
      onSubmit={(e) => {
        e.preventDefault();
        const form = e.currentTarget;
        const data = new FormData(form);
        setResult(null);
        start(async () => {
          const r = await action(data);
          if (r) {
            setResult(r);
            if (r.ok && resetOnSuccess) form.reset();
          }
        });
      }}
    >
      {children}
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button type="submit" disabled={pending} className={submitClassName ?? 'btn btn-primary'}>
          {pending ? 'Working…' : submitLabel}
        </button>
        {extraButtons}
        {result && (
          <p role="status" className={`text-sm ${result.ok ? 'text-good' : 'text-bad'}`}>
            {result.message}
          </p>
        )}
      </div>
    </form>
  );
}
