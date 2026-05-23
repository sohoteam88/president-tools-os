"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { buildWaLink } from "@/lib/funnels/whatsapp";
import type { CoachTaskWithContact } from "@/lib/coach/types";
import { useLanguage } from "@/lib/i18n";

export function limitDashboardTasks(tasks: CoachTaskWithContact[]): CoachTaskWithContact[] {
  return tasks.filter((task) => task.status === "pending").slice(0, 3);
}

export function TaskWidget() {
  const [tasks, setTasks] = useState<CoachTaskWithContact[]>([]);
  const [pendingCount, setPendingCount] = useState(0);
  const { t } = useLanguage();

  useEffect(() => {
    let alive = true;
    fetch("/api/coach/tasks")
      .then((response) => response.json())
      .then((body: { tasks?: CoachTaskWithContact[]; pendingCount?: number }) => {
        if (!alive) return;
        setTasks(body.tasks ?? []);
        setPendingCount(body.pendingCount ?? 0);
      })
      .catch(() => {
        if (alive) setTasks([]);
      });
    return () => { alive = false; };
  }, []);

  async function complete(task: CoachTaskWithContact) {
    setTasks((current) => current.map((item) => item.id === task.id ? { ...item, status: "done" } : item));
    await fetch(`/api/coach/tasks/${task.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "done" }),
    });
  }

  function openWhatsApp(task: CoachTaskWithContact) {
    if (!task.contact) return;
    window.open(buildWaLink(task.contact.whatsappNumber, `Hi ${task.contact.name}, `), "_blank", "noopener,noreferrer");
    void complete(task);
  }

  const visible = limitDashboardTasks(tasks);

  return (
    <section className="rounded-lg border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border px-5 py-4">
        <h2 className="text-sm font-semibold">{t.todaysFocus}</h2>
        <span className="text-xs text-muted-foreground">{pendingCount} {t.pending}</span>
      </div>
      <div className="space-y-3 p-5">
        {visible.map((task) => (
          <div key={task.id} className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-medium">{task.title}</p>
              {task.body ? <p className="line-clamp-2 text-xs text-muted-foreground">{task.body}</p> : null}
            </div>
            {task.contact ? (
              <button type="button" onClick={() => openWhatsApp(task)} className="rounded-md bg-green-600 px-2.5 py-1.5 text-xs font-medium text-white">
                WhatsApp
              </button>
            ) : (
              <button type="button" onClick={() => void complete(task)} className="rounded-md border border-border px-2.5 py-1.5 text-xs">
                {t.done}
              </button>
            )}
          </div>
        ))}
        {visible.length === 0 ? <p className="text-sm text-muted-foreground">{t.noPendingFocusTasks}</p> : null}
      </div>
      <div className="border-t border-border px-5 py-3">
        <Link href="/coach" className="text-sm font-medium text-primary">{t.viewAllTasks} →</Link>
      </div>
    </section>
  );
}
