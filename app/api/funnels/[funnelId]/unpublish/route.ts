import { NextRequest, NextResponse } from "next/server";
import { getAccountFromSession } from "@/lib/auth/session";
import { scopedDb } from "@/lib/db/scoped";

export async function POST(_request: NextRequest, { params }: { params: { funnelId: string } }) {
  const account = await getAccountFromSession();
  if (!account) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ data: { funnel: await scopedDb(account.id).funnels.unpublish(params.funnelId) } });
}
