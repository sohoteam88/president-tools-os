/**
 * POST /api/voice/upload-audio
 *
 * Accepts multipart/form-data (audio + captureType + durationSeconds),
 * uploads to R2 server-side (no browser→R2 CORS), then kicks off Whisper
 * transcription directly in-process instead of via a queue.
 *
 * Flow:
 *   1. Validate + upload to R2               (awaited, ~1-3 s)
 *   2. Return { captureId } to client        (immediate)
 *   3. transcribeCapture() runs async        (~15-30 s, fire-and-forget)
 *   4. Client polls /api/voice/status/:id    until status === "accepted"
 *
 * Why fire-and-forget instead of await?  Whisper can take 30+ seconds on long
 * recordings; we don't want to hold the HTTP connection that long. PM2 keeps
 * the Node process alive so the async work completes even after response.
 */

import { NextRequest, NextResponse } from "next/server";
import { getAccountFromSession } from "@/lib/auth/session";
import { scopedDb } from "@/lib/db/scoped";
import { uploadBytes, getPublicUrl, r2KeyForCapture } from "@/lib/storage/r2";
import { transcribeCapture } from "@/lib/voice/transcription";
import { captureTypeSchema } from "@/lib/validators/voice";

const MAX_AUDIO_BYTES = 25 * 1024 * 1024; // 25 MB

export async function POST(request: NextRequest) {
  try {
    const account = await getAccountFromSession();
    if (!account) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const contentType = request.headers.get("content-type") ?? "";
    if (!contentType.includes("multipart/form-data")) {
      return NextResponse.json({ error: "Expected multipart/form-data" }, { status: 400 });
    }

    let formData: FormData;
    try {
      formData = await request.formData();
    } catch {
      return NextResponse.json({ error: "Could not parse form data" }, { status: 400 });
    }

    const audioField = formData.get("audio");
    if (!(audioField instanceof File) || audioField.size === 0) {
      return NextResponse.json({ error: "Missing or empty audio file" }, { status: 400 });
    }
    if (audioField.size > MAX_AUDIO_BYTES) {
      return NextResponse.json({ error: "Audio file exceeds 25 MB limit" }, { status: 413 });
    }

    const captureTypeParsed = captureTypeSchema.safeParse(formData.get("captureType"));
    if (!captureTypeParsed.success) {
      return NextResponse.json(
        { error: "captureType must be why_story or daily_journey" },
        { status: 400 }
      );
    }
    const captureType = captureTypeParsed.data;

    const rawDuration = formData.get("durationSeconds");
    const durationSeconds = rawDuration ? parseInt(String(rawDuration), 10) : 0;
    if (!Number.isFinite(durationSeconds) || durationSeconds < 1) {
      return NextResponse.json({ error: "Invalid durationSeconds" }, { status: 400 });
    }

    // Business-rule guards
    const userDb = scopedDb(account.id);

    if (captureType === "why_story" && (durationSeconds < 60 || durationSeconds > 600)) {
      return NextResponse.json({ error: "Why Story must be 1 to 10 minutes" }, { status: 400 });
    }
    if (captureType === "daily_journey" && (durationSeconds < 20 || durationSeconds > 300)) {
      return NextResponse.json(
        { error: "Daily Journey must be 20 seconds to 5 minutes" },
        { status: 400 }
      );
    }
    if (captureType === "why_story" && (await userDb.voice.getWhyStory())) {
      return NextResponse.json({ error: "Your Why Story is already locked in" }, { status: 409 });
    }
    if (captureType === "daily_journey" && (await userDb.voice.countTodayDailyJourneys()) >= 3) {
      return NextResponse.json({ error: "Daily Journey limit reached" }, { status: 429 });
    }

    // Create DB record
    const capture = await userDb.voice.createCapture({
      type: captureType,
      status: "uploading",
      durationSeconds,
    });
    if (!capture) {
      return NextResponse.json({ error: "Failed to create capture record" }, { status: 500 });
    }

    // Upload to R2 server-side (no CORS)
    const r2Key = r2KeyForCapture(account.id, capture.id);
    const audioBytes = new Uint8Array(await audioField.arrayBuffer());
    await uploadBytes(r2Key, audioBytes, "audio/webm");

    await userDb.voice.updateCapture(capture.id, {
      r2Key,
      r2PublicUrl: getPublicUrl(r2Key),
      status: "transcribing",
    });

    // Fire transcription in background — don't await (Whisper takes 15-30 s).
    // PM2 keeps the process alive so this resolves even after the response.
    void transcribeCapture({
      captureId: capture.id,
      accountId: account.id,
      r2Key,
    });

    // Return immediately — client polls /api/voice/status/:id
    return NextResponse.json({ data: { captureId: capture.id } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Upload failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
