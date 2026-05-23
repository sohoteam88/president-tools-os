import { scopedDb } from "@/lib/db/scoped";
import OpenAI from "openai";
import {
  MOMENT_TYPES,
  WHY_STORY_QUESTIONS,
  type DraftMoment,
  type MomentType,
  type WhyStoryQuestionIndex,
} from "@/lib/voice/types";

async function callOpenAIForMoments(prompt: string, transcripts: string[]): Promise<DraftMoment[]> {
  if (!process.env.OPENAI_API_KEY) {
    return transcripts.map((text, index) => ({
      questionIndex: index,
      rawText: text,
      momentType: index === 1 ? "mindset_shift" : index === 2 ? "success_story" : "lifestyle_glimpse",
      extracted: text.split(/[.!?。！？]/).filter(Boolean).slice(0, 2).join(". ").trim() || text,
    }));
  }

  const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });

  const response = await openai.chat.completions.create({
    model: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content: "Return valid JSON only. Do not include markdown or code fences.",
      },
      { role: "user", content: prompt },
    ],
    response_format: { type: "json_object" },
  });

  const text = response.choices[0]?.message.content;
  if (!text) throw new Error("Unexpected OpenAI response type");
  const parsed = JSON.parse(text) as DraftMoment[] | { moments?: DraftMoment[] };
  return Array.isArray(parsed) ? parsed : parsed.moments ?? [];
}

function normaliseMoment(moment: DraftMoment, fallbackIndex: number, fallbackText: string): DraftMoment {
  const momentType: MomentType = MOMENT_TYPES.includes(moment.momentType) ? moment.momentType : "lifestyle_glimpse";
  return {
    questionIndex: fallbackIndex,
    rawText: moment.rawText || fallbackText,
    momentType,
    extracted: moment.extracted || moment.rawText || fallbackText,
  };
}

export async function startWhyStorySession(accountId: string): Promise<{ sessionId: string }> {
  const userDb = scopedDb(accountId);
  await userDb.voice.abandonRecordingWhyStorySessions();
  const session = await userDb.voice.createWhyStorySession();
  if (!session) throw new Error("Failed to start Why Story session");
  return { sessionId: session.id };
}

export async function recordAnswerAudio(
  accountId: string,
  sessionId: string,
  questionIndex: WhyStoryQuestionIndex,
  audioKey: string
): Promise<void> {
  if (!audioKey.startsWith(`captures/${accountId}/why-story/`)) {
    throw new Error("Invalid audio key prefix");
  }

  const userDb = scopedDb(accountId);
  const session = await userDb.voice.getWhyStorySession(sessionId);
  if (!session || session.status !== "recording") {
    throw new Error("Session not in recording state");
  }

  const audioKeys = [...session.audioKeys];
  audioKeys[questionIndex] = audioKey;
  await userDb.voice.updateWhyStorySession(sessionId, { audioKeys });
}

export async function saveQuestionTranscript(
  accountId: string,
  sessionId: string,
  questionIndex: WhyStoryQuestionIndex,
  transcript: string
): Promise<void> {
  const userDb = scopedDb(accountId);
  const session = await userDb.voice.getWhyStorySession(sessionId);
  if (!session) throw new Error("Session not found");

  const transcripts = [...session.transcripts];
  transcripts[questionIndex] = transcript;
  const complete = transcripts.filter((value) => value?.trim()).length >= WHY_STORY_QUESTIONS.length;
  await userDb.voice.updateWhyStorySession(sessionId, {
    transcripts,
    status: complete ? "extracting" : session.status,
  });
}

export async function extractMomentsFromSession(
  accountId: string,
  sessionId: string
): Promise<DraftMoment[]> {
  const userDb = scopedDb(accountId);
  const session = await userDb.voice.getWhyStorySession(sessionId);
  if (!session) throw new Error("Session not found");

  const transcripts = session.transcripts.slice(0, WHY_STORY_QUESTIONS.length);
  if (transcripts.filter((text) => text?.trim()).length < WHY_STORY_QUESTIONS.length) {
    throw new Error("All five transcripts are required before extraction");
  }

  const prompt = `You are extracting personal journey moments from a network marketer's Why Story answers.
For each answer, extract the most powerful moment and categorize it.

Moment categories:
- success_story: A concrete win or achievement
- challenge_overcome: A difficulty they pushed through
- lifestyle_glimpse: A day-in-the-life or freedom snapshot
- product_experience: A personal product result
- mindset_shift: A belief or perspective change

Return a JSON object with a "moments" array containing exactly ${transcripts.length} objects matching this schema:
{ "moments": [{ "questionIndex": number, "rawText": string, "momentType": string, "extracted": string }] }

"extracted" = 1-3 clean sentences in first-person, no income claims, no guarantees.
"rawText" = the original transcript verbatim.

Questions and answers:
${transcripts.map((text, index) => `Q${index + 1}: ${WHY_STORY_QUESTIONS[index]}\nA: ${text}`).join("\n\n")}

Return ONLY the JSON object.`;

  const extracted = await callOpenAIForMoments(prompt, transcripts);
  const draftMoments = transcripts.map((text, index) =>
    normaliseMoment(extracted[index] ?? {
      questionIndex: index,
      rawText: text,
      momentType: "lifestyle_glimpse",
      extracted: text,
    }, index, text)
  );

  await userDb.voice.updateWhyStorySession(sessionId, {
    status: "confirming",
    draftMoments,
  });
  return draftMoments;
}

export async function confirmWhyStoryMoments(
  accountId: string,
  sessionId: string,
  confirmedIndices: number[]
): Promise<void> {
  const userDb = scopedDb(accountId);
  const session = await userDb.voice.getWhyStorySession(sessionId);
  if (!session || session.status !== "confirming") {
    throw new Error("Session not in confirming state");
  }

  const approved = new Set(confirmedIndices);
  const moments = session.draftMoments
    .filter((moment, index) => approved.has(moment.questionIndex) || approved.has(index))
    .map((moment, index) => ({
      source: "why_story" as const,
      rawText: moment.extracted || moment.rawText,
      momentType: moment.momentType,
      questionIndex: index,
      whyStorySessionId: sessionId,
      confirmedAt: new Date(),
    }));

  await userDb.voice.createJourneyMoments(moments);
  await userDb.accounts.markVoiceCaptureComplete();
  await userDb.voice.updateWhyStorySession(sessionId, {
    status: "complete",
    completedAt: new Date(),
  });
}
