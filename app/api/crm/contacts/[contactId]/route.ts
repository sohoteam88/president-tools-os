import { NextRequest, NextResponse } from "next/server";
import { getAccountFromSession } from "@/lib/auth/session";
import { scopedDb } from "@/lib/db/scoped";
import { normaliseWhatsAppNumber } from "@/lib/funnels/whatsapp";
import { UpdateContactSchema } from "@/lib/validators/crm";

type Params = { params: { contactId: string } };

export async function GET(_request: NextRequest, { params }: Params) {
  const account = await getAccountFromSession();
  if (!account) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userDb = scopedDb(account.id);
  const contact = await userDb.crm.get(params.contactId);
  if (!contact) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const activities = await userDb.crm.listActivities(params.contactId, 20);
  return NextResponse.json({ contact, activities });
}

export async function PUT(request: NextRequest, { params }: Params) {
  const account = await getAccountFromSession();
  if (!account) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = UpdateContactSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid contact" }, { status: 400 });

  const userDb = scopedDb(account.id);
  const existing = await userDb.crm.get(params.contactId);
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const previousNotes = existing.notes ?? "";

  const contact = await userDb.crm.update(params.contactId, {
    ...("name" in parsed.data ? { name: parsed.data.name } : {}),
    ...("whatsappNumber" in parsed.data && parsed.data.whatsappNumber ? {
      whatsappNumber: normaliseWhatsAppNumber(parsed.data.whatsappNumber),
    } : {}),
    ...("email" in parsed.data ? { email: parsed.data.email || null } : {}),
    ...("notes" in parsed.data ? { notes: parsed.data.notes || null } : {}),
    ...("lastContactedAt" in parsed.data ? {
      lastContactedAt: parsed.data.lastContactedAt ? new Date(parsed.data.lastContactedAt) : null,
    } : {}),
  });
  if (!contact) return NextResponse.json({ error: "Failed to update contact" }, { status: 500 });

  if ("notes" in parsed.data && previousNotes !== (parsed.data.notes ?? "")) {
    await userDb.crm.logActivity({
      contactId: params.contactId,
      activityType: "note_added",
      payload: JSON.stringify({ note: parsed.data.notes ?? "" }),
    });
  }
  if ("lastContactedAt" in parsed.data) {
    await userDb.crm.logActivity({
      contactId: params.contactId,
      activityType: "manual_contact",
      payload: null,
    });
  }

  return NextResponse.json({ contact });
}
