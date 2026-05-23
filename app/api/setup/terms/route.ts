/**
 * POST /api/setup/terms
 *
 * Records terms acceptance for the authenticated user's account.
 * Called from /setup/terms page.
 *
 * Body: { version: string }
 *
 * Updates accounts.terms_accepted_at + accounts.terms_version.
 * Writes audit log entry.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAccountFromSession } from "@/lib/auth/session";
import { scopedDb } from "@/lib/db/scoped";

const BodySchema = z.object({
  version: z.string().min(1),
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

  await db.accounts.acceptTerms(parsed.data.version);

  await db.audit.log({
    actorUserId: session.userId,
    action: "terms.accepted",
    resourceType: "account",
    resourceId: session.id,
    metadata: JSON.stringify({ version: parsed.data.version }),
  });

  return NextResponse.json({ ok: true });
}
