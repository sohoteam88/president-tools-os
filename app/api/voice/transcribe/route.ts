import { NextRequest, NextResponse } from "next/server";
import { getAccountFromSession } from "@/lib/auth/session";

const MAX_FILE_BYTES = 25 * 1024 * 1024; // 25 MB — Whisper hard limit

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

    const fileField = formData.get("audio");
    if (!(fileField instanceof File)) {
      return NextResponse.json({ error: "Missing audio file (field name: audio)" }, { status: 400 });
    }

    if (fileField.size === 0) {
      return NextResponse.json({ error: "Audio file is empty" }, { status: 400 });
    }
    if (fileField.size > MAX_FILE_BYTES) {
      return NextResponse.json({ error: "Audio file exceeds 25 MB limit" }, { status: 413 });
    }

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json({ error: "Transcription service not configured" }, { status: 503 });
    }

    const whisperForm = new FormData();
    // Keep the original file name/type so Whisper can sniff the format
    whisperForm.append("file", fileField, fileField.name || "audio.webm");
    whisperForm.append("model", "whisper-1");
    whisperForm.append("response_format", "text");

    const whisperRes = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: whisperForm,
    });

    if (!whisperRes.ok) {
      // Do NOT forward the raw error text — it may contain internal details
      return NextResponse.json(
        { error: `Transcription failed (Whisper returned ${whisperRes.status})` },
        { status: 502 }
      );
    }

    const text = (await whisperRes.text()).trim();
    return NextResponse.json({ text });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Transcription error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
