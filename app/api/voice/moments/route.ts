import { NextResponse } from "next/server";
import { getAccountFromSession } from "@/lib/auth/session";
import { scopedDb } from "@/lib/db/scoped";

export async function GET() {
  const account = await getAccountFromSession();
  if (!account) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const moments = await scopedDb(account.id).voice.listConfirmedMoments(50);
  return NextResponse.json({ moments });
}
