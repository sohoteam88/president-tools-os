import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/session";
import { adminDb } from "@/lib/db/scoped";
import { checkResponseCompliance } from "@/lib/objections/check";
import { ResponseSchema } from "@/lib/validators/objections";

type Params = { params: { responseId: string } };

export async function PUT(request: NextRequest, { params }: Params) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = ResponseSchema.partial().safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid response" }, { status: 400 });
  const current = await adminDb.objections.get(params.responseId);
  if (!current) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const data = { ...parsed.data };
  if (parsed.data.title || parsed.data.responseText) {
    const compliance = await checkResponseCompliance(parsed.data.responseText ?? current.responseText, parsed.data.title ?? current.title);
    Object.assign(data, {
      complianceStatus: compliance.passed ? "passed" : "flagged",
      complianceFlags: compliance.flags.length > 0 ? JSON.stringify(compliance.flags) : null,
    });
  }
  const response = await adminDb.objections.update(params.responseId, data);
  return NextResponse.json({ response });
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await adminDb.objections.delete(params.responseId);
  return NextResponse.json({ ok: true });
}
