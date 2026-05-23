import type { VoiceProfileJson } from "@/lib/validators/voice";
import type { Locale } from "@/lib/translations";

export const PLATFORMS = [
  "facebook",
  "instagram",
  "whatsapp",
  "tiktok_script",
  "invitation",
] as const;

export type Platform = (typeof PLATFORMS)[number];

export const CONTENT_TYPES: Record<Platform, string[]> = {
  facebook: ["lifestyle_story", "product_experience", "team_culture", "results_journey"],
  instagram: ["caption_lifestyle", "caption_product", "caption_results", "caption_invitation"],
  whatsapp: ["personal_message", "group_announcement", "follow_up"],
  tiktok_script: ["day_in_life", "transformation_story", "product_demo_script", "why_i_joined"],
  invitation: ["event_invite", "zoom_call_invite", "coffee_chat_invite"],
};

export const PLATFORM_NORMS: Record<Platform, string> = {
  facebook:
    "Long-form is fine (200-500 words). Conversational paragraphs. No excessive hashtags (max 3). Personal stories perform well. Emojis: optional, use sparingly.",
  instagram:
    "Short caption (50-150 words). End with a soft call-to-action. 5-10 relevant hashtags on a new line after the caption. Emojis: natural, 2-5 max.",
  whatsapp:
    "Conversational tone, like texting a friend. Under 100 words. No hashtags. Warm, direct, personal. Do not sound like an ad.",
  tiktok_script:
    "Spoken word script, not a post. Format: [HOOK 0-3s] / [BODY 3-45s] / [CTA 45-60s]. Natural speech rhythm. Short sentences. Include suggested B-roll notes in brackets.",
  invitation:
    "Direct and warm. State what, when (leave date/time blank - user fills in), why they would enjoy it. One clear action: Let me know if you are keen. Under 80 words.",
};

const LANGUAGE_INSTRUCTIONS: Record<Locale, string> = {
  en: "Write the content in natural Malaysian English.",
  zh: "Write the content entirely in Simplified Chinese (简体中文). All text, hashtags, and captions must be in Chinese. Do NOT mix in English unless it is a brand name or proper noun.",
  ms: "Write the content entirely in Bahasa Melayu (Malaysian Malay). All text, hashtags, and captions must be in Malay. Do NOT mix in English unless it is a brand name or proper noun.",
};

export interface PromptContext {
  platform: Platform;
  contentType: string;
  userTopic: string;
  voiceProfile: VoiceProfileJson | null;
  whyStoryTranscript: string | null;
  recentJourneyTranscripts: string[];
  accountName: string;
  distributorSeniority: string;
  locale?: Locale;
}

export function buildContentPrompt(ctx: PromptContext): string {
  const locale: Locale = ctx.locale ?? "en";
  const languageInstruction = LANGUAGE_INSTRUCTIONS[locale];

  const voiceLayer = ctx.voiceProfile
    ? `This person authentic communication style (extracted from their voice recordings):
- Vocabulary level: ${ctx.voiceProfile.vocabulary_level}
- Sentence rhythm: ${ctx.voiceProfile.sentence_rhythm}
- Emotional tone: ${ctx.voiceProfile.emotional_tone}
- Storytelling style: ${ctx.voiceProfile.storytelling_style}
- Phrases they commonly use: ${ctx.voiceProfile.common_phrases.join(", ")}
- Topics they return to: ${ctx.voiceProfile.topics_they_return_to.join(", ")}
- Energy level: ${ctx.voiceProfile.energy_level}
- Languages they mix: ${ctx.voiceProfile.languages_mixed.join(" + ")}

Mirror this style closely. The output should sound like THEM, not like a generic AI post.`
    : "No Voice Profile built yet - write in a warm, conversational Malaysian style.";

  const whyStoryLayer = ctx.whyStoryTranscript
    ? `Their origin story (from their own voice recording - treat this as their truth):
---
${ctx.whyStoryTranscript}
---
Draw from this story if relevant to the content type. Quote their own words where natural.`
    : "No Why Story recorded yet - skip story references.";

  const journeyLayer = ctx.recentJourneyTranscripts.length
    ? `Their recent experiences (from their daily voice journals, newest first):
${ctx.recentJourneyTranscripts.map((text, index) => `[Entry ${index + 1}]: ${text}`).join("\n\n")}
---
Use specific moments, conversations, or feelings from these entries when they fit
the content type. Real specifics make content authentic.`
    : "No recent journey entries - write from general context.";

  const platformInstruction =
    ctx.platform === "tiktok_script"
      ? "Format as a spoken script with [HOOK], [BODY], [CTA] sections"
      : ctx.platform === "instagram"
        ? "Include hashtags on a new line after the caption"
        : "";

  return `Layer 1 - System Role
You are a content writing assistant for a Herbalife Malaysia distributor practicing
attraction marketing. Your job is to help them write authentic, personal content
that shares their genuine journey - not to sell products or make claims.

The distributor name is: ${ctx.accountName}
Their experience level: ${ctx.distributorSeniority}

Layer 2 - Language Requirement
CRITICAL: ${languageInstruction}
This is a strict requirement. The entire output must be in this language.

Layer 3 - Platform Context
Platform: ${ctx.platform}
Platform norms: ${PLATFORM_NORMS[ctx.platform]}

Content type requested: ${ctx.contentType}

Layer 4 - Compliance Guardrails
MANDATORY COMPLIANCE RULES - violating any of these makes the content unusable:

NEVER include:
- Specific income amounts (e.g. "I earned RM3,000", "make $500 a day")
- Income opportunity claims ("you can earn", "financial freedom", "passive income")
- Specific weight or measurement claims ("lost 10kg", "dropped 2 dress sizes")
- Medical or health claims ("cured", "treats", "heals", "fixes", "prevents disease")
- Comparison claims ("better than", "unlike other MLM companies")
- Guaranteed results of any kind
- Prices or promotional offers

ALWAYS ensure:
- Content is clearly personal experience, not a general claim
- Any mention of product results is framed as personal experience only
- No pressure language ("limited time", "do not miss out", "last chance")
- Tone is sharing, not selling

Layer 5 - Attraction Marketing Philosophy
Attraction marketing principle: Share your life, do not pitch your business.
People should be curious about what you do - not pressured to join or buy.

Write as if talking to a friend who has not asked about the business.
Show the lifestyle, the community, the personal growth - not the product features.
The goal is for readers to think "I want what they have" - not "they are trying to sell me something."

Layer 6 - Tone and Style Guardrails
Writing style rules:
- Write in first person ("I", "we", "my team")
- Avoid corporate or MLM-sounding language ("synergy", "upline", "downline", "volume", "PV/BV")
- Avoid generic positivity cliches ("hustle", "grind", "blessed and grateful")
- Keep sentences short and punchy for mobile reading
- One idea per paragraph
- End with authentic curiosity, not a sales CTA

Layer 7 - Personal Context
About this distributor:
- Seniority: ${ctx.distributorSeniority}
- Topic they want to write about today: "${ctx.userTopic}"
${ctx.userTopic ? "" : "No specific topic - draw from their recent journey entries."}

Layer 8 - Voice Profile
${voiceLayer}

Layer 9 - Story Bank
${whyStoryLayer}

Layer 10 - Journey Bank
${journeyLayer}

Now write the ${ctx.contentType} for ${ctx.platform}.

Requirements:
- Output ONLY the final post content - no preamble, no explanation
- Do not add a disclaimer or note about compliance - the system handles that separately
- REMEMBER: Write entirely in ${locale === "en" ? "Malaysian English" : locale === "zh" ? "Simplified Chinese (简体中文)" : "Bahasa Melayu"}
${platformInstruction ? `- ${platformInstruction}` : ""}
- Length appropriate for ${ctx.platform}: ${PLATFORM_NORMS[ctx.platform]}`;
}
