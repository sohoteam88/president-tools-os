import { NextRequest, NextResponse } from "next/server";
import { getAccountFromSession } from "@/lib/auth/session";
import { scopedDb } from "@/lib/db/scoped";
import { FavouriteSchema } from "@/lib/validators/objections";

export async function POST(request: NextRequest) {
  const account = await getAccountFromSession();
  if (!account) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = FavouriteSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid favourite request" }, { status: 400 });
  const userDb = scopedDb(account.id);
  if (parsed.data.action === "add") await userDb.objections.addFavourite(parsed.data.responseId);
  else await userDb.objections.removeFavourite(parsed.data.responseId);
  return NextResponse.json({ ok: true });
}
