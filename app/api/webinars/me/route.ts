import { NextRequest, NextResponse } from "next/server";
import { getAccountFromSession } from "@/lib/auth/session";
import { scopedDb, adminDb } from "@/lib/db/scoped";

export async function GET(_request: NextRequest) {
  const account = await getAccountFromSession();
  if (!account) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  // ADMIN: cross-account query intentional
  const masterWebinar = await adminDb.webinars.getActive();
  const activation = await scopedDb(account.id).webinars.getActivation();
  return NextResponse.json({ data: { masterWebinar, activation } });
}
