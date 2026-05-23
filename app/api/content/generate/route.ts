import { NextRequest, NextResponse } from "next/server";
import { getAccountFromSession } from "@/lib/auth/session";
import { scopedDb } from "@/lib/db/scoped";
import { buildContentPrompt } from "@/lib/content/prompt-builder";
import { generateContentSchema } from "@/lib/validators/content";
import { voiceProfileJsonSchema } from "@/lib/validators/voice";
import type { Locale } from "@/lib/translations";
import { cookies } from "next/headers";

async function generateWithClaude(prompt: string): Promise<string> {
  if (!process.env.ANTHROPIC_API_KEY) {
    return "Today reminded me why I started this journey. It was not about doing something loud or perfect. It was about showing up, having real conversations, and noticing the small changes that make me feel more like myself again.";
  }

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-5",
      max_tokens: 1024,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!response.ok) throw new Error("Generation failed");
  const body = (await response.json()) as { content?: Array<{ type?: string; text?: string }> };
  return body.content?.find((part) => part.type === "text")?.text?.trim() ?? "";
}

function getLocaleFromCookie(): Locale {
  const cookieStore = cookies();
  const locale = cookieStore.get("pt_locale")?.value as Locale;
  if (locale && (["en", "zh", "ms"] as Locale[]).includes(locale)) return locale;
  return "en";
}

export async function POST(request: NextRequest) {
  try {
    const account = await getAccountFromSession();
    if (!account) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const parsed = generateContentSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request" }, { status: 400 });
    }

    const locale = getLocaleFromCookie();

    const userDb = scopedDb(account.id);
    const [latestProfile, whyStory, recentCaptures] = await Promise.all([
      userDb.voice.getLatestProfile(),
      userDb.voice.getWhyStory(),
      userDb.voice.listAcceptedTranscripts(5),
    ]);

    let profileJson: unknown = null;
    if (latestProfile) {
      try {
        profileJson = JSON.parse(latestProfile.profileJson) as unknown;
      } catch {
        console.warn("[content:generation] voice profile JSON parse failed");
      }
    }
    const profileParsed = latestProfile
      ? voiceProfileJsonSchema.safeParse(profileJson)
      : null;
    if (latestProfile && !profileParsed?.success) {
      console.warn("[content:generation] voice profile parse failed");
    }

    const prompt = buildContentPrompt({
      platform: parsed.data.platform,
      contentType: parsed.data.contentType,
      userTopic: parsed.data.userTopic ?? "",
      voiceProfile: profileParsed?.success ? profileParsed.data : null,
      whyStoryTranscript: whyStory?.transcriptCleaned ?? whyStory?.transcript ?? null,
      recentJourneyTranscripts: recentCaptures
        .filter((capture) => capture.type === "daily_journey")
        .slice(0, 5)
        .map((capture) => capture.transcriptCleaned ?? capture.transcript ?? "")
        .filter((text) => text.length > 0),
      accountName: account.name,
      distributorSeniority: account.distributorSeniority,
      locale,
    });

    const generatedDraft = await generateWithClaude(prompt);
    if (!generatedDraft) {
      return NextResponse.json({ error: "Generation failed. Please try again." }, { status: 503 });
    }

    const draft = await userDb.content.createDraft({
      platform: parsed.data.platform,
      contentType: parsed.data.contentType,
      userTopic: parsed.data.userTopic,
      generatedDraft,
      complianceStatus: "pending",
      voiceProfileVersion: latestProfile?.version ?? null,
    });

    if (!draft) return NextResponse.json({ error: "Failed to save draft" }, { status: 500 });
    return NextResponse.json({ data: { draftId: draft.id, generatedDraft } });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Generation failed. Please try again." }, { status: 503 });
  }
}
