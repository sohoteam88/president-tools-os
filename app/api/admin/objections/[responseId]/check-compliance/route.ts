import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/session";
import { adminDb } from "@/lib/db/scoped";
import { checkResponseCompliance } from "@/lib/objections/check";

type Params = { params: { responseId: string } };

export async function POST(_request: Request, { params }: Params) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const response = await adminDb.objections.get(params.responseId);
  if (!response) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const compliance = await checkResponseCompliance(response.responseText, response.title);
  await adminDb.objections.setComplianceResult(
    params.responseId,
    compliance.passed ? "passed" : "flagged",
    compliance.flags
  );
  return NextResponse.json({ compliance });
}
