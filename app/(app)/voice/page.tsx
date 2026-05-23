"use client";

import { useState } from "react";
import { useLanguage } from "@/lib/i18n";
import { DailyCaptureForm } from "./_components/daily-capture-form";
import { MomentsList } from "./_components/moments-list";
import { WeeklySeedsPanel } from "./_components/weekly-seeds-panel";
import { WhyStorySession } from "./_components/why-story-session";

type TabId = "capture" | "why-story" | "moments" | "seeds";

export default function VoicePage() {
  const { t } = useLanguage();
  const [activeTab, setActiveTab] = useState<TabId>("capture");

  const TABS: Array<{ id: TabId; label: string }> = [
    { id: "capture", label: t.voiceTabCapture },
    { id: "why-story", label: t.voiceTabWhyStory },
    { id: "moments", label: t.voiceTabMoments },
    { id: "seeds", label: t.voiceTabSeeds },
  ];

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

      {activeTab === "capture" ? <DailyCaptureForm /> : null}
      {activeTab === "why-story" ? <WhyStorySession /> : null}
      {activeTab === "moments" ? <MomentsList /> : null}
      {activeTab === "seeds" ? <WeeklySeedsPanel /> : null}
    </div>
  );
}
