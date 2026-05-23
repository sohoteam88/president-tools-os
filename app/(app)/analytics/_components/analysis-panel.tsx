"use client";

import { useState } from "react";
import type { AdAnalysis } from "@/lib/db/schema/ads";
import { useLanguage } from "@/lib/i18n";

export function AnalysisPanel({
  initialAnalysis,
  entryCount,
}: {
  initialAnalysis: AdAnalysis | null;
  entryCount: number;
}) {
  const { t } = useLanguage();
  const [analysis, setAnalysis] = useState(initialAnalysis);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function generate() {
    setLoading(true);
    setError("");
    const response = await fetch("/api/ads/analysis", { method: "POST" });
    const body = (await response.json()) as { analysis?: AdAnalysis; error?: string };
    setLoading(false);
    if (!response.ok) {
      setError(body.error ?? t.couldNotAnalyse);
      return;
    }
    setAnalysis(body.analysis ?? null);
  }

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-semibold">{t.aiAnalysis}</h2>
        {entryCount >= 3 ? (
          <button type="button" onClick={() => void generate()} disabled={loading} className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60">
            {loading ? t.analysing : analysis ? t.regenerateAnalysis : t.whatsWorkingBtn}
          </button>
        ) : null}
      </div>
      {entryCount < 3 ? (
        <p className="rounded-md border border-border bg-muted p-4 text-sm text-muted-foreground">
          {t.log3Posts}
        </p>
      ) : null}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {analysis ? (
        <div className="space-y-3 rounded-md border border-border bg-card p-4">
          <p className="whitespace-pre-line text-sm leading-6">{analysis.analysisText}</p>
          <p className="text-xs text-muted-foreground">
            {t.lastAnalysed} {new Date(analysis.analysedAt).toLocaleDateString("en-MY")}
          </p>
        </div>
      ) : null}
    </section>
  );
}
