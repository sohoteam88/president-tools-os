"use client";

import { useEffect, useState } from "react";
import { type MomentType } from "@/lib/voice/types";
import { useLanguage } from "@/lib/i18n";
import type { TranslationKeys } from "@/lib/translations";

type Moment = {
  id: string;
  rawText: string;
  momentType: MomentType;
  source: string;
  createdAt: string;
};

const MOMENT_TYPE_KEY_MAP: Record<MomentType, keyof TranslationKeys> = {
  success_story: "momentSuccessStory",
  challenge_overcome: "momentChallengeOvercome",
  lifestyle_glimpse: "momentLifestyleGlimpse",
  product_experience: "momentProductExperience",
  mindset_shift: "momentMindsetShift",
};

export function MomentsList() {
  const { t } = useLanguage();
  const [moments, setMoments] = useState<Moment[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/voice/moments")
      .then((response) => response.json())
      .then((body: { moments?: Moment[] }) => {
        if (!cancelled) setMoments(body.moments ?? []);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  if (isLoading) return <p className="text-sm text-muted-foreground">{t.loading}</p>;
  if (moments.length === 0) {
    return (
      <p className="rounded-md border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
        {t.noMomentsYet}
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">{moments.length} {t.momentsUnit}</p>
      {moments.map((moment) => (
        <article key={moment.id} className="flex items-start gap-3 rounded-md border border-border bg-card p-3">
          <span className="shrink-0 rounded border border-border px-2 py-1 text-xs text-muted-foreground">
            {t[MOMENT_TYPE_KEY_MAP[moment.momentType]]}
          </span>
          <p className="text-sm leading-6">{moment.rawText}</p>
        </article>
      ))}
    </div>
  );
}
