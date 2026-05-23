/**
 * POST /api/setup/complete
 *
 * Marks the setup wizard as complete for the authenticated account.
 * Updates distributor_seniority, onboarding_path, and setup_wizard_completed_at.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAccountFromSession } from "@/lib/auth/session";
import { scopedDb } from "@/lib/db/scoped";
import { accountSlugSchema } from "@/lib/validators/funnels";

const BodySchema = z.object({
  seniority: z.enum(["new", "mid", "experienced", "senior"]),
  onboardingPath: z.enum(["newbie_full", "experienced_partial", "self_serve"]),
  slug: accountSlugSchema.optional(),
});

export async function POST(request: NextRequest) {
  const session = await getAccountFromSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const db = scopedDb(session.id);

  // Update seniority + path first, then mark wizard complete
  await db.accounts.update({
    distributorSeniority: parsed.data.seniority,
    onboardingPath: parsed.data.onboardingPath,
  });
  if (parsed.data.slug) {
    await db.accounts.setSlug(parsed.data.slug);
  }
  await db.accounts.markSetupComplete();

  await db.audit.log({
    actorUserId: session.userId,
    action: "setup_wizard.completed",
    resourceType: "account",
    resourceId: session.id,
    metadata: JSON.stringify({
      seniority: parsed.data.seniority,
      path: parsed.data.onboardingPath,
    }),
  });

  return NextResponse.json({ ok: true });
}
