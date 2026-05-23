import { NextRequest, NextResponse } from "next/server";
import { getAccountFromSession } from "@/lib/auth/session";
import { scopedDb } from "@/lib/db/scoped";
import { getPublicUrl, generateUploadPresignedUrl, r2KeyForCapture } from "@/lib/storage/r2";
import { uploadUrlSchema } from "@/lib/validators/voice";

export async function POST(request: NextRequest) {
  try {
    const account = await getAccountFromSession();
    if (!account) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const parsed = uploadUrlSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid voice capture request" }, { status: 400 });
    }

    const { captureType, durationSeconds } = parsed.data;
    if (captureType === "why_story" && (durationSeconds < 60 || durationSeconds > 600)) {
      return NextResponse.json({ error: "Why Story must be 1 to 10 minutes" }, { status: 400 });
    }
    if (captureType === "daily_journey" && (durationSeconds < 20 || durationSeconds > 300)) {
      return NextResponse.json({ error: "Daily Journey must be 20 seconds to 5 minutes" }, { status: 400 });
    }

    const userDb = scopedDb(account.id);
    if (captureType === "why_story" && (await userDb.voice.getWhyStory())) {
      return NextResponse.json({ error: "Your Why Story is already locked in" }, { status: 409 });
    }
    if (captureType === "daily_journey" && (await userDb.voice.countTodayDailyJourneys()) >= 3) {
      return NextResponse.json({ error: "Daily Journey limit reached" }, { status: 429 });
    }

    const capture = await userDb.voice.createCapture({
      type: captureType,
      status: "uploading",
      durationSeconds,
    });
    if (!capture) return NextResponse.json({ error: "Failed to create capture" }, { status: 500 });

    const key = r2KeyForCapture(account.id, capture.id);
    await userDb.voice.updateCapture(capture.id, {
      r2Key: key,
      r2PublicUrl: getPublicUrl(key),
    });

    const uploadUrl = await generateUploadPresignedUrl(key, "audio/webm");
    return NextResponse.json({
      data: { captureId: capture.id, uploadUrl, expiresIn: 300 },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create upload URL";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
