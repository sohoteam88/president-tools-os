import Link from "next/link";
import type { Funnel } from "@/lib/db/schema/funnels";

export function FunnelCard({
  funnel,
  accountSlug,
  editLabel,
  leadsLabel,
  previewLabel,
  noSlugLabel,
}: {
  funnel: Funnel;
  accountSlug: string | null;
  editLabel: string;
  leadsLabel: string;
  previewLabel: string;
  noSlugLabel: string;
}) {
  const path = funnel.pathSlug ? `/${funnel.pathSlug}` : "/";
  return (
    <div className="rounded-lg border border-border p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="font-semibold">{funnel.title}</h2>
          <p className="text-sm text-muted-foreground">{accountSlug ? `${accountSlug}.yourteam.com${path}` : noSlugLabel}</p>
        </div>
        <span className="rounded-full border px-2 py-1 text-xs">{funnel.status}</span>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <Link className="rounded-md border px-3 py-1.5 text-sm" href={`/funnels/${funnel.id}/edit`}>{editLabel}</Link>
        <Link className="rounded-md border px-3 py-1.5 text-sm" href={`/funnels/${funnel.id}/leads`}>{leadsLabel}</Link>
        <Link className="rounded-md border px-3 py-1.5 text-sm" href={`/funnels/${funnel.id}/preview`}>{previewLabel}</Link>
      </div>
    </div>
  );
}
