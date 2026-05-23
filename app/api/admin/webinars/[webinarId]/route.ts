import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/session";
import { adminDb } from "@/lib/db/scoped";
import { runComplianceFilter } from "@/lib/compliance/filter";
import { WebinarMetaSchema } from "@/lib/validators/webinars";

export async function PUT(request: NextRequest, { params }: { params: { webinarId: string } }) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = WebinarMetaSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid webinar metadata" }, { status: 400 });
  const compliance = await runComplianceFilter(`${parsed.data.title} ${parsed.data.description}`, admin.id, params.webinarId);
  if (!compliance.passed) return NextResponse.json({ error: "Compliance failed", flags: compliance.flags }, { status: 422 });
  // ADMIN: cross-account query intentional
  const webinar = await adminDb.webinars.update(params.webinarId, parsed.data);
  return NextResponse.json({ data: { webinar } });
}
