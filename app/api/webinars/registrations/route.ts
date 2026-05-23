import { NextRequest, NextResponse } from "next/server";
import { getAccountFromSession } from "@/lib/auth/session";
import { scopedDb } from "@/lib/db/scoped";
import { WebinarRegistrationsQuerySchema } from "@/lib/validators/webinars";

export async function GET(request: NextRequest) {
  const account = await getAccountFromSession();
  if (!account) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = WebinarRegistrationsQuerySchema.safeParse({
    limit: request.nextUrl.searchParams.get("limit") ?? undefined,
  });
  if (!parsed.success) return NextResponse.json({ error: "Invalid query" }, { status: 400 });
  const registrations = await scopedDb(account.id).webinars.listRegistrations(parsed.data.limit);
  const safe = registrations.map(({ watchToken: _token, ...registration }) => registration);
  return NextResponse.json({ data: { registrations: safe, total: safe.length } });
}
