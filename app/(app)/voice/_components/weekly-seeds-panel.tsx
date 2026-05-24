"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Sparkles, Loader2 } from "lucide-react";
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
  const [isGenerating, setIsGenerating] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/voice/weekly-seeds")
      .then((r) => r.json())
      .then((body: { seeds?: ContentDraftSeed[] }) => {
        if (!cancelled) setSeeds(body.seeds ?? []);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  async function generateSeeds() {
    setIsGenerating(true);
    const response = await fetch("/api/voice/weekly-seeds", { method: "POST" });
    const body = (await response.json()) as { seeds?: ContentDraftSeed[]; error?: string };
    setIsGenerating(false);
    if (!response.ok || !body.seeds) {
      toast.error(body.error ?? t.needMomentsFirst);
      return;
    }
    setSeeds(body.seeds);
    toast.success(t.seedsGenerated);
  }

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

  return (
    <div className="space-y-4">
      {/* Generate button — always visible */}
      <button
        type="button"
        onClick={() => void generateSeeds()}
        disabled={isGenerating}
        className="inline-flex items-center gap-2 rounded-md border border-border bg-card px-4 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50"
      >
        {isGenerating ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Sparkles className="h-4 w-4 text-amber-500" />
        )}
        {isGenerating ? t.generatingSeeds : t.generateWeeklySeeds}
      </button>

      {seeds.length === 0 ? (
        <p className="rounded-md border border-dashed border-border p-8 text-center text-sm leading-6 text-muted-foreground">
          {t.noSeedsYet}
        </p>
      ) : (
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">{t.weeklySeedsLabel}</p>
          {seeds.map((seed, index) => (
            <article
              key={`${seed.momentId}-${index}`}
              className="rounded-md border border-border bg-card p-4"
            >
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
      )}
    </div>
  );
}
