import { format, startOfWeek, subDays } from "date-fns";
import { scopedDb, adminDb } from "@/lib/db/scoped";
import type { ContentDraftSeed } from "@/lib/voice/types";

async function callHaikuForSeeds(prompt: string): Promise<ContentDraftSeed[] | null> {
  if (!process.env.ANTHROPIC_API_KEY) return null;

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: process.env.ANTHROPIC_HAIKU_MODEL ?? "claude-haiku-4-5-20251001",
      max_tokens: 1500,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!response.ok) return null;
  const body = (await response.json()) as { content?: Array<{ type?: string; text?: string }> };
  const text = body.content?.find((part) => part.type === "text")?.text;
  if (!text) return null;
  try {
    const seeds = JSON.parse(text) as ContentDraftSeed[];
    return Array.isArray(seeds) ? seeds : null;
  } catch {
    return null;
  }
}

function fallbackSeeds(moments: Array<{ id: string; rawText: string; momentType: string }>): ContentDraftSeed[] {
  const formats: ContentDraftSeed["suggestedFormat"][] = ["story", "tip", "testimonial", "lifestyle", "education"];
  return Array.from({ length: 5 }, (_, index) => {
    const moment = moments[index % moments.length] ?? moments[0];
    if (!moment) throw new Error("Cannot create weekly seeds without moments");
    return {
      momentId: moment.id,
      topic: `A real moment from my ${moment.momentType.replace("_", " ")}`,
      angle: "Keep it personal, specific, and curious without making claims.",
      suggestedFormat: formats[index] ?? "story",
      seedText: moment.rawText.split(/[.!?。！？]/).filter(Boolean).slice(0, 2).join(". ").trim() || moment.rawText,
    };
  });
}

export function getLastMondayDate(today = new Date()): string {
  return format(startOfWeek(today, { weekStartsOn: 1 }), "yyyy-MM-dd");
}

export async function compileWeeklyForAccount(accountId: string): Promise<boolean> {
  const userDb = scopedDb(accountId);
  const weekStart = getLastMondayDate();
  const moments = await userDb.voice.listRecentConfirmedMoments(subDays(new Date(), 90), 20);
  if (moments.length === 0) return false;

  const momentList = moments
    .map((moment, index) => `[${index + 1}] ID:${moment.id} Type:${moment.momentType}\n"${moment.rawText}"`)
    .join("\n\n");

  const prompt = `You are a content strategist helping a network marketer create authentic attraction marketing content.
Based on these personal journey moments, generate exactly 5 content draft seeds for the coming week.

Rules:
- Each seed must reference a specific moment by its ID
- No income claims. No guarantees. No "you can earn X".
- Focus on lifestyle, personal growth, and authentic experience
- Use first-person perspective
- seedText must be 2-3 sentences the user will personalise further

Return a JSON array of exactly 5 objects:
{
  "momentId": "<the exact ID from above>",
  "topic": "<compelling 6-10 word topic>",
  "angle": "<1 sentence: what emotional angle to take>",
  "suggestedFormat": "<story|tip|testimonial|lifestyle|education>",
  "seedText": "<2-3 sentence draft starter in first-person>"
}

Journey moments:
${momentList}

Return ONLY the JSON array.`;

  const validIds = new Set(moments.map((moment) => moment.id));
  const generated = await callHaikuForSeeds(prompt);
  const seeds = (generated?.length === 5 ? generated : fallbackSeeds(moments)).slice(0, 5).map((seed) => ({
    ...seed,
    momentId: validIds.has(seed.momentId) ? seed.momentId : moments[0]?.id ?? seed.momentId,
  }));

  if (seeds.length !== 5) return false;
  await userDb.voice.upsertWeeklySeeds(weekStart, seeds);
  return true;
}

export async function runWeeklyCompileForAllAccounts(): Promise<{
  processed: number;
  compiled: number;
}> {
  // ADMIN: cross-account query intentional
  const accounts = await adminDb.accounts.listAll();
  let compiled = 0;

  for (const account of accounts) {
    if (await compileWeeklyForAccount(account.id)) compiled += 1;
  }

  return { processed: accounts.length, compiled };
}
