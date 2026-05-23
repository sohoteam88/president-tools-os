import { NextRequest, NextResponse } from "next/server";
import { getAccountFromSession } from "@/lib/auth/session";
import { scopedDb } from "@/lib/db/scoped";
import { capturesQuerySchema } from "@/lib/validators/voice";

export async function GET(request: NextRequest) {
  try {
    const account = await getAccountFromSession();
    if (!account) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const parsed = capturesQuerySchema.safeParse({
      type: request.nextUrl.searchParams.get("type") ?? undefined,
      limit: request.nextUrl.searchParams.get("limit") ?? undefined,
    });
    if (!parsed.success) return NextResponse.json({ error: "Invalid query" }, { status: 400 });

    const captures = await scopedDb(account.id).voice.listCaptures(
      parsed.data.type,
      parsed.data.limit
    );
    return NextResponse.json({ data: { captures, similarity_warning: false } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load captures";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
