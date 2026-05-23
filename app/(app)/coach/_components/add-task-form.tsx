"use client";

import { useState } from "react";
import type { CoachTaskWithContact } from "@/lib/coach/types";
import { useLanguage } from "@/lib/i18n";

export function AddTaskForm({ onAdd }: { onAdd: (task: CoachTaskWithContact) => void }) {
  const { t } = useLanguage();
  const [title, setTitle] = useState("");
  const [error, setError] = useState("");

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const response = await fetch("/api/coach/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    });
    if (!response.ok) {
      setError(t.couldNotAddTask);
      return;
    }
    const body = (await response.json()) as { task: CoachTaskWithContact };
    onAdd(body.task);
    setTitle("");
  }

  return (
    <form onSubmit={(event) => void submit(event)} className="flex flex-wrap gap-2">
      <input
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        placeholder={t.addCustomTask}
        className="min-w-72 flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm"
      />
      <button type="submit" className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">
        {t.add}
      </button>
      {error ? <p className="basis-full text-sm text-destructive">{error}</p> : null}
    </form>
  );
}
