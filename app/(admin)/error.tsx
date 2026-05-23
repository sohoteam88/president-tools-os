"use client";

export default function AdminError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="mx-auto flex min-h-[50vh] max-w-lg flex-col items-center justify-center gap-3 p-6 text-center">
      <h1 className="text-lg font-semibold">Admin page failed</h1>
      <p className="text-sm text-muted-foreground">Refresh this admin view and try the action again.</p>
      <button type="button" onClick={reset} className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground">
        Retry
      </button>
    </div>
  );
}
