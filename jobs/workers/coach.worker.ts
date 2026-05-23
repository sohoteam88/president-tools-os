import { getMytDateString } from "@/lib/coach/date";
import { generateAndInsertTasks } from "@/lib/coach/tasks";
import { adminDb } from "@/lib/db/scoped";

export async function runCoachWorker(): Promise<void> {
  const todayMyt = getMytDateString();
  const accounts = await adminDb.accounts.listActive();

  for (const account of accounts) {
    try {
      await generateAndInsertTasks(account.id, todayMyt);
    } catch (error) {
      console.error(`[coach-worker] Failed for account ${account.id}:`, error);
    }
  }
}

if (process.argv[1]?.endsWith("coach.worker.ts")) {
  void process.argv;
}
