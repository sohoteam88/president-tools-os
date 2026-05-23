type QueueName = "transcription" | "voice-profile";

export type TranscriptionJobData = {
  captureId?: string;
  accountId: string;
  r2Key?: string;
  sessionId?: string;
  questionIndex?: number;
  audioKey?: string;
  callbackType?: "voice_capture" | "why_story";
};

export type VoiceProfileJobData = {
  accountId: string;
  force?: boolean;
};

type QueueJob<T> = {
  id: string;
  name: string;
  data: T;
};

function makeJobId(queue: QueueName): string {
  return `${queue}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

async function enqueue<T>(queue: QueueName, name: string, data: T): Promise<QueueJob<T>> {
  const id = makeJobId(queue);
  const redisUrl = process.env.REDIS_URL;
  const redisToken = process.env.REDIS_TOKEN;

  if (redisUrl && redisToken) {
    await fetch(`${redisUrl.replace(/\/$/, "")}/lpush/queue:${queue}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${redisToken}` },
      body: JSON.stringify(JSON.stringify({ id, name, data })),
    }).catch(() => undefined);
  }

  return { id, name, data };
}

export const transcriptionQueue = {
  add: (name: "transcribe" | "why-story-transcription", data: TranscriptionJobData) =>
    enqueue("transcription", name, data),
};

export const voiceProfileQueue = {
  add: (name: "rebuild", data: VoiceProfileJobData) =>
    enqueue("voice-profile", name, data),
};
