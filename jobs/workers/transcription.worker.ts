/**
 * Transcription Queue Worker
 *
 * Polls the Upstash Redis list "queue:transcription" for jobs enqueued by
 * lib/jobs/queues.ts and processes them by calling lib/voice/transcription.ts.
 *
 * NOTE: This project does NOT use BullMQ. It uses a custom HTTP-based queue
 * backed by Upstash Redis REST API (lpush to enqueue, brpop to dequeue).
 *
 * Run locally:   npm run worker:transcription
 * Production:    managed by PM2 via ecosystem.config.js
 *
 * Requires in .env.local:
 *   REDIS_URL=https://<upstash-host>
 *   REDIS_TOKEN=<upstash-token>
 *   OPENAI_API_KEY=<key>
 */

import "dotenv/config";
import { transcribeCapture } from "@/lib/voice/transcription";
import type { TranscriptionJobData } from "@/lib/jobs/queues";

const QUEUE_NAME = "queue:transcription";
const POLL_INTERVAL_MS = 5_000; // idle wait between empty polls
const BRPOP_TIMEOUT_SECS = 5;   // blocking-pop server-side timeout

type RawJob = {
  id: string;
  name: string;
  data: TranscriptionJobData;
};

function redisCredentials(): { url: string; token: string } {
  const url = process.env.REDIS_URL;
  const token = process.env.REDIS_TOKEN;
  if (!url || !token) {
    throw new Error(
      "[transcription-worker] REDIS_URL and REDIS_TOKEN must be set in the environment"
    );
  }
  return { url: url.replace(/\/$/, ""), token };
}

async function dequeueJob(url: string, token: string): Promise<RawJob | null> {
  // BRPOP returns [listName, value] or null on timeout
  const res = await fetch(`${url}/brpop/${QUEUE_NAME}/${BRPOP_TIMEOUT_SECS}`, {
    method: "GET",
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    console.error(`[transcription-worker] Redis BRPOP failed: ${res.status}`);
    return null;
  }

  const body = (await res.json()) as { result?: [string, string] | null };
  if (!body.result) return null;

  const [, rawValue] = body.result;
  try {
    // lib/jobs/queues enqueues with double JSON.stringify
    const inner = JSON.parse(rawValue) as string;
    return JSON.parse(inner) as RawJob;
  } catch {
    console.error("[transcription-worker] Failed to parse job payload:", rawValue);
    return null;
  }
}

async function processJob(job: RawJob): Promise<void> {
  console.log(`[transcription-worker] Processing job ${job.id} (${job.name})`);

  if (job.name === "transcribe" || job.name === "why-story-transcription") {
    const { captureId, accountId, r2Key } = job.data;
    if (!accountId) {
      console.error("[transcription-worker] Job missing accountId — skipping:", job.id);
      return;
    }
    await transcribeCapture({ captureId, accountId, r2Key });
    console.log(`[transcription-worker] ✓ Job ${job.id} complete`);
    return;
  }

  console.warn(`[transcription-worker] Unknown job name "${job.name}" — skipping`);
}

async function main(): Promise<void> {
  console.log("[transcription-worker] Starting — queue:", QUEUE_NAME);

  // Will throw with a clear message if env vars are missing
  const { url, token } = redisCredentials();

  // Graceful shutdown
  let running = true;
  process.on("SIGTERM", () => {
    running = false;
    console.log("[transcription-worker] SIGTERM — draining current job then exiting");
  });
  process.on("SIGINT", () => {
    running = false;
    console.log("[transcription-worker] SIGINT — draining current job then exiting");
  });

  while (running) {
    try {
      const job = await dequeueJob(url, token);
      if (job) {
        await processJob(job);
      } else {
        // Nothing in queue — wait before next poll
        await new Promise<void>((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
      }
    } catch (error) {
      console.error("[transcription-worker] Error:", error);
      await new Promise<void>((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    }
  }

  console.log("[transcription-worker] Stopped.");
}

// Named re-export so other modules can import transcribeCapture via this file
export { transcribeCapture };

// Always run when invoked directly (tsx ./jobs/workers/transcription.worker.ts)
void main().catch((err: unknown) => {
  console.error("[transcription-worker] Fatal:", err instanceof Error ? err.message : err);
  process.exit(1);
});
