import { NextRequest, NextResponse } from "next/server";
import { getAccountFromSession } from "@/lib/auth/session";
import { scopedDb } from "@/lib/db/scoped";
import { draftsQuerySchema } from "@/lib/validators/content";
import { z } from "zod";

const SeedDraftSchema = z.object({
  seedText: z.string().min(1).max(2000),
  topic: z.string().min(1).max(200).optional(),
});

export async function GET(request: NextRequest) {
  try {
    const account = await getAccountFromSession();
    if (!account) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const parsed = draftsQuerySchema.safeParse({
      limit: request.nextUrl.searchParams.get("limit") ?? undefined,
    });
    if (!parsed.success) return NextResponse.json({ error: "Invalid query" }, { status: 400 });

    const drafts = await scopedDb(account.id).content.listDrafts(parsed.data.limit);
    return NextResponse.json({ data: { drafts } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load drafts";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const account = await getAccountFromSession();
    if (!account) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const parsed = SeedDraftSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

    const draft = await scopedDb(account.id).content.createDraft({
      platform: "facebook",
      contentType: "lifestyle_story",
      userTopic: parsed.data.topic,
      generatedDraft: parsed.data.seedText,
      complianceStatus: "pending",
    });
    if (!draft) return NextResponse.json({ error: "Failed to create draft" }, { status: 500 });
    return NextResponse.json({ data: { draft } }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create draft";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
