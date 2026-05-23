import { NextRequest, NextResponse } from "next/server";
import { getAccountFromSession } from "@/lib/auth/session";
import { scopedDb } from "@/lib/db/scoped";
import { AdEntrySchema, PLATFORMS } from "@/lib/validators/ads";

export async function GET(request: NextRequest) {
  const account = await getAccountFromSession();
  if (!account) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const platform = request.nextUrl.searchParams.get("platform");
  const limitValue = Number(request.nextUrl.searchParams.get("limit") ?? "50");
  const limit = Number.isFinite(limitValue) ? Math.min(Math.max(limitValue, 1), 100) : 50;
  const entries = await scopedDb(account.id).ads.list({
    platform: PLATFORMS.some((item) => item === platform) ? platform ?? undefined : undefined,
    limit,
  });
  return NextResponse.json({ entries, total: entries.length });
}

export async function POST(request: NextRequest) {
  const account = await getAccountFromSession();
  if (!account) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = AdEntrySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid ad entry" }, { status: 400 });
  const entry = await scopedDb(account.id).ads.create({
    platform: parsed.data.platform,
    contentDraftId: parsed.data.contentDraftId ?? null,
    captionPreview: parsed.data.captionPreview ?? null,
    postedAt: parsed.data.postedAt,
    reach: parsed.data.reach ?? null,
    likes: parsed.data.likes ?? null,
    comments: parsed.data.comments ?? null,
    saves: parsed.data.saves ?? null,
    shares: parsed.data.shares ?? null,
    dmsReceived: parsed.data.dmsReceived ?? null,
    leadsGenerated: parsed.data.leadsGenerated ?? null,
    linkClicks: parsed.data.linkClicks ?? null,
    notes: parsed.data.notes ?? null,
  });
  if (!entry) return NextResponse.json({ error: "Failed to create entry" }, { status: 500 });
  return NextResponse.json({ entry }, { status: 201 });
}
