import { NextResponse } from "next/server";
import { getAccountFromSession } from "@/lib/auth/session";
import { scopedDb } from "@/lib/db/scoped";
import { getLastMondayDate } from "@/lib/voice/weekly-compile";

export async function GET() {
  const account = await getAccountFromSession();
  if (!account) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const row = await scopedDb(account.id).voice.getWeeklySeeds(getLastMondayDate());
  return NextResponse.json({ seeds: row?.seeds ?? [] });
}
