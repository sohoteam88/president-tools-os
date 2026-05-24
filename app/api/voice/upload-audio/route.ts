/**
 * POST /api/voice/upload-audio
 *
 * Accepts a multipart/form-data audio blob + metadata, uploads it to R2
 * server-side (no browser→R2 CORS required), and enqueues transcription.
 *
 * Replaces the former 3-step browser flow:
 *   1. POST /api/voice/upload-url  → presigned URL
 *   2. PUT  <r2-presigned-url>     → CORS-blocked in most browsers
 *   3. POST /api/voice/confirm-upload
 *
 * Returns: { captureId: string }
 * Client then polls GET /api/voice/status/[captureId] as before.
 */

import { NextRequest, NextResponse } from "next/server";
import { getAccountFromSession } from "@/lib/auth/session";
import { scopedDb } from "@/lib/db/scoped";
import { uploadBytes, getPublicUrl, r2KeyForCapture } from "@/lib/storage/r2";
import { transcriptionQueue } from "@/lib/jobs/queues";
import { captureTypeSchema } from "@/lib/validators/voice";

const MAX_AUDIO_BYTES = 25 * 1024 * 1024; // 25 MB

export async function POST(request: NextRequest) {
  try {
    const account = await getAccountFromSession();
    if (!account) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    // --- Parse multipart form data ---
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

    // --- Business-rule guards (same as upload-url route) ---
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
    if (
      captureType === "daily_journey" &&
      (await userDb.voice.countTodayDailyJourneys()) >= 3
    ) {
      return NextResponse.json({ error: "Daily Journey limit reached" }, { status: 429 });
    }

    // --- Create DB record ---
    const capture = await userDb.voice.createCapture({
      type: captureType,
      status: "uploading",
      durationSeconds,
    });
    if (!capture) {
      return NextResponse.json({ error: "Failed to create capture record" }, { status: 500 });
    }

    // --- Upload audio to R2 server-side (no CORS needed) ---
    const r2Key = r2KeyForCapture(account.id, capture.id);
    const audioBytes = new Uint8Array(await audioField.arrayBuffer());
    await uploadBytes(r2Key, audioBytes, "audio/webm");

    await userDb.voice.updateCapture(capture.id, {
      r2Key,
      r2PublicUrl: getPublicUrl(r2Key),
      status: "transcribing",
    });

    // --- Enqueue transcription job ---
    const job = await transcriptionQueue.add("transcribe", {
      captureId: capture.id,
      accountId: account.id,
      r2Key,
    });
    await userDb.voice.updateCapture(capture.id, { jobId: job.id });

    return NextResponse.json({ data: { captureId: capture.id } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Upload failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
