import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/session";
import { adminDb } from "@/lib/db/scoped";

type Params = { params: { responseId: string } };

export async function POST(_request: Request, { params }: Params) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const response = await adminDb.objections.get(params.responseId);
  if (!response) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (response.complianceStatus !== "passed") {
    return NextResponse.json({ error: "Compliance must pass before publishing" }, { status: 422 });
  }
  await adminDb.objections.publish(params.responseId);
  return NextResponse.json({ ok: true });
}
