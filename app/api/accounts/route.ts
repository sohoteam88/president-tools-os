/**
 * GET  /api/accounts      — List all accounts (admin only)
 * POST /api/accounts      — Create a new account (admin only)
 *
 * Security:
 * - requireAdmin() enforces admin role
 * - ADMIN: cross-account queries intentional
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/session";
import { adminDb } from "@/lib/db/scoped"; // ADMIN: cross-account query intentional
import { accountSlugSchema } from "@/lib/validators/funnels";

// ─── GET /api/accounts ────────────────────────────────────────────────────────

export async function GET(_request: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // ADMIN: cross-account query intentional
  const accounts = await adminDb.accounts.listAll();

  return NextResponse.json({ accounts }, { status: 200 });
}

// ─── POST /api/accounts ───────────────────────────────────────────────────────

const CreateAccountSchema = z.object({
  name: z.string().min(1, "Name is required").max(200),
  herbalife_id: z.string().optional(),
  distributor_seniority: z
    .enum(["new", "mid", "experienced", "senior"])
    .default("new"),
  onboarding_path: z
    .enum(["newbie_full", "experienced_partial", "self_serve"])
    .default("newbie_full"),
  slug: accountSlugSchema.optional(),
});

export async function POST(request: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = CreateAccountSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Validation error" },
      { status: 400 }
    );
  }

  // ADMIN: cross-account query intentional — Drizzle camelCase matches schema column names
  const account = await adminDb.accounts.create({
    name: parsed.data.name,
    herbalifeId: parsed.data.herbalife_id,
    distributorSeniority: parsed.data.distributor_seniority,
    onboardingPath: parsed.data.onboarding_path,
    slug: parsed.data.slug,
    isActive: true,
  });

  if (!account) {
    return NextResponse.json({ error: "Failed to create account" }, { status: 500 });
  }

  // Audit log
  await adminDb.audit.log({
    accountId: account.id,
    actorUserId: admin.userId,
    action: "account.created",
    resourceType: "account",
    resourceId: account.id,
    metadata: JSON.stringify({ name: account.name }),
  });

  return NextResponse.json({ account }, { status: 201 });
}
