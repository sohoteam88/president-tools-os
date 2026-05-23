import { NextRequest, NextResponse } from "next/server";
import { getAccountFromSession } from "@/lib/auth/session";
import { scopedDb } from "@/lib/db/scoped";

export async function GET(
  _request: NextRequest,
  { params }: { params: { captureId: string } }
) {
  try {
    const account = await getAccountFromSession();
    if (!account) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const capture = await scopedDb(account.id).voice.getCapture(params.captureId);
    if (!capture) return NextResponse.json({ error: "Capture not found" }, { status: 404 });

    return NextResponse.json({
      data: {
        status: capture.status,
        transcript: capture.status === "accepted" ? capture.transcriptCleaned : null,
        error_message: capture.errorMessage,
        similarity_warning: false,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load capture status";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
