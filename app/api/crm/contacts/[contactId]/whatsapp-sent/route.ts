import { NextResponse } from "next/server";
import { getAccountFromSession } from "@/lib/auth/session";
import { scopedDb } from "@/lib/db/scoped";

type Params = { params: { contactId: string } };

export async function POST(_request: Request, { params }: Params) {
  const account = await getAccountFromSession();
  if (!account) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userDb = scopedDb(account.id);
  const contact = await userDb.crm.update(params.contactId, { lastContactedAt: new Date() });
  if (!contact) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await userDb.crm.logActivity({
    contactId: params.contactId,
    activityType: "whatsapp_sent",
    payload: null,
  });
  return NextResponse.json({ ok: true });
}
