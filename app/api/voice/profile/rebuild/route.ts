import { NextRequest, NextResponse } from "next/server";
import { getAccountFromSession } from "@/lib/auth/session";
import { scopedDb } from "@/lib/db/scoped";
import { voiceProfileQueue } from "@/lib/jobs/queues";

export async function POST(_request: NextRequest) {
  try {
    const account = await getAccountFromSession();
    if (!account) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const profile = await scopedDb(account.id).voice.getLatestProfile();
    if (profile) {
      const lastBuilt = new Date(profile.builtAt).getTime();
      if (Date.now() - lastBuilt < 10 * 60 * 1000) {
        return NextResponse.json({ error: "Profile was rebuilt recently" }, { status: 429 });
      }
    }

    const job = await voiceProfileQueue.add("rebuild", { accountId: account.id, force: true });
    return NextResponse.json({ data: { jobId: job.id } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to rebuild profile";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
