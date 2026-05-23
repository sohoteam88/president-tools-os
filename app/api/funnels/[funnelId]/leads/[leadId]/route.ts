import { NextRequest, NextResponse } from "next/server";
import { getAccountFromSession } from "@/lib/auth/session";
import { scopedDb } from "@/lib/db/scoped";
import { updateLeadSchema } from "@/lib/validators/funnels";

export async function PATCH(request: NextRequest, { params }: { params: { leadId: string } }) {
  const account = await getAccountFromSession();
  if (!account) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = updateLeadSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  await scopedDb(account.id).funnels.updateLeadNotes(
    params.leadId,
    parsed.data.notes ?? "",
    parsed.data.contactedAt ? new Date(parsed.data.contactedAt) : undefined
  );
  return NextResponse.json({ ok: true });
}
