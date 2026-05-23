import { NextRequest, NextResponse } from "next/server";
import { getAccountFromSession } from "@/lib/auth/session";
import { scopedDb } from "@/lib/db/scoped";
import { checkResponseCompliance } from "@/lib/objections/check";
import { ResponseSchema } from "@/lib/validators/objections";

type Params = { params: { responseId: string } };

export async function PUT(request: NextRequest, { params }: Params) {
  const account = await getAccountFromSession();
  if (!account) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = ResponseSchema.partial().safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid response" }, { status: 400 });
  const current = (await scopedDb(account.id).objections.listPersonal()).find((item) => item.id === params.responseId);
  if (!current) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const nextTitle = parsed.data.title ?? current.title;
  const nextText = parsed.data.responseText ?? current.responseText;
  const compliance = await checkResponseCompliance(nextText, nextTitle);
  const response = await scopedDb(account.id).objections.updatePersonal(params.responseId, {
    ...parsed.data,
    complianceStatus: compliance.passed ? "passed" : "flagged",
    complianceFlags: compliance.flags.length > 0 ? JSON.stringify(compliance.flags) : null,
  });
  return NextResponse.json({ response, compliance });
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  const account = await getAccountFromSession();
  if (!account) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await scopedDb(account.id).objections.deletePersonal(params.responseId);
  return NextResponse.json({ ok: true });
}
