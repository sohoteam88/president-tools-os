"use client";

import { useState } from "react";
import { toast } from "sonner";
import { useLanguage } from "@/lib/i18n";
import { AudioRecorder } from "./_components/audio-recorder";
import { DailyCaptureForm } from "./_components/daily-capture-form";
import { MomentsList } from "./_components/moments-list";
import { WeeklySeedsPanel } from "./_components/weekly-seeds-panel";
import { WhyStorySession } from "./_components/why-story-session";

type TabId = "capture" | "why-story" | "moments" | "seeds";

export default function VoicePage() {
  const { t } = useLanguage();
  const [activeTab, setActiveTab] = useState<TabId>("capture");

  // Transcript review state for the capture tab
  const [transcript, setTranscript] = useState("");
  const [hasTranscript, setHasTranscript] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const TABS: Array<{ id: TabId; label: string }> = [
    { id: "capture", label: t.voiceTabCapture },
    { id: "why-story", label: t.voiceTabWhyStory },
    { id: "moments", label: t.voiceTabMoments },
    { id: "seeds", label: t.voiceTabSeeds },
  ];

  function handleRecordingComplete(_captureId: string, rawTranscript: string) {
    setTranscript(rawTranscript);
    setHasTranscript(true);
  }

  async function saveTranscriptAsMoment() {
    const text = transcript.trim();
    if (text.length < 10) {
      toast.error(t.atLeast10Chars);
      return;
    }
    setIsSaving(true);
    const response = await fetch("/api/voice/daily-capture", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    setIsSaving(false);
    if (!response.ok) {
      toast.error(t.saveFailed);
      return;
    }
    toast.success(t.savedMoment);
    setTranscript("");
    setHasTranscript(false);
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold text-foreground">{t.voiceCapture}</h1>
        <p className="text-sm text-muted-foreground">{t.voiceCaptureSubtitle}</p>
      </div>

      <div className="flex flex-wrap gap-2 border-b border-border">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={`border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
              activeTab === tab.id
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "capture" ? (
        <div className="space-y-6">
          {/* Audio Recording Section */}
          <section className="rounded-md border border-border bg-card p-5">
            <h2 className="text-base font-semibold">{t.recordYourDay}</h2>
            <div className="mt-4">
              <AudioRecorder
                captureType="daily_journey"
                minSeconds={20}
                maxSeconds={300}
                promptText={t.tapToRecord}
                onComplete={handleRecordingComplete}
              />
            </div>

            {/* Transcript Review */}
            {hasTranscript ? (
              <div className="mt-5 space-y-3 border-t border-border pt-4">
                <p className="text-sm font-medium text-emerald-700 dark:text-emerald-400">
                  {t.transcriptReady}
                </p>
                <textarea
                  value={transcript}
                  onChange={(e) => setTranscript(e.target.value)}
                  rows={5}
                  maxLength={2000}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm leading-6"
                />
                <div className="flex items-center justify-between gap-3">
                  <span className="text-xs text-muted-foreground">{transcript.length} / 2000</span>
                  <button
                    type="button"
                    onClick={() => void saveTranscriptAsMoment()}
                    disabled={isSaving || transcript.trim().length < 10}
                    className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
                  >
                    {isSaving ? t.saving : t.saveAsJourneyMoment}
                  </button>
                </div>
              </div>
            ) : null}
          </section>

          {/* Text Capture Section — always available as an alternative */}
          <div className="space-y-1">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {t.orTypeYourMoment}
            </p>
            <DailyCaptureForm />
          </div>
        </div>
      ) : null}

      {activeTab === "why-story" ? <WhyStorySession /> : null}
      {activeTab === "moments" ? <MomentsList /> : null}
      {activeTab === "seeds" ? <WeeklySeedsPanel /> : null}
    </div>
  );
}
