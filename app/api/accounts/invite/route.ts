/**
 * POST /api/accounts/invite
 *
 * Admin-only endpoint. Creates an invite token for a new downline member.
 *
 * Request body:
 *   { email: string; accountId: string; role?: "owner" | "admin" }
 *
 * Response (200):
 *   { token: string; inviteUrl: string }
 *
 * Response (40x):
 *   { error: string }
 *
 * Security:
 * - requireAdmin() verifies Supabase session + admin role in account_memberships
 * - ADMIN: cross-account query intentional (admin creates invites for any account)
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/session";
import { createInvite, sendInviteEmail } from "@/lib/auth/invite";
import { adminDb } from "@/lib/db/scoped"; // ADMIN: cross-account query intentional

const CreateInviteSchema = z.object({
  email: z.string().email("Invalid email address"),
  accountId: z.string().uuid("Invalid account ID"),
  role: z.enum(["owner", "admin"]).default("owner"),
});

export async function POST(request: NextRequest) {
  // ── Auth guard ────────────────────────────────────────────────────────────
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // ── Parse + validate body ─────────────────────────────────────────────────
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = CreateInviteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Validation error" },
      { status: 400 }
    );
  }

  const { email, accountId, role } = parsed.data;

  // ── Fetch account for the invite email ───────────────────────────────────
  // ADMIN: cross-account query intentional
  const account = await adminDb.accounts.getById(accountId);
  if (!account) {
    return NextResponse.json({ error: "Account not found" }, { status: 404 });
  }

  // ── Create invite token ───────────────────────────────────────────────────
  const result = await createInvite({
    email,
    accountId,
    createdByUserId: admin.userId,
    role,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  // ── Send invite email (stub in dev) ───────────────────────────────────────
  await sendInviteEmail({
    email,
    inviteUrl: result.inviteUrl,
    accountName: account.name,
    inviterName: admin.name,
  });

  return NextResponse.json(
    { token: result.token, inviteUrl: result.inviteUrl },
    { status: 200 }
  );
}
