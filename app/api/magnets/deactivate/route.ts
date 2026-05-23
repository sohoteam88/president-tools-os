import { NextRequest, NextResponse } from "next/server";
import { getAccountFromSession } from "@/lib/auth/session";
import { scopedDb } from "@/lib/db/scoped";

export async function POST(_request: NextRequest) {
  const account = await getAccountFromSession();
  if (!account) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await scopedDb(account.id).magnets.deactivate();
  return NextResponse.json({ ok: true });
}
