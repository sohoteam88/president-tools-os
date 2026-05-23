import { funnelContentSchema, type FunnelContent } from "@/lib/funnels/types";
import type { FunnelType } from "@/lib/validators/funnels";
import type { VoiceProfileJson } from "@/lib/validators/voice";

const fallback: FunnelContent = {
  headline: "My journey started with one small step",
  subheadline: "I share what helped me feel more consistent, supported, and hopeful.",
  storyBlocks: [
    { type: "paragraph", text: "Before this journey, I was looking for something simple that I could stay consistent with in real life." },
    { type: "highlight", text: "For me, the biggest change was learning that small daily choices can build real confidence." },
    { type: "paragraph", text: "This page is just an invitation to hear the story and decide if it feels relevant for you too." },
  ],
  leadForm: {
    heading: "Ready to start your journey?",
    subheading: "Leave your details and I will personally follow up.",
    fields: ["name", "whatsapp"],
    submitLabel: "I am interested",
  },
  socialProof: [],
};

export async function generateFunnelContent(ctx: {
  accountName: string;
  distributorSeniority: string;
  funnelType: FunnelType;
  whyStoryTranscript: string | null;
  voiceProfile: VoiceProfileJson | null;
}): Promise<FunnelContent> {
  if (!process.env.ANTHROPIC_API_KEY) return fallback;

  const prompt = `You are helping a Herbalife Malaysia distributor write a personal story page for
their attraction marketing funnel. The page should feel authentic, warm, and personal
— not like an ad. Use their actual words and experiences from their voice recordings.

COMPLIANCE RULES — never violate these:
- No income amounts or income opportunity claims
- No specific weight loss numbers
- No medical or health cure claims
- No guaranteed results
- Personal experience only, framed as "for me" not "this will happen for you"

Distributor info:
- Name: ${ctx.accountName}
- Experience level: ${ctx.distributorSeniority}
- Funnel type: ${ctx.funnelType}

Their Why Story:
---
${ctx.whyStoryTranscript ?? "Not yet recorded — write based on funnel type and seniority."}
---

Their communication style:
${ctx.voiceProfile ? JSON.stringify(ctx.voiceProfile, null, 2) : "Warm, conversational Malaysian English."}

Generate a FunnelContent JSON object. Output ONLY valid JSON.`;

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-5",
        max_tokens: 2048,
        messages: [{ role: "user", content: prompt }],
      }),
    });
    const body = (await response.json()) as { content?: Array<{ type?: string; text?: string }> };
    const raw = body.content?.find((part) => part.type === "text")?.text ?? "";
    const parsed = funnelContentSchema.safeParse(JSON.parse(raw) as unknown);
    return parsed.success ? parsed.data : fallback;
  } catch {
    return fallback;
  }
}
