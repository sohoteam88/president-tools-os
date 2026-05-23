import { NextRequest, NextResponse } from "next/server";
import { runWeeklyCompileForAllAccounts } from "@/lib/voice/weekly-compile";

export async function GET(request: NextRequest) {
  try {
    const expected = `Bearer ${process.env.CRON_SECRET ?? ""}`;
    if (!process.env.CRON_SECRET || request.headers.get("authorization") !== expected) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const result = await runWeeklyCompileForAllAccounts();
    return NextResponse.json({ data: result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Weekly compile failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
