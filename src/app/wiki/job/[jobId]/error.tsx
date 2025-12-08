"use client";

export default function Error({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div className="p-6">
      <div className="rounded-xl border border-[var(--glass-border)] bg-[var(--surface)] p-6">
        <h1 className="text-xl font-bold mb-2">Error</h1>
        <p className="text-[var(--muted-foreground)] text-sm mb-4">{error.message}</p>
        <button onClick={reset} className="btn-japanese px-4 py-2 text-sm">Try again</button>
      </div>
    </div>
  );
}

