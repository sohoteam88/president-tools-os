/**
 * Supabase Auth Callback Handler
 *
 * Handles the redirect from Supabase after:
 * - Magic link email click
 * - OTP verification
 *
 * Flow:
 * 1. Supabase sends user to /auth/callback?code=XXX
 * 2. This route exchanges the code for a session
 * 3. Redirects to original destination (or /dashboard)
 *
 * Reference: https://supabase.com/docs/guides/auth/server-side/nextjs
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? origin;
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/dashboard";

  if (!code) {
    // No code — malformed callback; redirect to login with error
    const loginUrl = new URL("/login", appUrl);
    loginUrl.searchParams.set("error", "missing_code");
    return NextResponse.redirect(loginUrl);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    console.error("[auth/callback] Code exchange failed:", error.message);
    const loginUrl = new URL("/login", appUrl);
    loginUrl.searchParams.set("error", "auth_failed");
    return NextResponse.redirect(loginUrl);
  }

  // Successful auth — redirect to intended destination
  // Ensure `next` is a relative path (prevent open redirect)
  const safeNext = next.startsWith("/") ? next : "/dashboard";
  return NextResponse.redirect(new URL(safeNext, appUrl));
}
