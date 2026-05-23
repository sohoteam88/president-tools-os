/**
 * Login Page — Magic Link Auth
 *
 * No password. Supabase sends a one-time magic link to the user's email.
 * Invite-only system: only users with a prior invite/membership can log in.
 *
 * Flow:
 * 1. User enters email → clicks Send Magic Link
 * 2. Supabase emails OTP link → user clicks → /auth/callback?code=XXX
 * 3. /auth/callback exchanges code → session cookie set → redirect to /dashboard
 *
 * Error states:
 * - ?error=missing_code    — malformed callback
 * - ?error=auth_failed     — Supabase exchange error
 */

"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage({
  searchParams,
}: {
  searchParams: { error?: string; redirectTo?: string };
}) {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "sent" | "error">(
    "idle"
  );
  const [errorMessage, setErrorMessage] = useState("");

  const errorFromCallback = searchParams.error;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email || status === "loading") return;

    setStatus("loading");
    setErrorMessage("");

    const supabase = createClient();

    // Build the redirect URL — after auth callback, go to original destination
    const callbackUrl = new URL("/api/auth/callback", window.location.origin);
    if (searchParams.redirectTo) {
      callbackUrl.searchParams.set("next", searchParams.redirectTo);
    }

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: callbackUrl.toString(),
        shouldCreateUser: false, // Invite-only: block self-signup
      },
    });

    if (error) {
      setStatus("error");
      setErrorMessage(
        error.message.includes("User not found")
          ? "No account found for that email. Contact your upline for an invite."
          : "Something went wrong. Please try again."
      );
      return;
    }

    setStatus("sent");
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm space-y-8">
        {/* Header */}
        <div className="text-center space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            President Tools
          </h1>
          <p className="text-sm text-muted-foreground">
            Internal platform for President Team Malaysia
          </p>
        </div>

        {/* Callback error banner */}
        {errorFromCallback && (
          <div className="rounded-md bg-destructive/10 border border-destructive/20 px-4 py-3 text-sm text-destructive">
            {errorFromCallback === "missing_code"
              ? "The login link was invalid or expired. Please try again."
              : "Authentication failed. Please try again."}
          </div>
        )}

        {status === "sent" ? (
          // Success state
          <div className="rounded-md bg-green-50 border border-green-200 px-4 py-6 text-center space-y-2">
            <p className="text-sm font-medium text-green-800">
              Check your email
            </p>
            <p className="text-sm text-green-700">
              We sent a magic link to <strong>{email}</strong>.
              Click it to sign in.
            </p>
            <button
              type="button"
              onClick={() => setStatus("idle")}
              className="text-xs text-green-600 underline underline-offset-4 hover:text-green-800"
            >
              Use a different email
            </button>
          </div>
        ) : (
          // Login form
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <label
                htmlFor="email"
                className="text-sm font-medium text-foreground"
              >
                Email address
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@email.com"
                required
                autoComplete="email"
                disabled={status === "loading"}
                className="
                  w-full rounded-md border border-input bg-background
                  px-3 py-2 text-sm placeholder:text-muted-foreground
                  focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2
                  disabled:cursor-not-allowed disabled:opacity-50
                "
              />
            </div>

            {status === "error" && (
              <p className="text-sm text-destructive">{errorMessage}</p>
            )}

            <button
              type="submit"
              disabled={!email || status === "loading"}
              className="
                w-full rounded-md bg-primary px-4 py-2
                text-sm font-medium text-primary-foreground
                hover:bg-primary/90
                disabled:cursor-not-allowed disabled:opacity-50
                transition-colors
              "
            >
              {status === "loading" ? "Sending…" : "Send Magic Link"}
            </button>
          </form>
        )}

        <p className="text-center text-xs text-muted-foreground">
          Access is by invite only.{" "}
          <span className="text-muted-foreground/70">
            Contact your upline if you don&apos;t have an account.
          </span>
        </p>
      </div>
    </div>
  );
}
