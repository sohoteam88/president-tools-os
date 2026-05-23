import { NextRequest, NextResponse } from "next/server";
import { getAccountFromSession } from "@/lib/auth/session";
import { scopedDb } from "@/lib/db/scoped";
import { leadsQuerySchema } from "@/lib/validators/funnels";

export async function GET(request: NextRequest, { params }: { params: { funnelId: string } }) {
  const account = await getAccountFromSession();
  if (!account) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = leadsQuerySchema.safeParse({ limit: request.nextUrl.searchParams.get("limit") ?? undefined });
  if (!parsed.success) return NextResponse.json({ error: "Invalid query" }, { status: 400 });
  const leads = await scopedDb(account.id).funnels.listLeads(params.funnelId, parsed.data.limit);
  return NextResponse.json({ data: { leads, total: leads.length } });
}
