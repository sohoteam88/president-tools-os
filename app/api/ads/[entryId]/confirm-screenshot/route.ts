import { NextRequest, NextResponse } from "next/server";
import { getAccountFromSession } from "@/lib/auth/session";
import { scopedDb } from "@/lib/db/scoped";
import { ConfirmScreenshotSchema } from "@/lib/validators/ads";

type Params = { params: { entryId: string } };

export async function POST(request: NextRequest, { params }: Params) {
  const account = await getAccountFromSession();
  if (!account) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = ConfirmScreenshotSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid key" }, { status: 400 });
  const prefix = `ad-screenshots/${account.id}/`;
  if (!parsed.data.key.startsWith(prefix)) {
    return NextResponse.json({ error: "Invalid screenshot key" }, { status: 400 });
  }
  const entry = await scopedDb(account.id).ads.update(params.entryId, { screenshotKey: parsed.data.key });
  if (!entry) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
