"use client";

import { useEffect, useRef, useState } from "react";
import { Mic, RotateCcw, Check, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

type RecorderState =
  | "idle"
  | "recording"
  | "recorded"
  | "uploading"
  | "transcribing"
  | "done"
  | "error";

interface AudioRecorderProps {
  captureType: "why_story" | "daily_journey";
  minSeconds: number;
  maxSeconds: number;
  promptText: string;
  onComplete?: (captureId: string, transcript: string) => void;
  disabled?: boolean;
  disabledReason?: string;
}

function formatTime(seconds: number): string {
  const minutes = Math.floor(seconds / 60).toString().padStart(2, "0");
  const rest = (seconds % 60).toString().padStart(2, "0");
  return `${minutes}:${rest}`;
}

export function AudioRecorder({
  captureType,
  minSeconds,
  maxSeconds,
  promptText,
  onComplete,
  disabled,
  disabledReason,
}: AudioRecorderProps) {
  const [state, setState] = useState<RecorderState>("idle");
  const [seconds, setSeconds] = useState(0);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [error, setError] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    if (state !== "recording") return;
    timerRef.current = window.setInterval(() => {
      setSeconds((current) => {
        if (current + 1 >= maxSeconds) void stopRecording();
        return current + 1;
      });
    }, 1000);
    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
    };
  }, [state, maxSeconds]);

  async function startRecording() {
    setError(null);
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const recorder = new MediaRecorder(stream, { mimeType: "audio/webm" });
    chunksRef.current = [];
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunksRef.current.push(event.data);
    };
    recorder.onstop = () => {
      const nextBlob = new Blob(chunksRef.current, { type: "audio/webm" });
      setBlob(nextBlob);
      setAudioUrl(URL.createObjectURL(nextBlob));
      stream.getTracks().forEach((track) => track.stop());
      setState("recorded");
    };
    mediaRecorderRef.current = recorder;
    setSeconds(0);
    setState("recording");
    recorder.start();
  }

  async function stopRecording() {
    mediaRecorderRef.current?.stop();
  }

  function reset() {
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    setAudioUrl(null);
    setBlob(null);
    setSeconds(0);
    setState("idle");
    setError(null);
  }

  async function uploadRecording() {
    if (!blob) return;
    if (seconds < minSeconds) {
      setError(`Recording must be at least ${formatTime(minSeconds)}.`);
      return;
    }

    try {
      setState("uploading");
      const uploadResponse = await fetch("/api/voice/upload-url", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ captureType, durationSeconds: seconds }),
      });
      const uploadBody = (await uploadResponse.json()) as {
        data?: { captureId: string; uploadUrl: string };
        error?: string;
      };
      if (!uploadResponse.ok || !uploadBody.data) {
        throw new Error(uploadBody.error ?? "Could not prepare upload");
      }

      await fetch(uploadBody.data.uploadUrl, {
        method: "PUT",
        headers: { "content-type": "audio/webm" },
        body: blob,
      });

      setState("transcribing");
      const confirmResponse = await fetch("/api/voice/confirm-upload", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ captureId: uploadBody.data.captureId }),
      });
      if (!confirmResponse.ok) throw new Error("Could not start transcription");

      const interval = window.setInterval(async () => {
        const statusResponse = await fetch(`/api/voice/status/${uploadBody.data?.captureId}`);
        const statusBody = (await statusResponse.json()) as {
          data?: { status: string; transcript: string | null; error_message?: string | null };
        };
        const status = statusBody.data?.status;
        if (status === "accepted") {
          window.clearInterval(interval);
          setState("done");
          if (onComplete) {
            onComplete(uploadBody.data?.captureId ?? "", statusBody.data?.transcript ?? "");
          } else {
            window.location.reload();
          }
        }
        if (status === "failed") {
          window.clearInterval(interval);
          setError(statusBody.data?.error_message ?? "Transcription failed");
          setState("error");
        }
      }, 3000);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Upload failed");
      setState("error");
    }
  }

  const isBusy = state === "uploading" || state === "transcribing";
  const nearLimit = seconds > maxSeconds - 30;

  return (
    <div className="space-y-4">
      <p className="text-sm leading-6 text-muted-foreground">{promptText}</p>

      <div className="flex items-center gap-4">
        <button
          type="button"
          disabled={disabled || isBusy}
          onClick={state === "recording" ? stopRecording : startRecording}
          className={cn(
            "flex h-16 w-16 shrink-0 items-center justify-center rounded-full border text-white transition-colors",
            state === "recording" ? "bg-red-600 hover:bg-red-700" : "bg-emerald-600 hover:bg-emerald-700",
            (disabled || isBusy) && "cursor-not-allowed opacity-50"
          )}
          title={state === "recording" ? "Stop recording" : "Start recording"}
        >
          <Mic className="h-7 w-7" />
        </button>

        <div className="min-w-0 flex-1">
          <div className={cn("font-mono text-2xl font-semibold", nearLimit && "text-red-600")}>
            {formatTime(seconds)}
          </div>
          <div className="mt-2 flex h-8 items-end gap-1">
            {Array.from({ length: 18 }).map((_, index) => (
              <span
                key={index}
                className={cn(
                  "w-1.5 rounded-full bg-emerald-500/60",
                  state === "recording" && "animate-pulse"
                )}
                style={{ height: `${8 + ((index * 7) % 22)}px` }}
              />
            ))}
          </div>
        </div>
      </div>

      {disabled && disabledReason ? (
        <p className="text-xs font-medium text-amber-700">{disabledReason}</p>
      ) : null}

      {audioUrl ? <audio controls src={audioUrl} className="w-full" /> : null}

      {state === "recorded" || state === "error" ? (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={uploadRecording}
            className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground"
          >
            <Check className="h-4 w-4" />
            Use This Recording
          </button>
          <button
            type="button"
            onClick={reset}
            className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm font-medium"
          >
            <RotateCcw className="h-4 w-4" />
            Record Again
          </button>
        </div>
      ) : null}

      {isBusy ? (
        <p className="inline-flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          {state === "uploading" ? "Uploading audio..." : "Transcribing..."}
        </p>
      ) : null}

      {state === "done" ? <p className="text-sm font-medium text-emerald-700">Transcript accepted.</p> : null}
      {error ? <p className="text-sm font-medium text-red-700">{error}</p> : null}
    </div>
  );
}
