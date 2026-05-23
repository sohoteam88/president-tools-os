import { NextResponse } from "next/server";
import { getAccountFromSession } from "@/lib/auth/session";
import { scopedDb } from "@/lib/db/scoped";
import { analyseAdPerformance } from "@/lib/ads/analyse";

export async function GET() {
  const account = await getAccountFromSession();
  if (!account) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const analysis = await scopedDb(account.id).ads.getAnalysis();
  return NextResponse.json({ analysis: analysis ?? null });
}

export async function POST() {
  const account = await getAccountFromSession();
  if (!account) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userDb = scopedDb(account.id);
  const count = await userDb.ads.count();
  if (count < 3) {
    return NextResponse.json({ error: "Log at least 3 posts before running analysis.", count }, { status: 400 });
  }
  const entries = await userDb.ads.list({ limit: 30 });
  const result = await analyseAdPerformance({
    accountName: account.name,
    entries: entries.map((entry) => ({
      platform: entry.platform,
      captionPreview: entry.captionPreview,
      postedAt: entry.postedAt,
      reach: entry.reach,
      likes: entry.likes,
      comments: entry.comments,
      saves: entry.saves,
      dmsReceived: entry.dmsReceived,
      leadsGenerated: entry.leadsGenerated,
      notes: entry.notes,
    })),
  });
  await userDb.ads.upsertAnalysis({
    analysisText: result.text,
    entriesAnalysed: entries.length,
    analysedAt: new Date(),
    promptTokens: result.promptTokens,
    completionTokens: result.completionTokens,
  });
  const analysis = await userDb.ads.getAnalysis();
  return NextResponse.json({ analysis });
}
