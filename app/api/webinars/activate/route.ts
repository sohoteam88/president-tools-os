import { NextRequest, NextResponse } from "next/server";
import { getAccountFromSession } from "@/lib/auth/session";
import { scopedDb, adminDb } from "@/lib/db/scoped";
import { WebinarCustomIntroSchema } from "@/lib/validators/webinars";

export async function POST(request: NextRequest) {
  const account = await getAccountFromSession();
  if (!account) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = WebinarCustomIntroSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Invalid intro" }, { status: 400 });
  // ADMIN: cross-account query intentional
  const master = await adminDb.webinars.getActive();
  if (!master) return NextResponse.json({ error: "No webinar available yet." }, { status: 404 });
  const userDb = scopedDb(account.id);
  const activation = await userDb.webinars.activate(master.id, parsed.data.customIntro || undefined);
  await userDb.audit.log({
    actorUserId: account.userId,
    action: "webinar.activated",
    resourceType: "webinar",
    resourceId: master.id,
  });
  return NextResponse.json({ data: { ok: true, activation } });
}
