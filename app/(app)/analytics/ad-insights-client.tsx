"use client";

import { useMemo, useState } from "react";
import type { AdAnalysis, AdEntry } from "@/lib/db/schema/ads";
import { PLATFORMS, PLATFORM_LABELS, type Platform } from "@/lib/validators/ads";
import { useLanguage } from "@/lib/i18n";
import { AdEntryCard } from "./_components/ad-entry-card";
import { AnalysisPanel } from "./_components/analysis-panel";
import { LogPostModal } from "./_components/log-post-modal";

export function AdInsightsClient({
  initialEntries,
  initialAnalysis,
}: {
  initialEntries: AdEntry[];
  initialAnalysis: AdAnalysis | null;
}) {
  const { t } = useLanguage();
  const [entries, setEntries] = useState(initialEntries);
  const [platform, setPlatform] = useState<Platform | "all">("all");
  const visible = useMemo(() => entries.filter((entry) => platform === "all" || entry.platform === platform), [entries, platform]);

  async function deleteEntry(entryId: string) {
    setEntries((current) => current.filter((entry) => entry.id !== entryId));
    await fetch(`/api/ads/${entryId}`, { method: "DELETE" });
  }

  return (
    <div className="mx-auto max-w-5xl space-y-8 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{t.adInsights}</h1>
          <p className="text-sm text-muted-foreground">{t.trackOrganicPosts}</p>
        </div>
        <div className="flex items-center gap-2">
          <select value={platform} onChange={(event) => setPlatform(event.target.value as Platform | "all")} className="rounded-md border border-input bg-background px-3 py-2 text-sm">
            <option value="all">{t.allPlatforms}</option>
            {PLATFORMS.map((item) => <option key={item} value={item}>{PLATFORM_LABELS[item]}</option>)}
          </select>
          <LogPostModal onCreated={(entry) => setEntries((current) => [entry, ...current])} />
        </div>
      </div>
      <section className="space-y-3">
        <h2 className="text-sm font-semibold">{t.recentPosts}</h2>
        {visible.map((entry) => <AdEntryCard key={entry.id} entry={entry} onDelete={(id) => void deleteEntry(id)} />)}
        {visible.length === 0 ? <p className="rounded-md border border-border bg-muted p-4 text-sm text-muted-foreground">{t.noPostsYet}</p> : null}
      </section>
      <AnalysisPanel initialAnalysis={initialAnalysis} entryCount={entries.length} />
    </div>
  );
}
