"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import type { ContentDraftSeed } from "@/lib/voice/types";
import { useLanguage } from "@/lib/i18n";
import type { TranslationKeys } from "@/lib/translations";

const FORMAT_KEY_MAP: Record<ContentDraftSeed["suggestedFormat"], keyof TranslationKeys> = {
  story: "formatStory",
  tip: "formatTip",
  testimonial: "formatTestimonial",
  lifestyle: "formatLifestyle",
  education: "formatEducation",
};

export function WeeklySeedsPanel() {
  const { t } = useLanguage();
  const [seeds, setSeeds] = useState<ContentDraftSeed[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/voice/weekly-seeds")
      .then((response) => response.json())
      .then((body: { seeds?: ContentDraftSeed[] }) => {
        if (!cancelled) setSeeds(body.seeds ?? []);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  async function useAsContent(seed: ContentDraftSeed) {
    const response = await fetch("/api/content/drafts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ seedText: seed.seedText, topic: seed.topic }),
    });
    if (response.ok) toast.success(t.sentToContentStudio);
    else toast.error(t.sendFailed);
  }

  if (isLoading) return <p className="text-sm text-muted-foreground">{t.loading}</p>;
  if (seeds.length === 0) {
    return (
      <p className="rounded-md border border-dashed border-border p-8 text-center text-sm leading-6 text-muted-foreground">
        {t.noSeedsYet}
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">{t.weeklySeedsLabel}</p>
      {seeds.map((seed, index) => (
        <article key={`${seed.momentId}-${index}`} className="rounded-md border border-border bg-card p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold">{seed.topic}</h2>
              <p className="mt-1 text-xs text-muted-foreground">{seed.angle}</p>
            </div>
            <span className="rounded bg-muted px-2 py-1 text-xs text-muted-foreground">
              {t[FORMAT_KEY_MAP[seed.suggestedFormat]]}
            </span>
          </div>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">{seed.seedText}</p>
          <button
            type="button"
            onClick={() => void useAsContent(seed)}
            className="mt-3 rounded-md border border-border px-3 py-2 text-sm font-medium"
          >
            {t.useForContent}
          </button>
        </article>
      ))}
    </div>
  );
}
