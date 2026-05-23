import { NextRequest, NextResponse } from "next/server";
import { getAccountFromSession } from "@/lib/auth/session";
import { scopedDb } from "@/lib/db/scoped";
import { UpdateTaskStatusSchema } from "@/lib/validators/coach";

type Params = { params: { taskId: string } };

export async function PATCH(request: NextRequest, { params }: Params) {
  const account = await getAccountFromSession();
  if (!account) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = UpdateTaskStatusSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid status" }, { status: 400 });

  const task = await scopedDb(account.id).coach.updateStatus(params.taskId, parsed.data.status, {
    snoozedTo: parsed.data.snoozedTo,
    completedAt: parsed.data.status === "done" ? new Date() : undefined,
  });
  if (!task) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ task });
}
