import { NextRequest, NextResponse } from "next/server";
import { getAccountFromSession } from "@/lib/auth/session";
import { scopedDb } from "@/lib/db/scoped";

export async function GET(
  _request: NextRequest,
  { params }: { params: { draftId: string } }
) {
  try {
    const account = await getAccountFromSession();
    if (!account) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const draft = await scopedDb(account.id).content.getDraft(params.draftId);
    if (!draft) return NextResponse.json({ error: "Draft not found" }, { status: 404 });
    return NextResponse.json({ data: { draft } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load draft";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { draftId: string } }
) {
  const account = await getAccountFromSession();
  if (!account) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await scopedDb(account.id).content.deleteDraft(params.draftId);
  return NextResponse.json({ ok: true });
}
