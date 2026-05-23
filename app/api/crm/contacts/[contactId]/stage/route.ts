import { NextRequest, NextResponse } from "next/server";
import { getAccountFromSession } from "@/lib/auth/session";
import { scopedDb } from "@/lib/db/scoped";
import { MoveStageSchema } from "@/lib/validators/crm";

type Params = { params: { contactId: string } };

export async function POST(request: NextRequest, { params }: Params) {
  const account = await getAccountFromSession();
  if (!account) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = MoveStageSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid stage" }, { status: 400 });
  const userDb = scopedDb(account.id);
  const contact = await userDb.crm.get(params.contactId);
  if (!contact) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (contact.stage === parsed.data.stage) return NextResponse.json({ contact });
  const updatedContact = await userDb.crm.moveStage(params.contactId, parsed.data.stage);
  return NextResponse.json({ contact: updatedContact });
}
