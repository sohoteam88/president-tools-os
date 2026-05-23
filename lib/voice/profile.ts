import { differenceInCalendarDays } from "date-fns";
import { scopedDb, adminDb } from "@/lib/db/scoped";
import {
  type VoiceProfileJson,
  voiceProfileJsonSchema,
} from "@/lib/validators/voice";

const DEFAULT_PROFILE: VoiceProfileJson = {
  vocabulary_level: "conversational",
  sentence_rhythm: "mixed",
  emotional_tone: "warm",
  storytelling_style: "anecdotal",
  common_phrases: ["today", "I felt", "my journey"],
  topics_they_return_to: ["personal growth", "daily progress"],
  energy_level: "calm",
  malaysia_context: true,
  languages_mixed: ["english"],
  summary: "This voice is warm, grounded, and personal. They speak through real moments and connect daily progress to their wider journey.",
};

function profilePrompt(transcripts: string): string {
  return `Analyse these voice transcripts from a single person and extract their authentic communication style. Output ONLY valid JSON matching this exact schema — no markdown, no explanation:

{
  "vocabulary_level": "simple|conversational|sophisticated",
  "sentence_rhythm": "short_punchy|flowing|mixed",
  "emotional_tone": "warm|direct|inspirational|matter_of_fact",
  "storytelling_style": "narrative|anecdotal|analytical",
  "common_phrases": ["phrase1", "phrase2", "phrase3"],
  "topics_they_return_to": ["topic1", "topic2"],
  "energy_level": "calm|enthusiastic|intense",
  "malaysia_context": true|false,
  "languages_mixed": ["english"] or ["english", "mandarin"] or ["english", "malay"],
  "summary": "2–3 sentence description of their unique voice"
}

Transcripts:
${transcripts}`;
}

async function callClaude(prompt: string): Promise<string> {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY ?? "",
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-5",
      max_tokens: 1200,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!response.ok) {
    throw new Error(`Claude profile synthesis failed: ${response.status}`);
  }

  const body = (await response.json()) as {
    content?: Array<{ type?: string; text?: string }>;
  };
  return body.content?.find((part) => part.type === "text")?.text ?? "";
}

export async function rebuildVoiceProfile(accountId: string): Promise<void> {
  if (!(await shouldRebuildVoiceProfile(accountId))) return;

  const userDb = scopedDb(accountId);
  const captures = await userDb.voice.listAcceptedTranscripts(30);
  if (captures.length === 0) return;

  const transcripts = captures
    .map((capture, index) => {
      const text = capture.transcriptCleaned ?? capture.transcript ?? "";
      return `${index + 1}. [${capture.type}] ${text}`;
    })
    .filter((line) => line.trim().length > 0)
    .join("\n\n");

  if (!transcripts) return;

  let parsed: VoiceProfileJson;
  if (!process.env.ANTHROPIC_API_KEY) {
    parsed = DEFAULT_PROFILE;
  } else {
    const raw = await callClaude(profilePrompt(transcripts));
    const json = JSON.parse(raw) as unknown;
    parsed = voiceProfileJsonSchema.parse(json);
  }

  const version = await userDb.voice.getNextVersion();
  await userDb.voice.createProfile({
    version,
    profileJson: JSON.stringify(parsed),
    sourceCaptureCount: captures.length,
  });
}

export async function shouldRebuildVoiceProfile(accountId: string): Promise<boolean> {
  const account = await adminDb.accounts.getById(accountId);
  if (!account) return false;

  const daysSinceJoined = differenceInCalendarDays(new Date(), account.createdAt);
  if (daysSinceJoined < 30) return false;

  const userDb = scopedDb(accountId);
  const [confirmedMoments, exportedDrafts] = await Promise.all([
    userDb.voice.countConfirmedMoments(),
    userDb.content.countExports(),
  ]);

  return confirmedMoments >= 10 && exportedDrafts >= 3;
}
