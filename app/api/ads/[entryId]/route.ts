import { NextRequest, NextResponse } from "next/server";
import { getAccountFromSession } from "@/lib/auth/session";
import { scopedDb } from "@/lib/db/scoped";
import { UpdateAdEntrySchema } from "@/lib/validators/ads";

type Params = { params: { entryId: string } };

export async function GET(_request: NextRequest, { params }: Params) {
  const account = await getAccountFromSession();
  if (!account) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const entry = await scopedDb(account.id).ads.get(params.entryId);
  if (!entry) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ entry });
}

export async function PUT(request: NextRequest, { params }: Params) {
  const account = await getAccountFromSession();
  if (!account) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = UpdateAdEntrySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid ad entry" }, { status: 400 });
  const entry = await scopedDb(account.id).ads.update(params.entryId, {
    ...parsed.data,
    contentDraftId: parsed.data.contentDraftId ?? undefined,
    captionPreview: parsed.data.captionPreview ?? undefined,
    dmsReceived: parsed.data.dmsReceived ?? undefined,
    leadsGenerated: parsed.data.leadsGenerated ?? undefined,
    linkClicks: parsed.data.linkClicks ?? undefined,
  });
  if (!entry) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ entry });
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  const account = await getAccountFromSession();
  if (!account) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await scopedDb(account.id).ads.delete(params.entryId);
  return NextResponse.json({ ok: true });
}
