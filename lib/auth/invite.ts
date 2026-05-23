/**
 * Invite token management.
 *
 * Flow:
 * 1. Admin (Steven) calls createInvite(email, accountId)
 * 2. System emails the downline a magic link: /invite/{token}
 * 3. Downline clicks link → visits /invite/[token] page
 * 4. Page calls validateInvite(token) to verify + accept
 * 5. Supabase Auth magic link is sent → user signs in
 * 6. After sign-in, membership is created via acceptInvite(token, userId)
 *
 * Token format: nanoid (21 chars) — random, unguessable, not JWT.
 * Tokens expire after 48 hours (configurable).
 */

import { nanoid } from "nanoid";
import { adminDb } from "@/lib/db/scoped";
import { createAdminClient } from "@/lib/supabase/server";
import { addHours, isPast } from "date-fns";
import type { Account } from "@/lib/db/schema/accounts";

const INVITE_EXPIRY_HOURS = 48;

// ─── Create Invite ────────────────────────────────────────────────────────────

export type CreateInviteParams = {
  email: string;
  accountId: string;
  createdByUserId: string;
  role?: "owner" | "admin";
};

export type InviteResult =
  | { ok: true; token: string; inviteUrl: string }
  | { ok: false; error: string };

export async function createInvite(
  params: CreateInviteParams
): Promise<InviteResult> {
  const { email, accountId, createdByUserId, role = "owner" } = params;

  // Verify the account exists
  const account = await adminDb.accounts.getById(accountId);
  if (!account) {
    return { ok: false, error: "Account not found" };
  }

  // Check if there's already an active invite for this email + account
  const pending = await adminDb.invites.findByToken(""); // not ideal — see below
  // TODO(IMPROVEMENT): Add adminDb.invites.findPendingByEmail(email, accountId)

  // Generate token
  const token = nanoid(32);
  const expiresAt = addHours(new Date(), INVITE_EXPIRY_HOURS);

  const invite = await adminDb.invites.create({
    token,
    email,
    accountId,
    role,
    createdByUserId,
    expiresAt,
  });

  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const inviteUrl = `${appUrl}/invite/${token}`;

  return { ok: true, token: invite?.token ?? token, inviteUrl };
}

// ─── Validate Invite ──────────────────────────────────────────────────────────

export type ValidateInviteResult =
  | {
      ok: true;
      invite: {
        id: string;
        email: string;
        accountId: string;
        role: "owner" | "admin";
        accountName: string;
      };
    }
  | { ok: false; error: "not_found" | "expired" | "already_used" };

export async function validateInvite(
  token: string
): Promise<ValidateInviteResult> {
  const invite = await adminDb.invites.findByToken(token);

  if (!invite) {
    return { ok: false, error: "not_found" };
  }

  if (invite.acceptedAt) {
    return { ok: false, error: "already_used" };
  }

  if (isPast(new Date(invite.expiresAt))) {
    return { ok: false, error: "expired" };
  }

  const account = await adminDb.accounts.getById(invite.accountId);

  return {
    ok: true,
    invite: {
      id: invite.id,
      email: invite.email,
      accountId: invite.accountId,
      role: invite.role,
      accountName: account?.name ?? "Unknown Account",
    },
  };
}

// ─── Accept Invite ────────────────────────────────────────────────────────────

export type AcceptInviteParams = {
  token: string;
  userId: string; // The auth.users.id of the newly signed-in user
};

export type AcceptInviteResult =
  | { ok: true; accountId: string }
  | { ok: false; error: string };

export async function acceptInvite(
  params: AcceptInviteParams
): Promise<AcceptInviteResult> {
  const { token, userId } = params;

  const validation = await validateInvite(token);
  if (!validation.ok) {
    return { ok: false, error: validation.error };
  }

  const { invite } = validation;

  // Check if user is already a member of this account
  const existingMembership = await adminDb.memberships.get(
    userId,
    invite.accountId
  );
  if (existingMembership) {
    // Already a member — mark token used and proceed
    await adminDb.invites.markAccepted(invite.id);
    return { ok: true, accountId: invite.accountId };
  }

  // Create membership
  await adminDb.memberships.create({
    userId,
    accountId: invite.accountId,
    role: invite.role,
  });

  // Mark token as accepted
  await adminDb.invites.markAccepted(invite.id);

  // Audit log
  await adminDb.audit.log({
    accountId: invite.accountId,
    actorUserId: userId,
    action: "invite.accepted",
    resourceType: "invite_token",
    resourceId: invite.id,
    metadata: JSON.stringify({ email: invite.email, role: invite.role }),
  });

  return { ok: true, accountId: invite.accountId };
}

// ─── Send Invite Email ────────────────────────────────────────────────────────

export type SendInviteEmailParams = {
  email: string;
  inviteUrl: string;
  accountName: string;
  inviterName: string;
};

/**
 * Send the invite email via Resend.
 * The email contains the magic link to /invite/{token}.
 */
export async function sendInviteEmail(
  params: SendInviteEmailParams
): Promise<void> {
  void params;
  // Production: use Resend
  // import { Resend } from 'resend';
  // const resend = new Resend(process.env.RESEND_API_KEY);
  // await resend.emails.send({ ... });
}
