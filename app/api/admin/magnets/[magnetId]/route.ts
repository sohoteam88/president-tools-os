import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/session";
import { adminDb } from "@/lib/db/scoped";
import { runComplianceFilter } from "@/lib/compliance/filter";
import { MagnetMetaSchema } from "@/lib/validators/magnets";

export async function PUT(request: NextRequest, { params }: { params: { magnetId: string } }) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = MagnetMetaSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid metadata" }, { status: 400 });
  const compliance = await runComplianceFilter(`${parsed.data.title} ${parsed.data.description}`, admin.id, params.magnetId);
  if (!compliance.passed) return NextResponse.json({ error: "Compliance failed", flags: compliance.flags }, { status: 422 });
  // ADMIN: cross-account query intentional
  const magnet = await adminDb.magnets.update(params.magnetId, parsed.data);
  return NextResponse.json({ data: { magnet } });
}
