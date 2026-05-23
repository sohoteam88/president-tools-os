import type { AdEntry } from "@/lib/db/schema/ads";

export type OcrStats = {
  reach?: number;
  likes?: number;
  comments?: number;
  saves?: number;
  shares?: number;
  dms_received?: number;
  leads_generated?: number;
  link_clicks?: number;
};

export type OcrResult = {
  stats: OcrStats;
  confidence: "high" | "low";
};

type OpenAiResponse = {
  choices?: Array<{ message?: { content?: string | null } }>;
};

const OCR_PROMPT = `You are reading a screenshot of social media post analytics from a mobile app.
Extract any performance numbers you can see. Return ONLY a JSON object with these optional keys
(include only the ones you can clearly read - do NOT guess):

{
  "reach": <integer>,
  "likes": <integer>,
  "comments": <integer>,
  "saves": <integer>,
  "shares": <integer>,
  "dms_received": <integer>,
  "leads_generated": <integer>,
  "link_clicks": <integer>
}

If you can read at least 2 metrics clearly: set confidence to "high".
Otherwise: confidence "low".

Output format - ONLY valid JSON, no explanation:
{
  "stats": { ... },
  "confidence": "high" | "low"
}`;

export async function extractStatsFromScreenshot(
  imageBase64: string,
  mimeType: "image/jpeg" | "image/png" = "image/jpeg"
): Promise<OcrResult | null> {
  try {
    if (!process.env.OPENAI_API_KEY) return null;
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-4o",
        max_tokens: 300,
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: OCR_PROMPT },
              {
                type: "image_url",
                image_url: {
                  url: `data:${mimeType};base64,${imageBase64}`,
                  detail: "low",
                },
              },
            ],
          },
        ],
      }),
    });
    if (!response.ok) return null;
    const body = (await response.json()) as OpenAiResponse;
    const raw = body.choices?.[0]?.message?.content?.trim() ?? "";
    return parseOcrResult(raw);
  } catch {
    return null;
  }
}

export function parseOcrResult(raw: string): OcrResult | null {
  try {
    const parsed = JSON.parse(raw) as { stats?: Record<string, unknown>; confidence?: unknown };
    const clean: OcrStats = {};
    for (const key of ["reach", "likes", "comments", "saves", "shares", "dms_received", "leads_generated", "link_clicks"] as const) {
      const value = parsed.stats?.[key];
      if (typeof value === "number" && Number.isInteger(value) && value >= 0) {
        clean[key] = value;
      }
    }
    return {
      stats: clean,
      confidence: parsed.confidence === "high" ? "high" : "low",
    };
  } catch {
    return null;
  }
}

export function buildOcrUpdates(entry: AdEntry, result: OcrResult): Partial<AdEntry> {
  const updates: Partial<AdEntry> = {
    ocrExtractedStats: JSON.stringify(result.stats),
    ocrConfidence: result.confidence,
  };
  if (entry.reach == null && result.stats.reach != null) updates.reach = result.stats.reach;
  if (entry.likes == null && result.stats.likes != null) updates.likes = result.stats.likes;
  if (entry.comments == null && result.stats.comments != null) updates.comments = result.stats.comments;
  if (entry.saves == null && result.stats.saves != null) updates.saves = result.stats.saves;
  if (entry.shares == null && result.stats.shares != null) updates.shares = result.stats.shares;
  if (entry.dmsReceived == null && result.stats.dms_received != null) updates.dmsReceived = result.stats.dms_received;
  if (entry.leadsGenerated == null && result.stats.leads_generated != null) updates.leadsGenerated = result.stats.leads_generated;
  if (entry.linkClicks == null && result.stats.link_clicks != null) updates.linkClicks = result.stats.link_clicks;
  return updates;
}
