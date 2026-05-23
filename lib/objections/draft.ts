import { CATEGORY_LABELS, type ObjectionCategory } from "@/lib/objections/types";

export type DraftedResponse = {
  title: string;
  responseText: string;
  tone: "empathetic" | "logical" | "story";
};

type AnthropicResponse = {
  content?: Array<{ type?: string; text?: string }>;
};

export async function draftObjectionResponses(
  category: ObjectionCategory,
  specificObjection?: string
): Promise<DraftedResponse[]> {
  const categoryLabel = CATEGORY_LABELS[category];
  const context = specificObjection
    ? `The specific objection was: "${specificObjection}"`
    : `The general objection category is: ${categoryLabel}`;

  const prompt = `You are helping a Herbalife Malaysia distributor draft 3 response options
for the following objection category: ${categoryLabel}.
${context}

Write 3 different responses - one empathetic, one logical, one story-based.
Each response must:
- Be written in first person ("I", "for me", "in my experience")
- Be honest and non-pushy
- Contain NO income claims or income opportunity language
- Contain NO specific weight loss numbers or before/after claims
- Contain NO guaranteed result language
- Contain NO medical claims
- Be 50-150 words
- Sound like something a real person would say in a WhatsApp message

Output ONLY valid JSON, no markdown:
[
  { "title": "<short label, max 60 chars>", "responseText": "<the response>", "tone": "empathetic" },
  { "title": "<short label, max 60 chars>", "responseText": "<the response>", "tone": "logical" },
  { "title": "<short label, max 60 chars>", "responseText": "<the response>", "tone": "story" }
]`;

  if (!process.env.ANTHROPIC_API_KEY) return fallbackDrafts(category);

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5",
      max_tokens: 800,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (!response.ok) return fallbackDrafts(category);
  const body = (await response.json()) as AnthropicResponse;
  const raw = body.content?.[0]?.type === "text" ? body.content[0].text?.trim() ?? "[]" : "[]";
  return parseDraftedResponses(raw);
}

export function parseDraftedResponses(raw: string): DraftedResponse[] {
  try {
    const parsed = JSON.parse(raw) as unknown[];
    return parsed.filter(isDraftedResponse).slice(0, 3);
  } catch {
    return [];
  }
}

function isDraftedResponse(value: unknown): value is DraftedResponse {
  if (typeof value !== "object" || value === null) return false;
  const item = value as Record<string, unknown>;
  return typeof item.title === "string" &&
    typeof item.responseText === "string" &&
    (item.tone === "empathetic" || item.tone === "logical" || item.tone === "story");
}

function fallbackDrafts(category: ObjectionCategory): DraftedResponse[] {
  const label = CATEGORY_LABELS[category];
  return [
    {
      title: "Acknowledge first",
      responseText: `I understand why you would feel that way about ${label.toLowerCase()}. I would not want you to feel pressured. I can share what helped me think through it, and you can decide whether it fits your situation.`,
      tone: "empathetic",
    },
    {
      title: "Keep it practical",
      responseText: `For me, the best way to look at ${label.toLowerCase()} is practically. I prefer simple, honest conversations where we compare what matters to you and avoid making big promises.`,
      tone: "logical",
    },
    {
      title: "Share personal experience",
      responseText: `I had questions around ${label.toLowerCase()} too. What helped me was hearing real experience, asking direct questions, and taking time to decide without pressure from anyone.`,
      tone: "story",
    },
  ];
}
