import { NextResponse } from "next/server";
import { getAccountFromSession } from "@/lib/auth/session";
import { scopedDb } from "@/lib/db/scoped";
import { getLastMondayDate, compileWeeklyForAccount } from "@/lib/voice/weekly-compile";

export async function GET() {
  const account = await getAccountFromSession();
  if (!account) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const row = await scopedDb(account.id).voice.getWeeklySeeds(getLastMondayDate());
  return NextResponse.json({ seeds: row?.seeds ?? [] });
}

export async function POST() {
  try {
    const account = await getAccountFromSession();
    if (!account) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const ok = await compileWeeklyForAccount(account.id);
    if (!ok) {
      return NextResponse.json(
        { error: "No journey moments found. Save some moments first." },
        { status: 422 }
      );
    }

    const row = await scopedDb(account.id).voice.getWeeklySeeds(getLastMondayDate());
    return NextResponse.json({ seeds: row?.seeds ?? [] });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Generation failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
