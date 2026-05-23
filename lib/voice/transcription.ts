import { scopedDb } from "@/lib/db/scoped";
import { generateDownloadPresignedUrl } from "@/lib/storage/r2";
import { voiceProfileQueue } from "@/lib/jobs/queues";

export function cleanTranscript(transcript: string): string {
  return transcript
    .replace(/\b(um|uh|erm|ah)\b[,\s]*/gi, "")
    .replace(/\blike\b[,\s]*/gi, "")
    .replace(/\b(\w+)(\s+\1\b)+/gi, "$1")
    .replace(/\s{2,}/g, " ")
    .trim();
}

export async function transcribeCapture(data: {
  captureId?: string;
  accountId: string;
  r2Key?: string;
}): Promise<void> {
  const userDb = scopedDb(data.accountId);

  try {
    if (!data.captureId || !data.r2Key) throw new Error("Missing transcription capture data");
    const audioUrl = await generateDownloadPresignedUrl(data.r2Key);
    const audioResponse = await fetch(audioUrl);
    if (!audioResponse.ok) {
      throw new Error("Failed to download audio from R2");
    }

    const formData = new FormData();
    const audioBlob = await audioResponse.blob();
    formData.append("file", audioBlob, "voice.webm");
    formData.append("model", "whisper-1");
    formData.append("response_format", "text");

    const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY ?? ""}`,
      },
      body: formData,
    });

    if (!response.ok) {
      throw new Error(`Whisper transcription failed: ${response.status}`);
    }

    const transcript = await response.text();
    await userDb.voice.updateCapture(data.captureId, {
      transcript,
      transcriptCleaned: cleanTranscript(transcript),
      status: "accepted",
    });

    await voiceProfileQueue.add("rebuild", { accountId: data.accountId });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Transcription failed";
    if (data.captureId) {
      await userDb.voice.updateCapture(data.captureId, {
        status: "failed",
        errorMessage: message,
      });
    }
  }
}
