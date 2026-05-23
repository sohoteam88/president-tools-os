"use client";

import { useMemo, useState } from "react";
import { RefreshCw } from "lucide-react";
import { type VoiceProfile } from "@/lib/db/schema/voice";
import { voiceProfileJsonSchema, type VoiceProfileJson } from "@/lib/validators/voice";
import { useLanguage } from "@/lib/i18n";

interface VoiceProfileCardProps {
  profile: VoiceProfile | null;
}

export function VoiceProfileCard({ profile }: VoiceProfileCardProps) {
  const { t } = useLanguage();
  const [message, setMessage] = useState<string | null>(null);
  const parsed = useMemo<VoiceProfileJson | null>(() => {
    if (!profile) return null;
    return voiceProfileJsonSchema.safeParse(JSON.parse(profile.profileJson)).data ?? null;
  }, [profile]);

  async function rebuild() {
    setMessage(t.rebuildRequested);
    const response = await fetch("/api/voice/profile/rebuild", { method: "POST" });
    setMessage(response.ok ? t.profileRebuildQueued : t.rebuildCoolingDown);
  }

  return (
    <section className="space-y-4 border-t border-border pt-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-foreground">{t.voiceProfile}</h2>
          <p className="text-sm text-muted-foreground">
            {profile ? `${t.builtFrom} ${profile.sourceCaptureCount ?? 0} ${t.recordings}` : t.notBuiltYet}
          </p>
        </div>
        <button
          type="button"
          onClick={rebuild}
          className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm font-medium"
        >
          <RefreshCw className="h-4 w-4" />
          {t.rebuild}
        </button>
      </div>

      {parsed ? (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2 text-xs font-medium">
            <span className="rounded-full bg-emerald-50 px-2 py-1 text-emerald-700">{parsed.energy_level}</span>
            <span className="rounded-full bg-sky-50 px-2 py-1 text-sky-700">{parsed.vocabulary_level}</span>
            <span className="rounded-full bg-amber-50 px-2 py-1 text-amber-700">{parsed.sentence_rhythm}</span>
          </div>
          <p className="text-sm leading-6 text-foreground">{parsed.summary}</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <TagGroup title={t.commonPhrases} values={parsed.common_phrases} />
            <TagGroup title={t.topicsLabel} values={parsed.topics_they_return_to} />
          </div>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">{t.voiceProfileEmpty}</p>
      )}

      {message ? <p className="text-xs text-muted-foreground">{message}</p> : null}
    </section>
  );
}

function TagGroup({ title, values }: { title: string; values: string[] }) {
  return (
    <div>
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</h3>
      <div className="flex flex-wrap gap-2">
        {values.map((value) => (
          <span key={value} className="rounded-md border border-border px-2 py-1 text-xs">
            {value}
          </span>
        ))}
      </div>
    </div>
  );
}
