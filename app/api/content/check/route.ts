import { NextRequest, NextResponse } from "next/server";
import { getAccountFromSession } from "@/lib/auth/session";
import { scopedDb } from "@/lib/db/scoped";
import { checkContentSchema } from "@/lib/validators/content";
import { computeSimilarity, isModifiedEnough } from "@/lib/compliance/modification";
import { runComplianceFilter } from "@/lib/compliance/filter";

export async function POST(request: NextRequest) {
  try {
    const account = await getAccountFromSession();
    if (!account) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const parsed = checkContentSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

    const userDb = scopedDb(account.id);
    const draft = await userDb.content.getDraft(parsed.data.draftId);
    if (!draft) return NextResponse.json({ error: "Draft not found" }, { status: 404 });

    const modificationScore = computeSimilarity(draft.generatedDraft, parsed.data.userDraft);
    await userDb.content.updateDraft(draft.id, {
      userDraft: parsed.data.userDraft,
      modificationScore,
      complianceStatus: "checking",
    });

    const result = await runComplianceFilter(parsed.data.userDraft, account.id, draft.id);
    for (const layer of result.checkedLayers) {
      await userDb.content.logCompliance({
        draftId: draft.id,
        layer: layer.layer,
        result: layer.result,
        flagCodes: layer.flagCodes.length ? JSON.stringify(layer.flagCodes) : null,
        details: layer.details,
      });
    }

    const complianceStatus = result.passed ? "passed" : "flagged";
    await userDb.content.updateDraft(draft.id, {
      complianceStatus,
      complianceFlags: JSON.stringify(result.flags),
    });

    const modifiedEnough = isModifiedEnough(draft.generatedDraft, parsed.data.userDraft);
    return NextResponse.json({
      data: {
        complianceStatus,
        flags: result.flags,
        modificationScore,
        modifiedEnough,
        canExport: result.passed && modifiedEnough,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Compliance check failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
