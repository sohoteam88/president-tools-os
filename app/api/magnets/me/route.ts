import { NextRequest, NextResponse } from "next/server";
import { getAccountFromSession } from "@/lib/auth/session";
import { scopedDb, adminDb } from "@/lib/db/scoped";

export async function GET(_request: NextRequest) {
  const account = await getAccountFromSession();
  if (!account) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  // ADMIN: cross-account query intentional
  const masterMagnet = await adminDb.magnets.getActive();
  const activation = await scopedDb(account.id).magnets.getActivation();
  const isStale = !!activation && !!masterMagnet && activation.masterVersionAtPersonalisation !== masterMagnet.version;
  return NextResponse.json({
    data: {
      masterMagnet: masterMagnet ? sanitiseMagnet(masterMagnet) : null,
      activation,
      isStale,
    },
  });
}

function sanitiseMagnet<T extends { masterPdfKey?: string }>(magnet: T): Omit<T, "masterPdfKey"> {
  const { masterPdfKey: _key, ...safe } = magnet;
  return safe;
}
