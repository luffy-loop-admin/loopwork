'use client';

export default function GlobalError({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div className="mx-auto max-w-lg p-6">
      <h1 className="text-lg font-semibold">Something went wrong</h1>
      <p className="mt-2 text-sm text-muted">{error.message || 'Unexpected error.'}</p>
      <button onClick={reset} className="btn btn-primary mt-4">Try again</button>
    </div>
  );
}
