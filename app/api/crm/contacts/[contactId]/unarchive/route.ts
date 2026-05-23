import { NextResponse } from "next/server";
import { getAccountFromSession } from "@/lib/auth/session";
import { scopedDb } from "@/lib/db/scoped";

type Params = { params: { contactId: string } };

export async function POST(_request: Request, { params }: Params) {
  const account = await getAccountFromSession();
  if (!account) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await scopedDb(account.id).crm.unarchive(params.contactId);
  return NextResponse.json({ ok: true });
}
