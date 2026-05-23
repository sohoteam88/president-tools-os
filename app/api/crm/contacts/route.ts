import { NextRequest, NextResponse } from "next/server";
import { getAccountFromSession } from "@/lib/auth/session";
import { scopedDb } from "@/lib/db/scoped";
import { normaliseWhatsAppNumber } from "@/lib/funnels/whatsapp";
import { PIPELINE_STAGES, type PipelineStage } from "@/lib/crm/types";
import { CreateContactSchema } from "@/lib/validators/crm";

function parseStage(value: string | null): PipelineStage | undefined {
  return PIPELINE_STAGES.find((stage) => stage === value);
}

export async function GET(request: NextRequest) {
  const account = await getAccountFromSession();
  if (!account) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const limitValue = Number(request.nextUrl.searchParams.get("limit") ?? "500");
  const limit = Number.isFinite(limitValue) ? Math.min(Math.max(limitValue, 1), 500) : 500;
  const stage = parseStage(request.nextUrl.searchParams.get("stage"));
  const includeArchived = request.nextUrl.searchParams.get("includeArchived") === "true";
  const userDb = scopedDb(account.id);

  const [contacts, countByStage] = await Promise.all([
    userDb.crm.list({ stage, includeArchived, limit }),
    userDb.crm.countByStage(),
  ]);
  return NextResponse.json({ contacts, countByStage });
}

export async function POST(request: NextRequest) {
  const account = await getAccountFromSession();
  if (!account) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = CreateContactSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid contact" }, { status: 400 });

  const userDb = scopedDb(account.id);
  const whatsappNumber = normaliseWhatsAppNumber(parsed.data.whatsappNumber);
  const existing = await userDb.crm.getByWhatsApp(whatsappNumber);
  if (existing) return NextResponse.json({ error: "Contact already exists" }, { status: 409 });

  const contact = await userDb.crm.create({
    name: parsed.data.name,
    whatsappNumber,
    email: parsed.data.email || null,
    notes: parsed.data.notes || null,
    stage: parsed.data.stage,
    source: "manual",
  });
  if (!contact) return NextResponse.json({ error: "Failed to create contact" }, { status: 500 });

  await userDb.crm.logActivity({
    contactId: contact.id,
    activityType: "manual_contact",
    payload: JSON.stringify({ note: "Contact created manually." }),
  });

  return NextResponse.json({ contact }, { status: 201 });
}
