export type AnalysisInput = {
  accountName: string;
  entries: Array<{
    platform: string;
    captionPreview: string | null;
    postedAt: string;
    reach: number | null;
    likes: number | null;
    comments: number | null;
    saves: number | null;
    dmsReceived: number | null;
    leadsGenerated: number | null;
    notes: string | null;
  }>;
};

export type AnalysisResult = {
  text: string;
  promptTokens: number;
  completionTokens: number;
};

type AnthropicResponse = {
  content?: Array<{ type?: string; text?: string }>;
  usage?: { input_tokens?: number; output_tokens?: number };
};

export async function analyseAdPerformance(input: AnalysisInput): Promise<AnalysisResult> {
  const prompt = buildAnalysisPrompt(input);
  if (!process.env.ANTHROPIC_API_KEY) {
    return {
      text: fallbackAnalysis(input),
      promptTokens: 0,
      completionTokens: 0,
    };
  }

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5",
      max_tokens: 400,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (!response.ok) {
    return { text: fallbackAnalysis(input), promptTokens: 0, completionTokens: 0 };
  }
  const body = (await response.json()) as AnthropicResponse;
  return {
    text: body.content?.[0]?.type === "text" ? body.content[0].text?.trim() ?? fallbackAnalysis(input) : fallbackAnalysis(input),
    promptTokens: body.usage?.input_tokens ?? 0,
    completionTokens: body.usage?.output_tokens ?? 0,
  };
}

export function buildAnalysisPrompt(input: AnalysisInput): string {
  const entryLines = input.entries.map((entry, index) => {
    const stats = [
      entry.reach != null ? `reach ${entry.reach}` : null,
      entry.likes != null ? `likes ${entry.likes}` : null,
      entry.comments != null ? `comments ${entry.comments}` : null,
      entry.saves != null ? `saves ${entry.saves}` : null,
      entry.dmsReceived != null ? `DMs ${entry.dmsReceived}` : null,
      entry.leadsGenerated != null ? `leads ${entry.leadsGenerated}` : null,
    ].filter(Boolean).join(", ");
    const preview = entry.captionPreview ? `"${entry.captionPreview.slice(0, 80)}..."` : "(no caption)";
    return `${index + 1}. ${entry.platform} | ${entry.postedAt} | ${preview} | ${stats || "no stats"}${entry.notes ? ` | Note: ${entry.notes}` : ""}`;
  }).join("\n");

  return `You are analysing the organic social media performance log for a Herbalife Malaysia
distributor named ${input.accountName}. They post attraction-marketing content - personal wellness
stories and business journey posts. No paid ads.

Here are their recent posts (${input.entries.length} entries):
${entryLines}

Write a practical 3-4 paragraph analysis covering:
1. Which platform and content style is generating the most DMs and leads
2. What time patterns show (if any data)
3. One specific thing they're doing well
4. One specific thing to try or change next week

Rules:
- Be specific to their actual data, not generic advice
- Do NOT suggest income claim content or guaranteed results language
- Keep it encouraging but honest
- Write in plain paragraphs - no bullet points, no markdown headers
- Address them directly as "you" / "your posts"
- Under 250 words total`;
}

function fallbackAnalysis(input: AnalysisInput): string {
  const best = [...input.entries].sort((a, b) => (b.dmsReceived ?? 0) - (a.dmsReceived ?? 0))[0];
  if (!best) return "Log at least three posts with basic stats to see useful patterns.";
  return `Your strongest signal so far is ${best.platform}, especially posts that create direct conversations rather than just likes. The best logged post brought ${best.dmsReceived ?? 0} DMs and ${best.leadsGenerated ?? 0} leads, so keep studying what made that caption easy to reply to.\n\nNext week, repeat the format of your best post with a fresh personal angle, then compare DMs and leads rather than only reach. Keep the wording practical and grounded in real experience.`;
}
