function SkeletonLine({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-muted ${className}`} />;
}

export function SkeletonCard() {
  return (
    <div className="rounded-md border border-border bg-card p-4">
      <SkeletonLine className="h-4 w-2/5" />
      <SkeletonLine className="mt-3 h-3 w-4/5" />
      <SkeletonLine className="mt-2 h-3 w-3/5" />
    </div>
  );
}

export function SkeletonList({ count = 4 }: { count?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: count }, (_, index) => (
        <SkeletonCard key={index} />
      ))}
    </div>
  );
}

export function SkeletonKanban() {
  return (
    <div className="grid gap-3 lg:grid-cols-5">
      {Array.from({ length: 5 }, (_, index) => (
        <div key={index} className="min-h-72 rounded-md border border-border bg-muted/30 p-3">
          <SkeletonLine className="h-4 w-24" />
          <div className="mt-4 space-y-3">
            <SkeletonCard />
            <SkeletonCard />
          </div>
        </div>
      ))}
    </div>
  );
}
