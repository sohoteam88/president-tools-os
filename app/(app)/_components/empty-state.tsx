import Link from "next/link";

export function EmptyState({
  title,
  description,
  actionLabel,
  actionHref,
}: {
  title: string;
  description?: string;
  actionLabel?: string;
  actionHref?: string;
}) {
  return (
    <div className="rounded-md border border-dashed border-border bg-muted/20 px-6 py-10 text-center">
      <h2 className="text-sm font-semibold text-foreground">{title}</h2>
      {description ? <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">{description}</p> : null}
      {actionLabel && actionHref ? (
        <Link href={actionHref} className="mt-4 inline-flex rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground">
          {actionLabel}
        </Link>
      ) : null}
    </div>
  );
}
