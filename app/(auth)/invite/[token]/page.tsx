/**
 * Invite Acceptance Page
 *
 * Route: /invite/[token]
 * Public — no auth required. The token IS the auth.
 *
 * Flow:
 * 1. User clicks invite link in email → lands here
 * 2. Page validates the token (server-side)
 * 3. If valid: shows "Accept Invite" UI → sends magic link to their email
 * 4. Magic link → /auth/callback → session created → acceptInvite() called → /dashboard
 *
 * The acceptInvite() call happens in the auth callback after the user signs in.
 * We pass the token through the `next` param so the callback knows to call it.
 *
 * Token is stored in state client-side — no sensitive data exposed in URL after load.
 */

import { validateInvite } from "@/lib/auth/invite";
import { InviteAcceptForm } from "./accept-form";

interface Props {
  params: { token: string };
}

export default async function InvitePage({ params }: Props) {
  const { token } = params;

  // Server-side validation — check token before rendering anything
  const result = await validateInvite(token);

  if (!result.ok) {
    const messages: Record<typeof result.error, string> = {
      not_found: "This invite link doesn't exist or has already been used.",
      expired: "This invite link has expired. Ask your upline to send a new one.",
      already_used: "This invite has already been accepted. Try logging in instead.",
    };

    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-4">
        <div className="w-full max-w-sm space-y-6 text-center">
          <h1 className="text-2xl font-semibold text-foreground">
            Invite Link Invalid
          </h1>
          <p className="text-sm text-muted-foreground">
            {messages[result.error]}
          </p>
          <a
            href="/login"
            className="text-sm text-primary underline underline-offset-4 hover:text-primary/80"
          >
            Go to login
          </a>
        </div>
      </div>
    );
  }

  const { invite } = result;

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm space-y-8">
        <div className="text-center space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            You&apos;re invited!
          </h1>
          <p className="text-sm text-muted-foreground">
            Join <strong>{invite.accountName}</strong> on President Tools
          </p>
        </div>

        <div className="rounded-md border border-border bg-card px-4 py-4 space-y-1">
          <p className="text-xs text-muted-foreground">Invite details</p>
          <p className="text-sm font-medium text-foreground">{invite.email}</p>
          <p className="text-xs text-muted-foreground capitalize">
            Role: {invite.role}
          </p>
        </div>

        <InviteAcceptForm token={token} email={invite.email} />

        <p className="text-center text-xs text-muted-foreground">
          By accepting this invite you agree to use this platform in accordance
          with Herbalife Malaysia&apos;s guidelines.
        </p>
      </div>
    </div>
  );
}
