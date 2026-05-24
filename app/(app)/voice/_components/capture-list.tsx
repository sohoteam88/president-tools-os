"use client";

import { useState } from "react";
import { PlayCircle } from "lucide-react";
import { type VoiceCapture } from "@/lib/db/schema/voice";
import { formatDate } from "@/lib/utils";
import { useLanguage } from "@/lib/i18n";
import type { TranslationKeys } from "@/lib/translations";

interface CaptureListProps {
  captures: VoiceCapture[];
}

const TYPE_KEY_MAP: Record<VoiceCapture["type"], keyof TranslationKeys> = {
  why_story:       "captureTypeWhyStory",
  daily_journey:   "captureTypeDailyJourney",
  weekly_compile:  "captureTypeWeeklyCompile",
};

export function CaptureList({ captures }: CaptureListProps) {
  const { t } = useLanguage();
  const [openId, setOpenId] = useState<string | null>(null);

  return (
    <section className="space-y-3 border-t border-border pt-6">
      <h2 className="text-base font-semibold text-foreground">{t.recentRecordings}</h2>
      {captures.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t.noRecordingsYet}</p>
      ) : (
        <div className="divide-y divide-border rounded-md border border-border">
          {captures.map((capture) => (
            <div key={capture.id} className="space-y-3 p-4">
              <button
                type="button"
                onClick={() => setOpenId(openId === capture.id ? null : capture.id)}
                className="flex w-full items-center justify-between gap-3 text-left"
              >
                <span>
                  <span className="block text-sm font-medium">
                    {t[TYPE_KEY_MAP[capture.type]]}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {formatDate(capture.recordedAt)} ·{" "}
                    {capture.durationSeconds ? `${capture.durationSeconds}s` : "system"}
                  </span>
                </span>
                <span className="rounded-full border border-border px-2 py-1 text-xs">
                  {capture.status}
                </span>
              </button>

              {capture.r2PublicUrl ? (
                <a
                  className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700"
                  href={capture.r2PublicUrl}
                >
                  <PlayCircle className="h-4 w-4" />
                  {t.playback}
                </a>
              ) : null}

              {openId === capture.id ? (
                <p className="text-sm leading-6 text-muted-foreground">
                  {capture.transcriptCleaned ?? capture.transcript ?? t.transcriptNotReady}
                </p>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
