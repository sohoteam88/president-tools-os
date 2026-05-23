import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/session";
import { scopedDb } from "@/lib/db/scoped";
import { resetWhyStorySchema } from "@/lib/validators/voice";

export async function POST(request: NextRequest) {
  try {
    const admin = await requireAdmin();
    if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const parsed = resetWhyStorySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "Invalid account id" }, { status: 400 });

    await scopedDb(parsed.data.accountId).voice.deleteWhyStory();
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to reset Why Story";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
