import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/session";
import { draftObjectionResponses } from "@/lib/objections/draft";
import { DraftRequestSchema } from "@/lib/validators/objections";

export async function POST(request: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = DraftRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid draft request" }, { status: 400 });
  const drafts = await draftObjectionResponses(parsed.data.category, parsed.data.specificObjection);
  return NextResponse.json({ drafts });
}
