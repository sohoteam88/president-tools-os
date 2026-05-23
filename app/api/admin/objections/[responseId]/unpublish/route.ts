import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/session";
import { adminDb } from "@/lib/db/scoped";

type Params = { params: { responseId: string } };

export async function POST(_request: Request, { params }: Params) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await adminDb.objections.unpublish(params.responseId);
  return NextResponse.json({ ok: true });
}
