import { NextRequest, NextResponse } from "next/server";
import { getAccountFromSession } from "@/lib/auth/session";
import { scopedDb } from "@/lib/db/scoped";
import { MagnetDownloadQuerySchema } from "@/lib/validators/magnets";

export async function GET(request: NextRequest) {
  const account = await getAccountFromSession();
  if (!account) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = MagnetDownloadQuerySchema.safeParse({ limit: request.nextUrl.searchParams.get("limit") ?? undefined });
  if (!parsed.success) return NextResponse.json({ error: "Invalid query" }, { status: 400 });
  const downloads = await scopedDb(account.id).magnets.listDownloads(parsed.data.limit);
  return NextResponse.json({ data: { downloads, total: downloads.length } });
}
