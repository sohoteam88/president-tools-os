import { NextRequest, NextResponse } from "next/server";
import { getAccountFromSession } from "@/lib/auth/session";
import { scopedDb } from "@/lib/db/scoped";

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { momentId: string } }
) {
  try {
    const account = await getAccountFromSession();
    if (!account) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    await scopedDb(account.id).voice.deleteMoment(params.momentId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Delete failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
