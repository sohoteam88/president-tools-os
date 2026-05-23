"use client";

import Link from "next/link";
import { buildWaLink } from "@/lib/funnels/whatsapp";
import { getMytTomorrowString } from "@/lib/coach/date";
import type { CoachTaskWithContact, TaskStatus } from "@/lib/coach/types";
import { useLanguage } from "@/lib/i18n";

export function TaskCard({
  task,
  onStatus,
}: {
  task: CoachTaskWithContact;
  onStatus: (taskId: string, status: TaskStatus, snoozedTo?: string) => void;
}) {
  const { t } = useLanguage();

  function patch(status: TaskStatus, snoozedTo?: string) {
    onStatus(task.id, status, snoozedTo);
  }

  function openWhatsApp() {
    if (!task.contact) return;
    window.open(buildWaLink(task.contact.whatsappNumber, `Hi ${task.contact.name}, `), "_blank", "noopener,noreferrer");
    patch("done");
  }

  const lastContactedDate = task.contact?.lastContactedAt
    ? new Date(task.contact.lastContactedAt).toLocaleDateString("en-MY")
    : t.never;

  return (
    <article className="rounded-md border border-border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <h3 className="text-sm font-semibold">{task.title}</h3>
          {task.contact ? (
            <p className="text-xs text-muted-foreground">
              {task.contact.stage} {t.stageLabel} · {t.lastContact} {lastContactedDate}
            </p>
          ) : null}
          {task.body ? <p className="text-sm text-muted-foreground">{task.body}</p> : null}
        </div>
        {task.contact ? (
          <button type="button" onClick={openWhatsApp} className="rounded-md bg-green-600 px-3 py-2 text-xs font-medium text-white">
            WhatsApp ✓
          </button>
        ) : null}
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        {task.taskType === "record_voice" ? <Link href="/voice" className="rounded-md border border-border px-3 py-2 text-xs">{t.goToVoiceCapture}</Link> : null}
        {task.taskType === "share_content" ? <Link href="/content" className="rounded-md border border-border px-3 py-2 text-xs">{t.goToContentStudio}</Link> : null}
        <button type="button" onClick={() => patch("done")} className="rounded-md bg-primary px-3 py-2 text-xs font-medium text-primary-foreground">{t.done}</button>
        <button type="button" onClick={() => patch("snoozed", getMytTomorrowString())} className="rounded-md border border-border px-3 py-2 text-xs">{t.snoozeToTomorrow}</button>
        <button type="button" onClick={() => patch("dismissed")} className="rounded-md border border-border px-3 py-2 text-xs text-muted-foreground">{t.dismiss}</button>
      </div>
    </article>
  );
}
