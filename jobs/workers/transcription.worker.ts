import { transcribeCapture } from "@/lib/voice/transcription";

export { transcribeCapture };

if (process.argv[1]?.endsWith("transcription.worker.ts")) {
  void process.argv;
}
