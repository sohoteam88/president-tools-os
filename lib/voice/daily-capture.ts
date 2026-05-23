import { scopedDb } from "@/lib/db/scoped";
import { MOMENT_TYPES, type MomentType } from "@/lib/voice/types";

async function classifyMoment(text: string): Promise<MomentType> {
  if (!process.env.ANTHROPIC_API_KEY) {
    if (/challenge|hard|struggle|difficult|tired|压力|挑战/i.test(text)) return "challenge_overcome";
    if (/product|shake|tea|nutrition|产品/i.test(text)) return "product_experience";
    if (/mindset|realized|learned|相信|心态/i.test(text)) return "mindset_shift";
    if (/win|success|breakthrough|成果|成功/i.test(text)) return "success_story";
    return "lifestyle_glimpse";
  }

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: process.env.ANTHROPIC_HAIKU_MODEL ?? "claude-haiku-4-5-20251001",
      max_tokens: 32,
      messages: [{
        role: "user",
        content: `Classify this network marketer's daily capture into exactly one category.
Categories: success_story | challenge_overcome | lifestyle_glimpse | product_experience | mindset_shift

Text: "${text}"

Reply with ONLY the category name.`,
      }],
    }),
  });

  if (!response.ok) return "lifestyle_glimpse";
  const body = (await response.json()) as { content?: Array<{ type?: string; text?: string }> };
  const raw = body.content?.find((part) => part.type === "text")?.text?.trim().toLowerCase() as MomentType | undefined;
  return raw && MOMENT_TYPES.includes(raw) ? raw : "lifestyle_glimpse";
}

export async function saveDailyCapture(
  accountId: string,
  text: string
): Promise<{ momentId: string; momentType: MomentType }> {
  const cleaned = text.trim();
  if (cleaned.length < 10) throw new Error("Daily capture too short (minimum 10 characters)");
  if (cleaned.length > 2000) throw new Error("Daily capture too long (maximum 2000 characters)");

  const momentType = await classifyMoment(cleaned);
  const moment = await scopedDb(accountId).voice.createJourneyMoment({
    source: "daily_capture",
    rawText: cleaned,
    momentType,
    confirmedAt: new Date(),
  });
  if (!moment) throw new Error("Failed to save daily capture");
  return { momentId: moment.id, momentType };
}
