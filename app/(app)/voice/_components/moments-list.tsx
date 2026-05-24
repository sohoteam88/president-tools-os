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

function MomentCard({
  moment,
  onDelete,
}: {
  moment: Moment;
  onDelete: (id: string) => void;
}) {
  const { t } = useLanguage();
  const [confirming, setConfirming] = useState(false);

  return (
    <article className="flex items-start gap-3 rounded-md border border-border bg-card p-3">
      <span className="shrink-0 rounded border border-border px-2 py-1 text-xs text-muted-foreground">
        {t[MOMENT_TYPE_KEY_MAP[moment.momentType]]}
      </span>

      <p className="flex-1 text-sm leading-6">{moment.rawText}</p>

      {/* Delete — two-step inline confirm */}
      <div className="shrink-0">
        {confirming ? (
          <span className="flex items-center gap-1.5">
            <span className="text-xs text-muted-foreground">{t.deleteConfirm}</span>
            <button
              type="button"
              onClick={() => { onDelete(moment.id); setConfirming(false); }}
              className="rounded bg-destructive px-2 py-1 text-xs font-medium text-destructive-foreground"
            >
              {t.deleteYes}
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="rounded border border-border px-2 py-1 text-xs font-medium"
            >
              {t.deleteNo}
            </button>
          </span>
        ) : (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className="rounded border border-border px-2 py-1 text-xs text-destructive hover:bg-destructive/10"
          >
            {t.delete}
          </button>
        )}
      </div>
    </article>
  );
}

export function MomentsList() {
  const { t } = useLanguage();
  const [moments, setMoments] = useState<Moment[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/voice/moments")
      .then((r) => r.json())
      .then((body: { moments?: Moment[] }) => {
        if (!cancelled) setMoments(body.moments ?? []);
      })
      .finally(() => { if (!cancelled) setIsLoading(false); });
    return () => { cancelled = true; };
  }, []);

  function deleteMoment(id: string) {
    // Optimistic remove
    setMoments((prev) => prev.filter((m) => m.id !== id));
    void fetch(`/api/voice/moments/${id}`, { method: "DELETE" });
  }

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
        <MomentCard key={moment.id} moment={moment} onDelete={deleteMoment} />
      ))}
    </div>
  );
}
