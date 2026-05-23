import { NextRequest, NextResponse } from "next/server";
import { getAccountFromSession } from "@/lib/auth/session";
import { scopedDb } from "@/lib/db/scoped";
import { generateUploadPresignedUrl } from "@/lib/storage/r2";
import { ScreenshotUploadSchema } from "@/lib/validators/ads";

export async function POST(request: NextRequest) {
  const account = await getAccountFromSession();
  if (!account) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = ScreenshotUploadSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid upload request" }, { status: 400 });
  const entry = await scopedDb(account.id).ads.get(parsed.data.entryId);
  if (!entry) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const key = `ad-screenshots/${account.id}/${parsed.data.entryId}.jpg`;
  const uploadUrl = await generateUploadPresignedUrl(key, parsed.data.mimeType);
  return NextResponse.json({ uploadUrl, key });
}
