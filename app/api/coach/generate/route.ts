import { NextResponse } from "next/server";
import { getAccountFromSession } from "@/lib/auth/session";
import { getMytDateString } from "@/lib/coach/date";
import { generateAndInsertTasks, listCoachTasksWithContacts } from "@/lib/coach/tasks";

export async function POST() {
  const account = await getAccountFromSession();
  if (!account) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const today = getMytDateString();
  const result = await generateAndInsertTasks(account.id, today);
  if (result.alreadyGenerated) {
    return NextResponse.json({
      alreadyGenerated: true,
      tasks: await listCoachTasksWithContacts(account.id, today),
    });
  }
  return NextResponse.json({
    generated: true,
    tasks: await listCoachTasksWithContacts(account.id, today),
  });
}
