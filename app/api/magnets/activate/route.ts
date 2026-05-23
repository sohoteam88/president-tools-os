import { NextRequest, NextResponse } from "next/server";
import { getAccountFromSession } from "@/lib/auth/session";
import { scopedDb, adminDb } from "@/lib/db/scoped";
import { personaliseMagnetPdf } from "@/lib/magnets/personalise";

export async function POST(_request: NextRequest) {
  const account = await getAccountFromSession();
  if (!account) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  // ADMIN: cross-account query intentional
  const master = await adminDb.magnets.getActive();
  if (!master) return NextResponse.json({ error: "No lead magnet available yet. Ask your upline." }, { status: 404 });
  const userDb = scopedDb(account.id);
  const activation = await userDb.magnets.activate(master.id);
  try {
    const key = await personaliseMagnetPdf({
      masterPdfKey: master.masterPdfKey,
      accountId: account.id,
      accountName: account.name,
      whatsappNumber: "",
      accountSlug: account.slug,
    });
    await userDb.magnets.markPersonalised(key, master.version);
  } catch (error) {
    console.warn("[magnets] personalisation failed", error instanceof Error ? error.message : "unknown");
  }
  await userDb.audit.log({
    actorUserId: account.userId,
    action: "magnet.activated",
    resourceType: "lead_magnet",
    resourceId: master.id,
  });
  return NextResponse.json({ data: { ok: true, activation } });
}
