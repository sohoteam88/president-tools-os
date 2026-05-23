import { NextRequest, NextResponse } from "next/server";
import { getAccountFromSession } from "@/lib/auth/session";
import { scopedDb } from "@/lib/db/scoped";
import { WebinarCustomIntroSchema } from "@/lib/validators/webinars";

export async function PUT(request: NextRequest) {
  const account = await getAccountFromSession();
  if (!account) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const contentType = request.headers.get("content-type") ?? "";
  const body = contentType.includes("form")
    ? Object.fromEntries((await request.formData()).entries())
    : await request.json().catch(() => null);
  const parsed = WebinarCustomIntroSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid intro" }, { status: 400 });
  await scopedDb(account.id).webinars.updateCustomIntro(parsed.data.customIntro ?? "");
  return NextResponse.json({ ok: true });
}

export const POST = PUT;
