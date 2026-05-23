import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAccountFromSession } from "@/lib/auth/session";
import { recordAnswerAudio, saveQuestionTranscript } from "@/lib/voice/why-story";
import { transcriptionQueue } from "@/lib/jobs/queues";

const AnswerSchema = z.object({
  questionIndex: z.number().int().min(0).max(4),
  audioKey: z.string().min(1),
  transcript: z.string().optional(),
});

type Params = { params: { sessionId: string } };

export async function POST(req: NextRequest, { params }: Params) {
  const account = await getAccountFromSession();
  if (!account) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = AnswerSchema.safeParse(await req.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: body.error.flatten() }, { status: 422 });

  if (!body.data.audioKey.startsWith("text:")) {
    await recordAnswerAudio(
      account.id,
      params.sessionId,
      body.data.questionIndex as 0 | 1 | 2 | 3 | 4,
      body.data.audioKey
    );
  }

  if (body.data.transcript) {
    await saveQuestionTranscript(
      account.id,
      params.sessionId,
      body.data.questionIndex as 0 | 1 | 2 | 3 | 4,
      body.data.transcript
    );
  } else {
    await transcriptionQueue.add("why-story-transcription", {
      accountId: account.id,
      sessionId: params.sessionId,
      questionIndex: body.data.questionIndex,
      audioKey: body.data.audioKey,
      callbackType: "why_story",
    });
  }

  return NextResponse.json({ queued: !body.data.transcript });
}
