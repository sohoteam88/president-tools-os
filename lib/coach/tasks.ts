import { generateDailyTasks } from "@/lib/coach/generate";
import { scopedDb } from "@/lib/db/scoped";
import type { CoachTaskWithContact } from "@/lib/coach/types";
import type { DailyTask } from "@/lib/db/schema/coach";

export async function generateAndInsertTasks(accountId: string, targetDate: string): Promise<{
  tasks: DailyTask[];
  generated: boolean;
  alreadyGenerated: boolean;
}> {
  const userDb = scopedDb(accountId);
  const alreadyGenerated = await userDb.coach.hasGenerationForDate(targetDate);
  if (alreadyGenerated) {
    return {
      tasks: await userDb.coach.listForDate(targetDate),
      generated: false,
      alreadyGenerated: true,
    };
  }

  const { tasks, promptTokens, completionTokens } = await generateDailyTasks(accountId, targetDate);
  const inserted: DailyTask[] = [];
  for (const task of tasks.slice(0, 7)) {
    const created = await userDb.coach.createTask({
      taskDate: targetDate,
      taskType: task.taskType,
      title: task.title,
      body: task.body,
      contactId: task.contactId,
      status: "pending",
      isAiGenerated: true,
    });
    if (created) inserted.push(created);
  }

  await userDb.coach.recordGeneration({
    generatedForDate: targetDate,
    tasksSuggested: tasks.length,
    tasksInserted: inserted.length,
    promptTokens,
    completionTokens,
  });

  return { tasks: inserted, generated: true, alreadyGenerated: false };
}

export async function listCoachTasksWithContacts(accountId: string, targetDate: string): Promise<CoachTaskWithContact[]> {
  const userDb = scopedDb(accountId);
  const [dated, snoozed] = await Promise.all([
    userDb.coach.listForDate(targetDate),
    userDb.coach.listSnoozed(),
  ]);
  const seen = new Set<string>();
  const tasks = [...dated, ...snoozed].filter((task) => {
    if (seen.has(task.id)) return false;
    seen.add(task.id);
    return true;
  });

  return Promise.all(tasks.map(async (task) => ({
    ...task,
    contact: task.contactId ? await userDb.crm.get(task.contactId) ?? null : null,
  })));
}
