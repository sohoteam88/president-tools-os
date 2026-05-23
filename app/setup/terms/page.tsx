/**
 * Terms Acceptance Page
 *
 * Route: /setup/terms
 * Required before accessing any app features.
 *
 * Covers:
 * - Platform terms of use
 * - PDPA (Malaysia Personal Data Protection Act) consent
 * - Herbalife compliance acknowledgment
 *
 * PDPA compliance: Terms version is recorded in accounts.terms_version
 * so we can re-prompt if terms change materially.
 *
 * Phase 1: Basic acceptance with API call.
 * Phase 2: Add full legal text, scroll-to-bottom requirement.
 */

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const TERMS_VERSION = "v1.0-2026-05";

export default function TermsPage() {
  const router = useRouter();
  const [agreed, setAgreed] = useState(false);
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");

  async function handleAccept() {
    if (!agreed || status === "loading") return;
    setStatus("loading");

    const response = await fetch("/api/setup/terms", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ version: TERMS_VERSION }),
    });

    if (!response.ok) {
      setStatus("error");
      return;
    }

    router.push("/setup");
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-lg space-y-6">
        <div className="space-y-1">
          <h1 className="text-xl font-semibold text-foreground">
            Terms & Data Protection
          </h1>
          <p className="text-sm text-muted-foreground">
            Please read and accept before continuing.
          </p>
        </div>

        <div className="rounded-lg border border-border bg-card p-5 space-y-4 text-sm text-foreground leading-relaxed max-h-72 overflow-y-auto">
          <p className="font-medium">1. Platform Usage</p>
          <p className="text-muted-foreground">
            President Tools is an internal tool provided exclusively to members
            of President Team Malaysia. All features must be used in accordance
            with Herbalife Malaysia&apos;s distributor guidelines and the Direct
            Sales Association Malaysia code of conduct.
          </p>

          <p className="font-medium">2. Compliance Requirements</p>
          <p className="text-muted-foreground">
            You agree not to make unsubstantiated income, product, or health claims.
            All content generated or published using this platform must comply with
            Herbalife&apos;s official marketing guidelines. The platform&apos;s
            compliance filter will flag and block non-compliant content.
          </p>

          <p className="font-medium">3. Personal Data (PDPA)</p>
          <p className="text-muted-foreground">
            Under Malaysia&apos;s Personal Data Protection Act 2010 (PDPA), we
            collect and process your name, email, voice recordings, and activity
            data to operate this platform. Your data is stored securely and never
            shared with third parties without consent. You may request access,
            correction, or deletion of your data at any time by contacting your
            upline.
          </p>

          <p className="font-medium">4. Voice Recordings</p>
          <p className="text-muted-foreground">
            Voice recordings you submit are used solely to generate personalised
            content within this platform. They are stored securely and are never
            used to train AI models or shared externally.
          </p>
        </div>

        <div className="flex items-start gap-3">
          <input
            id="agree"
            type="checkbox"
            checked={agreed}
            onChange={(e) => setAgreed(e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-border"
          />
          <label htmlFor="agree" className="text-sm text-foreground leading-snug">
            I have read and agree to the platform terms, compliance requirements,
            and PDPA data collection consent above.
          </label>
        </div>

        {status === "error" && (
          <p className="text-sm text-destructive">
            Something went wrong. Please try again.
          </p>
        )}

        <button
          type="button"
          onClick={handleAccept}
          disabled={!agreed || status === "loading"}
          className="
            w-full rounded-md bg-primary px-4 py-2.5
            text-sm font-medium text-primary-foreground
            hover:bg-primary/90
            disabled:cursor-not-allowed disabled:opacity-50
            transition-colors
          "
        >
          {status === "loading" ? "Saving…" : "Accept & Continue"}
        </button>
      </div>
    </div>
  );
}
