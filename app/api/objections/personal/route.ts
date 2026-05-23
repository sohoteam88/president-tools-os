import { NextRequest, NextResponse } from "next/server";
import { getAccountFromSession } from "@/lib/auth/session";
import { scopedDb } from "@/lib/db/scoped";
import { checkResponseCompliance } from "@/lib/objections/check";
import { OBJECTION_CATEGORIES, type ObjectionCategory } from "@/lib/objections/types";
import { ResponseSchema } from "@/lib/validators/objections";

function parseCategory(value: string | null): ObjectionCategory | undefined {
  return OBJECTION_CATEGORIES.find((category) => category === value);
}

export async function GET(request: NextRequest) {
  const account = await getAccountFromSession();
  if (!account) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const responses = await scopedDb(account.id).objections.listPersonal(parseCategory(request.nextUrl.searchParams.get("category")));
  return NextResponse.json({ responses });
}

export async function POST(request: NextRequest) {
  const account = await getAccountFromSession();
  if (!account) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = ResponseSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid response" }, { status: 400 });
  const compliance = await checkResponseCompliance(parsed.data.responseText, parsed.data.title);
  const response = await scopedDb(account.id).objections.createPersonal({
    category: parsed.data.category,
    title: parsed.data.title,
    responseText: parsed.data.responseText,
    tone: parsed.data.tone,
    complianceStatus: compliance.passed ? "passed" : "flagged",
    complianceFlags: compliance.flags.length > 0 ? JSON.stringify(compliance.flags) : null,
  });
  return NextResponse.json({ response, compliance }, { status: 201 });
}
