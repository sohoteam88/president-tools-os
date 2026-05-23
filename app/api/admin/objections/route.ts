import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/session";
import { adminDb } from "@/lib/db/scoped";
import { checkResponseCompliance } from "@/lib/objections/check";
import { OBJECTION_CATEGORIES, type ObjectionCategory } from "@/lib/objections/types";
import { ResponseSchema } from "@/lib/validators/objections";

function parseCategory(value: string | null): ObjectionCategory | undefined {
  return OBJECTION_CATEGORIES.find((category) => category === value);
}

export async function GET(request: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const responses = await adminDb.objections.listAll({
    category: parseCategory(request.nextUrl.searchParams.get("category")),
    status: request.nextUrl.searchParams.get("status") ?? undefined,
  });
  const countByStatus = responses.reduce<Record<string, number>>((acc, response) => {
    acc[response.complianceStatus] = (acc[response.complianceStatus] ?? 0) + 1;
    return acc;
  }, {});
  return NextResponse.json({ responses, countByStatus });
}

export async function POST(request: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = ResponseSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid response" }, { status: 400 });
  const compliance = await checkResponseCompliance(parsed.data.responseText, parsed.data.title);
  const response = await adminDb.objections.create({
    category: parsed.data.category,
    title: parsed.data.title,
    responseText: parsed.data.responseText,
    tone: parsed.data.tone,
    sortOrder: parsed.data.sortOrder ?? 0,
    complianceStatus: compliance.passed ? "passed" : "flagged",
    complianceFlags: compliance.flags.length > 0 ? JSON.stringify(compliance.flags) : null,
    isPublished: false,
    createdBy: admin.userId,
  });
  return NextResponse.json({ response, compliance }, { status: 201 });
}
