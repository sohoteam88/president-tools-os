import { NextResponse } from "next/server";
import { getAccountFromSession } from "@/lib/auth/session";
import { scopedDb } from "@/lib/db/scoped";
import { getObjectBytes } from "@/lib/storage/r2";
import { buildOcrUpdates, extractStatsFromScreenshot } from "@/lib/ads/ocr";

type Params = { params: { entryId: string } };

export async function POST(_request: Request, { params }: Params) {
  const account = await getAccountFromSession();
  if (!account) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userDb = scopedDb(account.id);
  const entry = await userDb.ads.get(params.entryId);
  if (!entry) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!entry.screenshotKey) return NextResponse.json({ error: "No screenshot uploaded yet." }, { status: 400 });

  const bytes = await getObjectBytes(entry.screenshotKey);
  const base64 = Buffer.from(bytes).toString("base64");
  const mimeType = entry.screenshotKey.endsWith(".png") ? "image/png" : "image/jpeg";
  const result = await extractStatsFromScreenshot(base64, mimeType);
  if (!result) return NextResponse.json({ ok: true, extracted: null });

  await userDb.ads.update(params.entryId, buildOcrUpdates(entry, result));
  return NextResponse.json({
    ok: true,
    extracted: result.stats,
    confidence: result.confidence,
  });
}
