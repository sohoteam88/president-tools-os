import { NextRequest, NextResponse } from "next/server";
import { getAccountFromSession } from "@/lib/auth/session";
import { scopedDb } from "@/lib/db/scoped";
import { getPublishedResponses } from "@/lib/objections/library";
import { getServerLocale } from "@/lib/locale-server";
import { OBJECTION_CATEGORIES, type ObjectionCategory } from "@/lib/objections/types";

function parseCategory(value: string | null): ObjectionCategory | undefined {
  return OBJECTION_CATEGORIES.find((category) => category === value);
}

export async function GET(request: NextRequest) {
  const account = await getAccountFromSession();
  if (!account) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const category = parseCategory(request.nextUrl.searchParams.get("category"));
  const userDb = scopedDb(account.id);
  const [masterResponses, personalResponses, favouriteIds] = await Promise.all([
    getPublishedResponses(getServerLocale(), category),
    userDb.objections.listPersonal(category),
    userDb.objections.listFavouriteIds(),
  ]);
  return NextResponse.json({ masterResponses, personalResponses, favouriteIds });
}
