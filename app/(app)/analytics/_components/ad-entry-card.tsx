"use client";

import type { AdEntry } from "@/lib/db/schema/ads";
import { PLATFORM_LABELS } from "@/lib/validators/ads";
import { useLanguage } from "@/lib/i18n";
import type { TranslationKeys } from "@/lib/translations";

const METRIC_KEY_MAP: Array<[keyof AdEntry, keyof TranslationKeys]> = [
  ["reach", "metricReach"],
  ["likes", "metricLikes"],
  ["comments", "metricComments"],
  ["saves", "metricSaves"],
  ["shares", "metricShares"],
  ["dmsReceived", "metricDMs"],
  ["leadsGenerated", "metricLeads"],
  ["linkClicks", "metricClicks"],
];

export function AdEntryCard({
  entry,
  onDelete,
}: {
  entry: AdEntry;
  onDelete: (entryId: string) => void;
}) {
  const { t } = useLanguage();

  return (
    <article className="space-y-4 rounded-md border border-border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold">
            {PLATFORM_LABELS[entry.platform as keyof typeof PLATFORM_LABELS] ?? entry.platform} · {entry.postedAt}
          </p>
          {entry.captionPreview ? (
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">"{entry.captionPreview}"</p>
          ) : (
            <p className="mt-1 text-sm text-muted-foreground">{t.noCaptionPreview}</p>
          )}
        </div>
        {entry.ocrConfidence ? (
          <span className="rounded bg-amber-100 px-2 py-1 text-xs text-amber-800">
            {entry.ocrConfidence === "high" ? t.ocrHigh : t.ocrLow}
          </span>
        ) : null}
      </div>
      <div className="grid gap-2 text-sm sm:grid-cols-4">
        {METRIC_KEY_MAP.map(([key, labelKey]) => (
          <div key={String(key)} className="rounded-md bg-muted px-3 py-2">
            <span className="text-xs text-muted-foreground">{t[labelKey]}</span>
            <p className="font-medium">{entry[key] == null ? "—" : String(entry[key])}</p>
          </div>
        ))}
      </div>
      {entry.notes ? <p className="text-sm text-muted-foreground">{entry.notes}</p> : null}
      <div className="flex flex-wrap gap-2">
        {entry.screenshotKey ? <span className="rounded-md border border-border px-3 py-2 text-xs">{t.screenshotSaved}</span> : null}
        <button type="button" onClick={() => onDelete(entry.id)} className="rounded-md border border-border px-3 py-2 text-xs text-muted-foreground">
          {t.delete}
        </button>
      </div>
    </article>
  );
}
