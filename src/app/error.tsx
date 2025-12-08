"use client";

export default function Error({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div className="min-h-[40vh] flex items-center justify-center p-6">
      <div className="max-w-md w-full rounded-xl border border-[var(--glass-border)] bg-[var(--surface)] p-6 shadow-sm">
        <h1 className="text-xl font-bold mb-2">Something went wrong</h1>
        <p className="text-[var(--muted-foreground)] text-sm mb-4">{error.message}</p>
        <button onClick={reset} className="btn-japanese px-4 py-2 text-sm">Try again</button>
      </div>
    </div>
  );
}
