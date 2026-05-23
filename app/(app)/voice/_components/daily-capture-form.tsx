"use client";

import { useState } from "react";
import { toast } from "sonner";
import { type MomentType } from "@/lib/voice/types";
import { useLanguage } from "@/lib/i18n";
import type { TranslationKeys } from "@/lib/translations";

const MOMENT_TYPE_KEY_MAP: Record<MomentType, keyof TranslationKeys> = {
  success_story: "momentSuccessStory",
  challenge_overcome: "momentChallengeOvercome",
  lifestyle_glimpse: "momentLifestyleGlimpse",
  product_experience: "momentProductExperience",
  mindset_shift: "momentMindsetShift",
};

export function DailyCaptureForm() {
  const { t } = useLanguage();
  const [text, setText] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [lastType, setLastType] = useState<MomentType | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (text.trim().length < 10) {
      toast.error(t.atLeast10Chars);
      return;
    }
    setIsLoading(true);
    const response = await fetch("/api/voice/daily-capture", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    const body = (await response.json().catch(() => ({}))) as { momentType?: MomentType; error?: unknown };
    setIsLoading(false);
    if (!response.ok || !body.momentType) {
      toast.error(t.saveFailed);
      return;
    }
    setLastType(body.momentType);
    setText("");
    toast.success(t.savedMoment);
  }

  return (
    <section className="rounded-md border border-border bg-card p-5">
      <h2 className="text-base font-semibold">{t.dailyCaptureTitle}</h2>
      <form onSubmit={handleSubmit} className="mt-4 space-y-3">
        <textarea
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder={t.dailyCapturePlaceholder}
          rows={4}
          maxLength={2000}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm leading-6"
        />
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs text-muted-foreground">{text.length} / 2000</span>
          <button
            type="submit"
            disabled={isLoading || text.trim().length < 10}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
          >
            {isLoading ? t.saving : t.saveMoment}
          </button>
        </div>
        {lastType ? (
          <p className="text-xs text-muted-foreground">
            {t.classifiedAs} {t[MOMENT_TYPE_KEY_MAP[lastType]]}
          </p>
        ) : null}
      </form>
    </section>
  );
}
