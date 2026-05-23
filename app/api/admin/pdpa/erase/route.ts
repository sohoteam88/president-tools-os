/**
 * POST /api/admin/pdpa/erase
 *
 * Admin-only. Anonymizes all PII for a data subject identified by WhatsApp number.
 * Used to comply with PDPA deletion requests.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/session";
import { adminDb } from "@/lib/db/scoped";
import { eraseDataByWhatsApp } from "@/lib/pdpa/erase";
import { normaliseWhatsAppNumber } from "@/lib/funnels/whatsapp";

const BodySchema = z.object({
  whatsappNumber: z.string().min(8).max(20),
  accountId: z.string().uuid(),
  reason: z.string().min(5).max(200),
});

export async function POST(request: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = BodySchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  const normalised = normaliseWhatsAppNumber(body.data.whatsappNumber);
  const result = await eraseDataByWhatsApp(normalised, body.data.accountId);

  await adminDb.audit.log({
    actorUserId: admin.userId,
    accountId: body.data.accountId,
    action: "pdpa.erasure",
    resourceType: "data_subject",
    resourceId: normalised,
    metadata: JSON.stringify({
      reason: body.data.reason,
      recordsAnonymized: result,
    }),
  });

  return NextResponse.json({ ok: true, result });
}
