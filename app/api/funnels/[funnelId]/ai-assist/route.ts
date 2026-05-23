import { NextRequest, NextResponse } from "next/server";
import { getAccountFromSession } from "@/lib/auth/session";
import { scopedDb } from "@/lib/db/scoped";
import { aiAssistSchema } from "@/lib/validators/funnels";
import { voiceProfileJsonSchema } from "@/lib/validators/voice";
import { generateFunnelContent } from "@/lib/funnels/ai-assist";

export async function POST(request: NextRequest) {
  const account = await getAccountFromSession();
  if (!account) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = aiAssistSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const userDb = scopedDb(account.id);
  const [whyStory, profile] = await Promise.all([userDb.voice.getWhyStory(), userDb.voice.getLatestProfile()]);
  const voiceProfile = profile ? voiceProfileJsonSchema.safeParse(JSON.parse(profile.profileJson) as unknown) : null;
  const content = await generateFunnelContent({
    accountName: account.name,
    distributorSeniority: account.distributorSeniority,
    funnelType: parsed.data.funnelType,
    whyStoryTranscript: whyStory?.transcriptCleaned ?? whyStory?.transcript ?? null,
    voiceProfile: voiceProfile?.success ? voiceProfile.data : null,
  });
  return NextResponse.json({ data: { content } });
}
