import { NextResponse } from "next/server";
import { getAccountFromSession } from "@/lib/auth/session";
import { syncContactsFromSources } from "@/lib/crm/sync";

export async function POST() {
  const account = await getAccountFromSession();
  if (!account) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const result = await syncContactsFromSources(account.id);
  return NextResponse.json({ result });
}
