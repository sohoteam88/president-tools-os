import { NextRequest, NextResponse } from "next/server";
import { getAccountFromSession } from "@/lib/auth/session";
import { scopedDb } from "@/lib/db/scoped";
import { transcriptionQueue } from "@/lib/jobs/queues";
import { confirmUploadSchema } from "@/lib/validators/voice";

export async function POST(request: NextRequest) {
  try {
    const account = await getAccountFromSession();
    if (!account) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const parsed = confirmUploadSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "Invalid capture id" }, { status: 400 });

    const userDb = scopedDb(account.id);
    const capture = await userDb.voice.getCapture(parsed.data.captureId);
    if (!capture) return NextResponse.json({ error: "Capture not found" }, { status: 404 });
    if (capture.status !== "uploading" || !capture.r2Key) {
      return NextResponse.json({ error: "Capture is not ready for confirmation" }, { status: 409 });
    }

    await userDb.voice.updateCapture(capture.id, { status: "transcribing" });
    const job = await transcriptionQueue.add("transcribe", {
      captureId: capture.id,
      accountId: account.id,
      r2Key: capture.r2Key,
    });
    await userDb.voice.updateCapture(capture.id, { jobId: job.id });

    return NextResponse.json({ data: { jobId: job.id } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to confirm upload";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
