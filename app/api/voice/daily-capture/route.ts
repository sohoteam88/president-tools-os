import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAccountFromSession } from "@/lib/auth/session";
import { saveDailyCapture } from "@/lib/voice/daily-capture";

const DailyCaptureSchema = z.object({
  text: z.string().min(10).max(2000),
});

export async function POST(req: NextRequest) {
  const account = await getAccountFromSession();
  if (!account) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = DailyCaptureSchema.safeParse(await req.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: body.error.flatten() }, { status: 422 });

  const result = await saveDailyCapture(account.id, body.data.text);
  return NextResponse.json(result, { status: 201 });
}
