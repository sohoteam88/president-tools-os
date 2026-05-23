/**
 * Setup Wizard — Onboarding Placeholder
 *
 * Route: /setup
 * Required after terms acceptance, before accessing the app.
 *
 * Phase 1: Minimal — collects distributor seniority + onboarding path.
 * Phase 2: Full wizard with Voice Capture integration.
 *
 * On completion: marks setup_wizard_completed_at and redirects to /dashboard.
 */

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Seniority = "new" | "mid" | "experienced" | "senior";
type OnboardingPath = "newbie_full" | "experienced_partial" | "self_serve";

const SENIORITY_OPTIONS: { value: Seniority; label: string; description: string }[] = [
  { value: "new", label: "Brand New", description: "Less than 6 months as a distributor" },
  { value: "mid", label: "Growing", description: "6 months to 2 years experience" },
  { value: "experienced", label: "Experienced", description: "2–5 years, building a team" },
  { value: "senior", label: "Senior Leader", description: "5+ years, President Team level" },
];

export default function SetupPage() {
  const router = useRouter();
  const [seniority, setSeniority] = useState<Seniority | null>(null);
  const [slug, setSlug] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");

  // Auto-derive onboarding path from seniority
  function getOnboardingPath(s: Seniority): OnboardingPath {
    if (s === "new") return "newbie_full";
    if (s === "mid") return "experienced_partial";
    return "self_serve";
  }

  async function handleSubmit() {
    if (!seniority || status === "loading") return;
    setStatus("loading");

    const response = await fetch("/api/setup/complete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        seniority,
        onboardingPath: getOnboardingPath(seniority),
        slug: slug || undefined,
      }),
    });

    if (!response.ok) {
      setStatus("error");
      return;
    }

    router.push("/dashboard");
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-md space-y-8">
        <div className="space-y-1">
          <h1 className="text-xl font-semibold text-foreground">Quick Setup</h1>
          <p className="text-sm text-muted-foreground">
            Tell us a bit about yourself so we can tailor your experience.
          </p>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium text-foreground" htmlFor="slug">
            Choose your funnel address
          </label>
          <input
            id="slug"
            value={slug}
            onChange={(event) => setSlug(event.target.value.toLowerCase())}
            placeholder="sherry"
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
          <p className="text-xs text-muted-foreground">
            {slug || "your-name"}.yourteam.com
          </p>
        </div>

        <div className="space-y-3">
          <p className="text-sm font-medium text-foreground">
            How long have you been a Herbalife distributor?
          </p>
          {SENIORITY_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setSeniority(opt.value)}
              className={`
                w-full text-left rounded-lg border px-4 py-3 transition-colors
                ${seniority === opt.value
                  ? "border-primary bg-primary/5"
                  : "border-border bg-card hover:border-primary/40"
                }
              `}
            >
              <p className="text-sm font-medium text-foreground">{opt.label}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{opt.description}</p>
            </button>
          ))}
        </div>

        {status === "error" && (
          <p className="text-sm text-destructive">Something went wrong. Please try again.</p>
        )}

        <button
          type="button"
          onClick={handleSubmit}
          disabled={!seniority || status === "loading"}
          className="
            w-full rounded-md bg-primary px-4 py-2.5
            text-sm font-medium text-primary-foreground
            hover:bg-primary/90
            disabled:cursor-not-allowed disabled:opacity-50
            transition-colors
          "
        >
          {status === "loading" ? "Saving…" : "Start Using President Tools →"}
        </button>
      </div>
    </div>
  );
}
