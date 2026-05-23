import { NextResponse } from "next/server";
import { getAccountFromSession } from "@/lib/auth/session";
import { startWhyStorySession } from "@/lib/voice/why-story";

export async function POST() {
  const account = await getAccountFromSession();
  if (!account) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const result = await startWhyStorySession(account.id);
  return NextResponse.json(result, { status: 201 });
}
