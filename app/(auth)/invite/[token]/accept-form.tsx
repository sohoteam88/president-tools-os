/**
 * Invite Accept Form (Client Component)
 *
 * Sends a magic link to the invited email.
 * The callback URL includes the invite token so acceptInvite() is triggered
 * after the user successfully authenticates.
 */

"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

interface Props {
  token: string;
  email: string;
}

export function InviteAcceptForm({ token, email }: Props) {
  const [status, setStatus] = useState<"idle" | "loading" | "sent" | "error">(
    "idle"
  );
  const [errorMessage, setErrorMessage] = useState("");

  async function handleAccept() {
    if (status === "loading") return;
    setStatus("loading");
    setErrorMessage("");

    const supabase = createClient();

    // After auth, redirect to a route that calls acceptInvite(token, userId)
    // We use the token page itself as the post-auth landing, which will call the API
    const callbackUrl = new URL("/api/auth/callback", window.location.origin);
    callbackUrl.searchParams.set("next", `/api/invite/accept?token=${token}&next=/dashboard`);

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: callbackUrl.toString(),
        shouldCreateUser: true, // Allow new users to be created via invite
      },
    });

    if (error) {
      setStatus("error");
      setErrorMessage("Failed to send magic link. Please try again.");
      return;
    }

    setStatus("sent");
  }

  if (status === "sent") {
    return (
      <div className="rounded-md bg-green-50 border border-green-200 px-4 py-6 text-center space-y-2">
        <p className="text-sm font-medium text-green-800">Check your email</p>
        <p className="text-sm text-green-700">
          We sent a magic link to <strong>{email}</strong>.
          Click it to complete your registration.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {status === "error" && (
        <p className="text-sm text-destructive text-center">{errorMessage}</p>
      )}

      <div className="rounded-md border border-border bg-muted/30 px-4 py-3 text-center">
        <p className="text-xs text-muted-foreground mb-1">Accepting invite for</p>
        <p className="text-sm font-medium text-foreground">{email}</p>
      </div>

      <button
        type="button"
        onClick={handleAccept}
        disabled={status === "loading"}
        className="
          w-full rounded-md bg-primary px-4 py-2
          text-sm font-medium text-primary-foreground
          hover:bg-primary/90
          disabled:cursor-not-allowed disabled:opacity-50
          transition-colors
        "
      >
        {status === "loading" ? "Sending magic link…" : "Accept Invite"}
      </button>
    </div>
  );
}
