import { NextRequest, NextResponse } from "next/server";
import { getAccountFromSession } from "@/lib/auth/session";
import { scopedDb } from "@/lib/db/scoped";

export async function GET(_request: NextRequest) {
  try {
    const account = await getAccountFromSession();
    if (!account) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const profile = await scopedDb(account.id).voice.getLatestProfile();
    return NextResponse.json({ data: { profile: profile ?? null } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load voice profile";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
