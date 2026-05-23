"use client";

import { useMemo, useState } from "react";
import { CheckCircle, Copy, Loader2, ShieldCheck, Wand2 } from "lucide-react";
import type { ContentDraft } from "@/lib/db/schema/content";
import type { ComplianceFlag } from "@/lib/compliance/filter";
import { CONTENT_TYPES, type Platform } from "@/lib/content/prompt-builder";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/lib/i18n";
import { PlatformSelector } from "./platform-selector";
import { ContentTypeSelector } from "./content-type-selector";
import { ComplianceFlagList } from "./compliance-flag-list";
import { DraftList } from "./draft-list";

type StudioState = "idle" | "generating" | "generated" | "checking" | "checked" | "revising" | "exported";

export function ContentStudioClient({ initialDrafts }: { initialDrafts: ContentDraft[] }) {
  const { t } = useLanguage();
  const [state, setState] = useState<StudioState>("idle");
  const [platform, setPlatform] = useState<Platform>("facebook");
  const [contentType, setContentType] = useState(CONTENT_TYPES.facebook[0] ?? "lifestyle_story");
  const [userTopic, setUserTopic] = useState("");
  const [draftId, setDraftId] = useState<string | null>(null);
  const [generatedDraft, setGeneratedDraft] = useState("");
  const [userDraft, setUserDraft] = useState("");
  const [flags, setFlags] = useState<ComplianceFlag[]>([]);
  const [complianceStatus, setComplianceStatus] = useState<"pending" | "passed" | "flagged">("pending");
  const [modificationScore, setModificationScore] = useState<number | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [drafts, setDrafts] = useState(initialDrafts);

  const modifiedPct = Math.round((1 - (modificationScore ?? 1)) * 100);
  const modifiedEnough = (modificationScore ?? 1) <= 0.8;
  const canExport = complianceStatus === "passed" && modifiedEnough && !!draftId;
  const modificationLabel = useMemo(() => {
    if (modifiedPct <= 50) return t.notEnoughChanges;
    if (modifiedPct < 80) return t.gettingThere;
    return t.readyToCheck;
  }, [modifiedPct, t]);

  function changePlatform(next: Platform) {
    setPlatform(next);
    setContentType(CONTENT_TYPES[next][0] ?? "");
  }

  async function generate() {
    setState("generating");
    setMessage(null);
    setFlags([]);
    const response = await fetch("/api/content/generate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ platform, contentType, userTopic }),
    });
    const body = (await response.json()) as { data?: { draftId: string; generatedDraft: string }; error?: string };
    if (!response.ok || !body.data) {
      setMessage(body.error ?? "Generation failed");
      setState("idle");
      return;
    }
    setDraftId(body.data.draftId);
    setGeneratedDraft(body.data.generatedDraft);
    setUserDraft(body.data.generatedDraft);
    setComplianceStatus("pending");
    setModificationScore(1);
    setState("generated");
  }

  async function check() {
    if (!draftId) return;
    setState("checking");
    const response = await fetch("/api/content/check", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ draftId, userDraft }),
    });
    const body = (await response.json()) as {
      data?: {
        complianceStatus: "passed" | "flagged";
        flags: ComplianceFlag[];
        modificationScore: number;
      };
      error?: string;
    };
    if (!response.ok || !body.data) {
      setMessage(body.error ?? "Compliance check failed");
      setState("generated");
      return;
    }
    setComplianceStatus(body.data.complianceStatus);
    setFlags(body.data.flags);
    setModificationScore(body.data.modificationScore);
    setState("checked");
  }

  async function revise() {
    if (!draftId) return;
    setState("revising");
    setMessage(null);
    const response = await fetch("/api/content/revise", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ draftId, userDraft, flags }),
    });
    const body = (await response.json()) as { data?: { revisedContent: string }; error?: string };
    if (!response.ok || !body.data) {
      setMessage(body.error ?? "Revision failed");
      setState("checked");
      return;
    }
    setUserDraft(body.data.revisedContent);
    setComplianceStatus("pending");
    setFlags([]);
    setState("generated");
    setMessage(t.aiRevisedNotice);
  }

  async function exportDraft() {
    if (!draftId) return;
    const response = await fetch("/api/content/export", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ draftId }),
    });
    const body = (await response.json()) as { data?: { content: string }; error?: string };
    if (!response.ok || !body.data) {
      setMessage(body.error ?? "Export failed");
      return;
    }
    await navigator.clipboard.writeText(body.data.content);
    setState("exported");
    setMessage(t.copiedToClipboard + " ✓");
    window.setTimeout(() => setMessage(null), 3000);
  }

  function loadDraft(draft: ContentDraft) {
    setDraftId(draft.id);
    setPlatform(draft.platform as Platform);
    setContentType(draft.contentType);
    setUserTopic(draft.userTopic ?? "");
    setGeneratedDraft(draft.generatedDraft);
    setUserDraft(draft.userDraft ?? draft.generatedDraft);
    setComplianceStatus(draft.complianceStatus as "pending" | "passed" | "flagged");
    setModificationScore(draft.modificationScore);
    setFlags(draft.complianceFlags ? (JSON.parse(draft.complianceFlags) as ComplianceFlag[]) : []);
    setState("generated");
  }

  function deleteDraft(deletedId: string) {
    setDrafts((current) => current.filter((d) => d.id !== deletedId));
    void fetch(`/api/content/drafts/${deletedId}`, { method: "DELETE" });
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[300px_1fr]">
      <aside className="space-y-6">
        <section className="space-y-3">
          <h2 className="text-sm font-semibold">{t.platform}</h2>
          <PlatformSelector value={platform} onChange={changePlatform} />
        </section>

        <section className="space-y-3">
          <h2 className="text-sm font-semibold">{t.contentType}</h2>
          <ContentTypeSelector platform={platform} value={contentType} onChange={setContentType} />
        </section>

        <section className="space-y-3">
          <h2 className="text-sm font-semibold">{t.topic}</h2>
          <textarea
            value={userTopic}
            maxLength={200}
            onChange={(event) => setUserTopic(event.target.value)}
            className="min-h-24 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
          <p className="text-xs text-muted-foreground">{userTopic.length}/200</p>
        </section>

        <button
          type="button"
          onClick={generate}
          disabled={state === "generating"}
          className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          {state === "generating" ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {t.generateDraft}
        </button>

        <DraftList drafts={drafts} onLoad={loadDraft} onDelete={deleteDraft} />
      </aside>

      <main className="space-y-5">
        <section className="space-y-2">
          <h2 className="text-sm font-semibold">{t.generatedDraft}</h2>
          <div className="min-h-40 whitespace-pre-wrap rounded-md border border-border bg-muted/30 p-4 text-sm leading-6">
            {generatedDraft || t.generateDraftToBegin}
          </div>
        </section>

        <section className="space-y-2">
          <h2 className="text-sm font-semibold">{t.yourEdit}</h2>
          <textarea
            value={userDraft}
            onChange={(event) => {
              setUserDraft(event.target.value);
              setComplianceStatus("pending");
            }}
            className="min-h-56 w-full rounded-md border border-input bg-background px-4 py-3 text-sm leading-6"
          />
        </section>

        <section className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span>{t.modification}</span>
            <span>{modifiedPct}% {t.changed} · {modificationLabel}</span>
          </div>
          <div className="h-2 rounded-full bg-muted">
            <div
              className={cn(
                "h-2 rounded-full",
                modifiedPct <= 50 ? "bg-red-500" : modifiedPct < 80 ? "bg-amber-500" : "bg-emerald-500"
              )}
              style={{ width: `${Math.max(0, Math.min(100, modifiedPct))}%` }}
            />
          </div>
        </section>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={check}
            disabled={!draftId || state === "checking" || state === "revising"}
            className="inline-flex items-center gap-2 rounded-md border border-border px-4 py-2 text-sm font-medium disabled:opacity-50"
          >
            {state === "checking" ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
            {t.checkCompliance}
          </button>

          {complianceStatus === "flagged" && (
            <button
              type="button"
              onClick={revise}
              disabled={state === "revising" || state === "checking"}
              className="inline-flex items-center gap-2 rounded-md border border-amber-400 bg-amber-50 px-4 py-2 text-sm font-medium text-amber-800 hover:bg-amber-100 disabled:opacity-50 dark:border-amber-600 dark:bg-amber-950/30 dark:text-amber-300 dark:hover:bg-amber-950/50"
            >
              {state === "revising" ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {t.aiRevising}
                </>
              ) : (
                <>
                  <Wand2 className="h-4 w-4" />
                  {t.aiRevise}
                </>
              )}
            </button>
          )}

          <button
            type="button"
            onClick={exportDraft}
            disabled={!canExport}
            className="inline-flex items-center gap-2 rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white disabled:bg-muted disabled:text-muted-foreground"
          >
            {state === "exported" ? <CheckCircle className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            {t.exportCopy}
          </button>
        </div>

        <div className="text-sm">
          {t.compliance}:{" "}
          <span className={cn(complianceStatus === "passed" ? "text-emerald-700" : complianceStatus === "flagged" ? "text-red-700" : "text-muted-foreground")}>
            {complianceStatus}
          </span>
        </div>
        <ComplianceFlagList flags={flags} />
        {message ? (
          <p className={cn("text-sm font-medium", complianceStatus === "pending" && message === t.aiRevisedNotice ? "text-amber-700 dark:text-amber-400" : "text-muted-foreground")}>
            {message}
          </p>
        ) : null}
      </main>
    </div>
  );
}
