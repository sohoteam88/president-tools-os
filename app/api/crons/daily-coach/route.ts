import { NextRequest, NextResponse } from "next/server";
import { runCoachWorker } from "@/jobs/workers/coach.worker";

export async function GET(request: NextRequest) {
  const expected = `Bearer ${process.env.CRON_SECRET ?? ""}`;
  if (!process.env.CRON_SECRET || request.headers.get("authorization") !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    await runCoachWorker();
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[daily-coach cron] Fatal error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
