import { rebuildVoiceProfile } from "@/lib/voice/profile";

export { rebuildVoiceProfile };

if (process.argv[1]?.endsWith("voice-profile.worker.ts")) {
  void process.argv;
}
