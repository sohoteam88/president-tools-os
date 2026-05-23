import { NextRequest, NextResponse } from "next/server";
import { getAccountFromSession } from "@/lib/auth/session";
import { scopedDb, adminDb } from "@/lib/db/scoped";
import { personaliseMagnetPdf } from "@/lib/magnets/personalise";

export async function POST(_request: NextRequest) {
  const account = await getAccountFromSession();
  if (!account) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  // ADMIN: cross-account query intentional
  const master = await adminDb.magnets.getActive();
  if (!master) return NextResponse.json({ error: "No lead magnet available" }, { status: 404 });
  const key = await personaliseMagnetPdf({
    masterPdfKey: master.masterPdfKey,
    accountId: account.id,
    accountName: account.name,
    whatsappNumber: "",
    accountSlug: account.slug,
  });
  await scopedDb(account.id).magnets.markPersonalised(key, master.version);
  return NextResponse.json({ data: { ok: true, personalisedAt: new Date() } });
}
