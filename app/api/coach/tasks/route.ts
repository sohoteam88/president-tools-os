import { NextRequest, NextResponse } from "next/server";
import { getAccountFromSession } from "@/lib/auth/session";
import { getMytDateString } from "@/lib/coach/date";
import { generateAndInsertTasks, listCoachTasksWithContacts } from "@/lib/coach/tasks";
import { scopedDb } from "@/lib/db/scoped";
import { CreateManualTaskSchema } from "@/lib/validators/coach";

function parseDate(value: string | null): string {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : getMytDateString();
}

export async function GET(request: NextRequest) {
  const account = await getAccountFromSession();
  if (!account) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const targetDate = parseDate(request.nextUrl.searchParams.get("date"));
  const userDb = scopedDb(account.id);
  const existingTasks = await userDb.coach.listForDate(targetDate);
  const hasGeneration = await userDb.coach.hasGenerationForDate(targetDate);
  if (existingTasks.length === 0 && !hasGeneration) {
    await generateAndInsertTasks(account.id, targetDate);
  }

  const tasks = await listCoachTasksWithContacts(account.id, targetDate);
  const pendingCount = tasks.filter((task) => task.status === "pending").length;
  return NextResponse.json({ tasks, date: targetDate, pendingCount });
}

export async function POST(request: NextRequest) {
  const account = await getAccountFromSession();
  if (!account) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = CreateManualTaskSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid task" }, { status: 400 });

  const task = await scopedDb(account.id).coach.createTask({
    taskDate: parsed.data.taskDate ?? getMytDateString(),
    taskType: "manual",
    title: parsed.data.title,
    body: parsed.data.body || null,
    contactId: null,
    status: "pending",
    isAiGenerated: false,
  });
  if (!task) return NextResponse.json({ error: "Failed to create task" }, { status: 500 });
  return NextResponse.json({ task }, { status: 201 });
}
