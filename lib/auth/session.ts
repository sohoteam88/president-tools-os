/**
 * getAccountFromSession — The first line of every route handler.
 *
 * Resolves the authenticated user → their account membership → account.
 * Returns null if unauthenticated or no account found.
 *
 * Usage in every route handler:
 *   const account = await getAccountFromSession(req);
 *   if (!account) return new Response('Unauthorized', { status: 401 });
 *   const userDb = scopedDb(account.id);
 *
 * This function validates against BOTH:
 * - Supabase Auth session (JWT)
 * - account_memberships table (account exists + user is member)
 */

import { createClient } from "@/lib/supabase/server";
import { adminDb } from "@/lib/db/scoped";
import type { Account } from "@/lib/db/schema/accounts";

export type SessionAccount = {
  id: string;           // account_id
  name: string;
  slug: string | null;
  isActive: boolean;
  distributorSeniority: "new" | "mid" | "experienced" | "senior";
  onboardingPath: "newbie_full" | "experienced_partial" | "self_serve";
  setupWizardCompletedAt: Date | null;
  voiceCaptureCompletedAt: Date | null;
  termsAcceptedAt: Date | null;
  userId: string;       // auth.users.id
  userEmail: string;
  role: "owner" | "admin";
};

/**
 * Resolves the session account from the current request's cookies.
 * Returns null if not authenticated or no account membership found.
 */
export async function getAccountFromSession(
  _req?: Request
): Promise<SessionAccount | null> {
  const supabase = await createClient();

  // 1. Verify auth session
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return null;
  }

  // 2. Look up account membership
  const membership = await adminDb.memberships.getPrimaryAccount(user.id);

  if (!membership || !membership.account.isActive) {
    return null;
  }

  return {
    id: membership.account.id,
    name: membership.account.name,
    slug: membership.account.slug,
    isActive: membership.account.isActive,
    distributorSeniority: membership.account.distributorSeniority,
    onboardingPath: membership.account.onboardingPath,
    setupWizardCompletedAt: membership.account.setupWizardCompletedAt,
    voiceCaptureCompletedAt: membership.account.voiceCaptureCompletedAt,
    termsAcceptedAt: membership.account.termsAcceptedAt,
    userId: user.id,
    userEmail: user.email ?? "",
    role: membership.role,
  };
}

/**
 * Require admin role. Returns null if user is not an admin.
 * Use in admin-only route handlers.
 */
export async function requireAdmin(
  req?: Request
): Promise<SessionAccount | null> {
  const account = await getAccountFromSession(req);
  if (!account || account.role !== "admin") {
    return null;
  }
  return account;
}

/**
 * Check if the user needs to complete onboarding before accessing the app.
 * Returns the step they should be redirected to.
 */
export function getOnboardingRedirect(account: SessionAccount): string | null {
  if (!account.termsAcceptedAt) {
    return "/setup/terms";
  }
  if (!account.setupWizardCompletedAt) {
    return "/setup";
  }
  return null;
}

/**
 * Server Component helper: get the current session account.
 * Use in layouts and pages (not route handlers).
 */
export async function getServerAccount(): Promise<SessionAccount | null> {
  return getAccountFromSession();
}
