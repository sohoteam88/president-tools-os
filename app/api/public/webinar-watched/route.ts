import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { webinarRegistrations } from "@/lib/db/schema";
import { getReplayByToken } from "@/lib/webinars/public";

const BodySchema = z.object({ watchToken: z.string().min(8) });

export async function POST(request: NextRequest) {
  const parsed = BodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const replay = await getReplayByToken(parsed.data.watchToken);
  if (!replay) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!replay.watchedAt) {
    await db
      .update(webinarRegistrations)
      .set({ watchedAt: new Date() })
      .where(andToken(parsed.data.watchToken));
  }
  return NextResponse.json({ ok: true });
}

function andToken(watchToken: string) {
  return eq(webinarRegistrations.watchToken, watchToken);
}
