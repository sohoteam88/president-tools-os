import { NextRequest, NextResponse } from "next/server";
import { getAccountFromSession } from "@/lib/auth/session";
import { scopedDb, adminDb } from "@/lib/db/scoped";
import { CATEGORY_LABELS } from "@/lib/objections/types";
import { UseAsContentSchema } from "@/lib/validators/objections";

type Params = { params: { responseId: string } };

export async function POST(request: NextRequest, { params }: Params) {
  const account = await getAccountFromSession();
  if (!account) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = UseAsContentSchema.safeParse({ ...(await request.json().catch(() => ({}))), responseId: params.responseId });
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const userDb = scopedDb(account.id);
  const response = parsed.data.responseType === "master"
    ? await adminDb.objections.get(parsed.data.responseId)
    : (await userDb.objections.listPersonal()).find((item) => item.id === parsed.data.responseId);
  if (!response) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const seed = `Objection handled: ${CATEGORY_LABELS[response.category]}\nMy response approach: ${response.tone}\n---\n${response.responseText}`;
  const draft = await userDb.content.createDraft({
    platform: "facebook",
    contentType: "objection_response",
    userTopic: seed,
    generatedDraft: seed,
    complianceStatus: "pending",
  });
  if (!draft) return NextResponse.json({ error: "Failed to create draft" }, { status: 500 });
  return NextResponse.json({ draftId: draft.id });
}
