"use client";

/**
 * QuestionRecorder — compact per-question audio recorder for Why Story Q&A.
 *
 * Unlike AudioRecorder (which uploads to R2 + queues a background job), this
 * component sends audio directly to POST /api/voice/transcribe (Whisper) and
 * fires onTranscribed(text) when done. The caller is responsible for saving the
 * transcript as a why-story answer.
 */

import { useEffect, useRef, useState } from "react";
import { Mic, RotateCcw, Check, Loader2, Square } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/lib/i18n";

type RecorderState = "idle" | "recording" | "recorded" | "transcribing" | "done" | "error";

interface QuestionRecorderProps {
  /** Called with the transcript text when Whisper succeeds. */
  onTranscribed: (text: string) => void;
  /** Max recording seconds — defaults to 180 (3 min). */
  maxSeconds?: number;
  /** Disable the mic button while the parent is busy (e.g., saving). */
  disabled?: boolean;
}

function formatTime(s: number): string {
  const m = Math.floor(s / 60).toString().padStart(2, "0");
  const sec = (s % 60).toString().padStart(2, "0");
  return `${m}:${sec}`;
}

export function QuestionRecorder({
  onTranscribed,
  maxSeconds = 180,
  disabled = false,
}: QuestionRecorderProps) {
  const { t } = useLanguage();
  const [state, setState] = useState<RecorderState>("idle");
  const [seconds, setSeconds] = useState(0);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [error, setError] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);

  // Auto-stop when maxSeconds is reached
  useEffect(() => {
    if (state !== "recording") return;
    timerRef.current = window.setInterval(() => {
      setSeconds((prev) => {
        if (prev + 1 >= maxSeconds) {
          void stopRecording();
        }
        return prev + 1;
      });
    }, 1000);
    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
    };
  }, [state, maxSeconds]);

  async function startRecording() {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream, { mimeType: "audio/webm" });
      chunksRef.current = [];
      recorder.ondataavailable = (ev) => {
        if (ev.data.size > 0) chunksRef.current.push(ev.data);
      };
      recorder.onstop = () => {
        const recorded = new Blob(chunksRef.current, { type: "audio/webm" });
        setBlob(recorded);
        setAudioUrl(URL.createObjectURL(recorded));
        stream.getTracks().forEach((t) => t.stop());
        setState("recorded");
      };
      mediaRecorderRef.current = recorder;
      setSeconds(0);
      setState("recording");
      recorder.start();
    } catch {
      setError(t.micAccessDenied);
      setState("error");
    }
  }

  async function stopRecording() {
    if (timerRef.current) window.clearInterval(timerRef.current);
    mediaRecorderRef.current?.stop();
  }

  function reset() {
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    setAudioUrl(null);
    setBlob(null);
    setSeconds(0);
    setError(null);
    setState("idle");
  }

  async function transcribeRecording() {
    if (!blob) return;
    setState("transcribing");
    setError(null);

    try {
      const form = new FormData();
      form.append("audio", blob, "answer.webm");
      const res = await fetch("/api/voice/transcribe", { method: "POST", body: form });
      const body = (await res.json()) as { text?: string; error?: string };

      if (!res.ok || !body.text) {
        setError(body.error ?? t.transcribeFailed);
        setState("error");
        return;
      }

      onTranscribed(body.text);
      setState("done");
      // Auto-reset so the recorder is ready for re-recording if needed
      window.setTimeout(reset, 1500);
    } catch {
      setError(t.transcribeFailed);
      setState("error");
    }
  }

  const isBusy = state === "transcribing";
  const nearLimit = seconds > maxSeconds - 30;

  return (
    <div className="rounded-md border border-border bg-muted/20 p-3">
      <p className="mb-3 text-xs font-medium text-muted-foreground">{t.recordAnswer}</p>

      <div className="flex items-center gap-3">
        {/* Mic / Stop button */}
        <button
          type="button"
          disabled={disabled || isBusy || state === "done"}
          onClick={state === "recording" ? stopRecording : startRecording}
          aria-label={state === "recording" ? "Stop recording" : "Start recording"}
          className={cn(
            "flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-white transition-colors",
            state === "recording"
              ? "bg-red-600 hover:bg-red-700"
              : "bg-emerald-600 hover:bg-emerald-700",
            (disabled || isBusy || state === "done") && "cursor-not-allowed opacity-40"
          )}
        >
          {state === "recording" ? (
            <Square className="h-5 w-5" />
          ) : (
            <Mic className="h-5 w-5" />
          )}
        </button>

        {/* Timer + waveform */}
        <div className="min-w-0 flex-1">
          <div className={cn("font-mono text-lg font-semibold", nearLimit && state === "recording" && "text-red-600")}>
            {formatTime(seconds)}
          </div>
          <div className="mt-1 flex h-5 items-end gap-0.5">
            {Array.from({ length: 20 }).map((_, i) => (
              <span
                key={i}
                className={cn(
                  "w-1 rounded-full bg-emerald-500/50",
                  state === "recording" && "animate-pulse"
                )}
                style={{ height: `${4 + ((i * 5) % 14)}px` }}
              />
            ))}
          </div>
        </div>

        {/* Transcribing spinner */}
        {isBusy ? (
          <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            {t.transcribingAnswer}
          </span>
        ) : null}
      </div>

      {/* Playback + action buttons — shown after recording stops */}
      {audioUrl && (state === "recorded" || state === "error") ? (
        <div className="mt-3 space-y-2">
          <audio controls src={audioUrl} className="w-full h-8" />
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void transcribeRecording()}
              disabled={isBusy}
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-50"
            >
              <Check className="h-3.5 w-3.5" />
              {t.useThisRecording}
            </button>
            <button
              type="button"
              onClick={reset}
              className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              {t.recordAgain}
            </button>
          </div>
        </div>
      ) : null}

      {state === "done" ? (
        <p className="mt-2 text-xs font-medium text-emerald-700 dark:text-emerald-400">
          ✓ {t.transcriptReady}
        </p>
      ) : null}

      {error ? (
        <p className="mt-2 text-xs font-medium text-red-700 dark:text-red-400">{error}</p>
      ) : null}
    </div>
  );
}
