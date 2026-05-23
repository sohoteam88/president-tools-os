import { NextRequest, NextResponse } from "next/server";
import { getAccountFromSession } from "@/lib/auth/session";
import { extractMomentsFromSession } from "@/lib/voice/why-story";

type Params = { params: { sessionId: string } };

export async function POST(_req: NextRequest, { params }: Params) {
  const account = await getAccountFromSession();
  if (!account) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const draftMoments = await extractMomentsFromSession(account.id, params.sessionId);
  return NextResponse.json({ draftMoments });
}
