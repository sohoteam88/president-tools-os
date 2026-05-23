import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getAccountFromSession } from "@/lib/auth/session";
import { scopedDb } from "@/lib/db/scoped";
import { db } from "@/lib/db";
import { accounts } from "@/lib/db/schema";
import { setSlugSchema } from "@/lib/validators/funnels";

export async function POST(request: NextRequest) {
  try {
    const account = await getAccountFromSession();
    if (!account) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const parsed = setSlugSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid slug" }, { status: 400 });

    const [taken] = await db.select({ id: accounts.id }).from(accounts).where(eq(accounts.slug, parsed.data.slug)).limit(1);
    if (taken && taken.id !== account.id) return NextResponse.json({ error: "Slug is already taken" }, { status: 409 });
    await scopedDb(account.id).accounts.setSlug(parsed.data.slug);
    return NextResponse.json({ ok: true, slug: parsed.data.slug });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to set slug";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
