"use client";

export default function AppError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="mx-auto flex min-h-[50vh] max-w-lg flex-col items-center justify-center gap-3 p-6 text-center">
      <h1 className="text-lg font-semibold">Something went wrong</h1>
      <p className="text-sm text-muted-foreground">The app hit an unexpected issue. Try again from here.</p>
      <button type="button" onClick={reset} className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground">
        Try Again
      </button>
    </div>
  );
}
