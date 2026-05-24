"use client";

import { useState } from "react";
import { toast } from "sonner";
import {
  MOMENT_TYPE_LABELS,
  WHY_STORY_QUESTIONS,
  type DraftMoment,
  type WhyStoryQuestionIndex,
} from "@/lib/voice/types";
import { useLanguage } from "@/lib/i18n";
import type { TranslationKeys } from "@/lib/translations";
import { QuestionRecorder } from "./question-recorder";

const MOMENT_TYPE_KEY_MAP: Record<string, keyof TranslationKeys> = {
  success_story: "momentSuccessStory",
  challenge_overcome: "momentChallengeOvercome",
  lifestyle_glimpse: "momentLifestyleGlimpse",
  product_experience: "momentProductExperience",
  mindset_shift: "momentMindsetShift",
};

type Step = "intro" | "recording" | "extracting" | "confirming" | "done";

export function WhyStorySession() {
  const { t } = useLanguage();
  const [step, setStep] = useState<Step>("intro");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [currentQuestion, setCurrentQuestion] = useState<WhyStoryQuestionIndex>(0);
  const [answers, setAnswers] = useState<string[]>(
    Array.from({ length: WHY_STORY_QUESTIONS.length }, () => "")
  );
  const [draftMoments, setDraftMoments] = useState<DraftMoment[]>([]);
  const [selectedIndices, setSelectedIndices] = useState<number[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  async function startSession() {
    setIsLoading(true);
    const response = await fetch("/api/voice/why-story", { method: "POST" });
    const body = (await response.json().catch(() => ({}))) as { sessionId?: string };
    setIsLoading(false);
    if (!response.ok || !body.sessionId) {
      toast.error(t.cannotStartSession);
      return;
    }
    setSessionId(body.sessionId);
    setCurrentQuestion(0);
    setAnswers(Array.from({ length: WHY_STORY_QUESTIONS.length }, () => ""));
    setStep("recording");
  }

  async function saveAnswer(nextQuestion?: WhyStoryQuestionIndex) {
    if (!sessionId) return;
    const transcript = answers[currentQuestion]?.trim();
    if (!transcript || transcript.length < 10) {
      toast.error(t.recordThisQuestion);
      return;
    }
    setIsLoading(true);
    const response = await fetch(`/api/voice/why-story/${sessionId}/answer`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        questionIndex: currentQuestion,
        audioKey: `text:${sessionId}:${currentQuestion}`,
        transcript,
      }),
    });
    setIsLoading(false);
    if (!response.ok) {
      toast.error(t.saveQuestionFailed);
      return;
    }
    if (typeof nextQuestion === "number") setCurrentQuestion(nextQuestion);
  }

  async function extractMoments() {
    if (!sessionId) return;
    await saveAnswer();
    setIsLoading(true);
    setStep("extracting");
    const response = await fetch(`/api/voice/why-story/${sessionId}/extract`, {
      method: "POST",
    });
    const body = (await response.json().catch(() => ({}))) as {
      draftMoments?: DraftMoment[];
    };
    setIsLoading(false);
    if (!response.ok || !body.draftMoments) {
      toast.error(t.extractionFailed);
      setStep("recording");
      return;
    }
    setDraftMoments(body.draftMoments);
    setSelectedIndices(body.draftMoments.map((m) => m.questionIndex));
    setStep("confirming");
  }

  async function confirmMoments() {
    if (!sessionId) return;
    setIsLoading(true);
    const response = await fetch(`/api/voice/why-story/${sessionId}/confirm`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirmedIndices: selectedIndices }),
    });
    setIsLoading(false);
    if (!response.ok) {
      toast.error(t.confirmationFailed);
      return;
    }
    toast.success(`${selectedIndices.length} ${t.saveMomentsSuffix}`);
    setStep("done");
  }

  /** Called by QuestionRecorder when Whisper returns a transcript. */
  function handleTranscribed(text: string) {
    setAnswers((prev) => {
      const next = [...prev];
      next[currentQuestion] = text;
      return next;
    });
  }

  // ─── Intro ───────────────────────────────────────────────────────────────────
  if (step === "intro") {
    return (
      <section className="rounded-md border border-border bg-card p-5">
        <h2 className="text-base font-semibold">{t.whyStoryTitle}</h2>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">{t.whyStoryIntro}</p>
        <ol className="mt-4 list-decimal space-y-2 pl-5 text-sm text-muted-foreground">
          {WHY_STORY_QUESTIONS.map((q) => (
            <li key={q}>{q}</li>
          ))}
        </ol>
        <button
          type="button"
          onClick={startSession}
          disabled={isLoading}
          className="mt-5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          {isLoading ? t.preparing : t.startSession}
        </button>
      </section>
    );
  }

  // ─── Confirming ───────────────────────────────────────────────────────────────
  if (step === "confirming") {
    return (
      <section className="rounded-md border border-border bg-card p-5">
        <h2 className="text-base font-semibold">{t.confirmMomentsTitle}</h2>
        <div className="mt-4 space-y-3">
          {draftMoments.map((moment) => {
            const typeKey = MOMENT_TYPE_KEY_MAP[moment.momentType];
            const typeLabel = typeKey
              ? t[typeKey]
              : MOMENT_TYPE_LABELS[moment.momentType];
            return (
              <label
                key={moment.questionIndex}
                className="flex items-start gap-3 rounded-md border border-border p-3"
              >
                <input
                  type="checkbox"
                  checked={selectedIndices.includes(moment.questionIndex)}
                  onChange={(e) => {
                    setSelectedIndices((cur) =>
                      e.target.checked
                        ? [...new Set([...cur, moment.questionIndex])]
                        : cur.filter((i) => i !== moment.questionIndex)
                    );
                  }}
                  className="mt-1"
                />
                <span className="space-y-1">
                  <span className="block text-xs text-muted-foreground">
                    {t.questionLabel} {moment.questionIndex + 1} · {typeLabel}
                  </span>
                  <span className="block text-sm">{moment.extracted}</span>
                </span>
              </label>
            );
          })}
        </div>
        <button
          type="button"
          onClick={confirmMoments}
          disabled={isLoading || selectedIndices.length === 0}
          className="mt-5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          {t.save} {selectedIndices.length} {t.saveMomentsSuffix}
        </button>
      </section>
    );
  }

  // ─── Done ─────────────────────────────────────────────────────────────────────
  if (step === "done") {
    return (
      <section className="rounded-md border border-border bg-card p-8 text-center">
        <h2 className="text-base font-semibold">{t.momentsSaved}</h2>
        <p className="mt-2 text-sm text-muted-foreground">{t.momentsUsedForSeeds}</p>
        <button
          type="button"
          onClick={() => setStep("intro")}
          className="mt-5 rounded-md border border-border px-4 py-2 text-sm font-medium"
        >
          {t.recordAgain}
        </button>
      </section>
    );
  }

  // ─── Extracting ───────────────────────────────────────────────────────────────
  if (step === "extracting") {
    return (
      <p className="rounded-md border border-border bg-card p-8 text-center text-sm text-muted-foreground">
        {t.aiAnalysing}
      </p>
    );
  }

  // ─── Q&A Recording step ───────────────────────────────────────────────────────
  return (
    <section className="rounded-md border border-border bg-card p-5">
      {/* Progress */}
      <p className="text-sm font-medium text-muted-foreground">
        {t.questionLabel} {currentQuestion + 1} / {WHY_STORY_QUESTIONS.length}
      </p>

      {/* Progress bar */}
      <div className="mt-2 h-1.5 rounded-full bg-muted">
        <div
          className="h-1.5 rounded-full bg-primary transition-all"
          style={{
            width: `${Math.round(((currentQuestion + 1) / WHY_STORY_QUESTIONS.length) * 100)}%`,
          }}
        />
      </div>

      {/* Current question */}
      <h2 className="mt-4 text-base font-semibold leading-6">
        {WHY_STORY_QUESTIONS[currentQuestion]}
      </h2>

      {/* Audio recorder — fires handleTranscribed which fills the textarea */}
      <div className="mt-4">
        <QuestionRecorder
          onTranscribed={handleTranscribed}
          maxSeconds={180}
          disabled={isLoading}
        />
      </div>

      {/* Editable transcript / text answer */}
      <textarea
        value={answers[currentQuestion]}
        onChange={(e) => {
          const next = [...answers];
          next[currentQuestion] = e.target.value;
          setAnswers(next);
        }}
        rows={5}
        className="mt-3 w-full rounded-md border border-input bg-background px-3 py-2 text-sm leading-6"
        placeholder={t.answerPlaceholder}
      />

      {/* Navigation */}
      <div className="mt-4 flex flex-wrap gap-2">
        {currentQuestion > 0 ? (
          <button
            type="button"
            onClick={() =>
              setCurrentQuestion((currentQuestion - 1) as WhyStoryQuestionIndex)
            }
            className="rounded-md border border-border px-4 py-2 text-sm font-medium"
          >
            {t.prevQuestion}
          </button>
        ) : null}

        {currentQuestion < WHY_STORY_QUESTIONS.length - 1 ? (
          <button
            type="button"
            onClick={() =>
              void saveAnswer((currentQuestion + 1) as WhyStoryQuestionIndex)
            }
            disabled={isLoading}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
          >
            {t.nextQuestion}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => void extractMoments()}
            disabled={isLoading}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
          >
            {t.finishExtract}
          </button>
        )}
      </div>
    </section>
  );
}
