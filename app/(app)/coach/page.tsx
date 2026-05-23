"use client";

import { useEffect, useMemo, useState } from "react";
import type { CoachTaskWithContact, TaskStatus } from "@/lib/coach/types";
import { getMytDateString } from "@/lib/coach/date";
import { useLanguage } from "@/lib/i18n";
import { TaskCard } from "./_components/task-card";
import { AddTaskForm } from "./_components/add-task-form";

export default function CoachPage() {
  const { t } = useLanguage();
  const [tasks, setTasks] = useState<CoachTaskWithContact[]>([]);
  const [date, setDate] = useState(getMytDateString());
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/coach/tasks")
      .then((response) => response.json())
      .then((body: { tasks?: CoachTaskWithContact[]; date?: string }) => {
        setTasks(body.tasks ?? []);
        setDate(body.date ?? getMytDateString());
      })
      .catch(() => setError(t.couldNotLoadTasks));
  }, []);

  const pending = useMemo(() => tasks.filter((task) => task.status === "pending"), [tasks]);
  const completed = useMemo(() => tasks.filter((task) => task.status === "done"), [tasks]);
  const followUps = pending.filter((task) => task.taskType === "follow_up_contact");
  const otherTasks = pending.filter((task) => task.taskType !== "follow_up_contact");

  async function updateStatus(taskId: string, status: TaskStatus, snoozedTo?: string) {
    const previous = tasks;
    setTasks((current) => current.map((task) => task.id === taskId ? { ...task, status, snoozedTo: snoozedTo ?? null } : task));
    const response = await fetch(`/api/coach/tasks/${taskId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status, snoozedTo }),
    });
    if (!response.ok) {
      setTasks(previous);
      setError(t.couldNotUpdateTask);
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-8 p-6">
      <div>
        <h1 className="text-2xl font-semibold">{t.todaysFocus}</h1>
        <p className="text-sm text-muted-foreground">{date} · {pending.length} {t.of} {tasks.length} {t.tasksRemaining}</p>
      </div>
      {error ? <p className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{error}</p> : null}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold">{t.followUpTasks}</h2>
        {followUps.map((task) => <TaskCard key={task.id} task={task} onStatus={(id, status, snoozedTo) => void updateStatus(id, status, snoozedTo)} />)}
        {followUps.length === 0 ? <p className="text-sm text-muted-foreground">{t.noFollowUpTasks}</p> : null}
      </section>
      <section className="space-y-3">
        <h2 className="text-sm font-semibold">{t.otherTasks}</h2>
        {otherTasks.map((task) => <TaskCard key={task.id} task={task} onStatus={(id, status, snoozedTo) => void updateStatus(id, status, snoozedTo)} />)}
        {otherTasks.length === 0 ? <p className="text-sm text-muted-foreground">{t.noOtherTasks}</p> : null}
      </section>
      <section className="space-y-3">
        <h2 className="text-sm font-semibold">{t.completed}</h2>
        {completed.map((task) => (
          <div key={task.id} className="rounded-md border border-border bg-muted/40 p-3 text-sm">
            ✓ {task.title}
          </div>
        ))}
        {completed.length === 0 ? <p className="text-sm text-muted-foreground">{t.nothingCompletedToday}</p> : null}
      </section>
      <section className="space-y-3">
        <h2 className="text-sm font-semibold">{t.addATask}</h2>
        <AddTaskForm onAdd={(task) => setTasks((current) => [...current, task])} />
      </section>
    </div>
  );
}
