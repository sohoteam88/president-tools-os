/**
 * GET /api/invite/accept?token=XXX&next=/dashboard
 *
 * Called by the auth callback after a user signs in via invite magic link.
 * Accepts the invite token and creates the account membership.
 *
 * This is a redirect-endpoint, not a JSON API. It always returns a redirect.
 *
 * Flow:
 * 1. User clicks invite magic link → /api/auth/callback?code=XXX
 * 2. /api/auth/callback exchanges code → session created → redirects here
 * 3. This route calls acceptInvite(token, userId)
 * 4. Redirects to /dashboard (or `next` param)
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { acceptInvite } from "@/lib/auth/invite";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const token = searchParams.get("token");
  const next = searchParams.get("next") ?? "/dashboard";

  if (!token) {
    return NextResponse.redirect(new URL("/login?error=missing_token", origin));
  }

  // Get authenticated user
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    // Not authenticated — redirect back to invite page with token
    return NextResponse.redirect(
      new URL(`/invite/${token}`, origin)
    );
  }

  // Accept the invite and create membership
  const result = await acceptInvite({ token, userId: user.id });

  if (!result.ok) {
    console.error("[invite/accept] acceptInvite failed:", result.error);
    const errorParam = result.error === "expired" ? "invite_expired" : "invite_invalid";
    return NextResponse.redirect(
      new URL(`/login?error=${errorParam}`, origin)
    );
  }

  // Ensure `next` is a relative path (prevent open redirect)
  const safeNext = next.startsWith("/") ? next : "/dashboard";
  return NextResponse.redirect(new URL(safeNext, origin));
}
