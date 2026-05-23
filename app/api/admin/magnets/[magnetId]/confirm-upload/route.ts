import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/session";
import { adminDb } from "@/lib/db/scoped";
import { db } from "@/lib/db";
import { leadMagnets } from "@/lib/db/schema";
import { eq, sql } from "drizzle-orm";

export async function POST(_request: NextRequest, { params }: { params: { magnetId: string } }) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  // ADMIN: cross-account query intentional
  await db
    .update(leadMagnets)
    .set({ version: sql`${leadMagnets.version} + 1`, updatedAt: new Date() })
    .where(eq(leadMagnets.id, params.magnetId));
  // ADMIN: cross-account query intentional
  await adminDb.magnets.invalidatePersonalisedPdfs();
  await adminDb.audit.log({
    accountId: admin.id,
    actorUserId: admin.userId,
    action: "magnet.pdf_updated",
    resourceType: "lead_magnet",
    resourceId: params.magnetId,
  });
  return NextResponse.json({ ok: true });
}
