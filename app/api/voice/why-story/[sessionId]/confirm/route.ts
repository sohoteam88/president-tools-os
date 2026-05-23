import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAccountFromSession } from "@/lib/auth/session";
import { confirmWhyStoryMoments } from "@/lib/voice/why-story";
import { WHY_STORY_QUESTIONS } from "@/lib/voice/types";

const ConfirmSchema = z.object({
  confirmedIndices: z.array(z.number().int().min(0).max(WHY_STORY_QUESTIONS.length)),
});

type Params = { params: { sessionId: string } };

export async function POST(req: NextRequest, { params }: Params) {
  const account = await getAccountFromSession();
  if (!account) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = ConfirmSchema.safeParse(await req.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: body.error.flatten() }, { status: 422 });

  await confirmWhyStoryMoments(account.id, params.sessionId, body.data.confirmedIndices);
  return NextResponse.json({ confirmed: true });
}
