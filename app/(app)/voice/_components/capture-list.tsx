"use client";

import { useState } from "react";
import { PlayCircle } from "lucide-react";
import { type VoiceCapture } from "@/lib/db/schema/voice";
import { formatDate } from "@/lib/utils";

interface CaptureListProps {
  captures: VoiceCapture[];
}

const typeLabels: Record<VoiceCapture["type"], string> = {
  why_story: "Why Story",
  daily_journey: "Daily Journey",
  weekly_compile: "Weekly Compile",
};

export function CaptureList({ captures }: CaptureListProps) {
  const [openId, setOpenId] = useState<string | null>(null);

  return (
    <section className="space-y-3 border-t border-border pt-6">
      <h2 className="text-base font-semibold text-foreground">Recent Recordings</h2>
      {captures.length === 0 ? (
        <p className="text-sm text-muted-foreground">No recordings yet.</p>
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
                  <span className="block text-sm font-medium">{typeLabels[capture.type]}</span>
                  <span className="text-xs text-muted-foreground">
                    {formatDate(capture.recordedAt)} · {capture.durationSeconds ? `${capture.durationSeconds}s` : "system"}
                  </span>
                </span>
                <span className="rounded-full border border-border px-2 py-1 text-xs">{capture.status}</span>
              </button>

              {capture.r2PublicUrl ? (
                <a className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700" href={capture.r2PublicUrl}>
                  <PlayCircle className="h-4 w-4" />
                  Playback
                </a>
              ) : null}

              {openId === capture.id ? (
                <p className="text-sm leading-6 text-muted-foreground">
                  {capture.transcriptCleaned ?? capture.transcript ?? "Transcript not ready yet."}
                </p>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
