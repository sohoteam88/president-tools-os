import { NextRequest, NextResponse } from "next/server";
import { getAccountFromSession } from "@/lib/auth/session";
import { scopedDb } from "@/lib/db/scoped";
import { exportContentSchema } from "@/lib/validators/content";
import { MODIFICATION_THRESHOLD } from "@/lib/compliance/modification";

export async function POST(request: NextRequest) {
  try {
    const account = await getAccountFromSession();
    if (!account) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const parsed = exportContentSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

    const userDb = scopedDb(account.id);
    const draft = await userDb.content.getDraft(parsed.data.draftId);
    if (!draft) return NextResponse.json({ error: "Draft not found" }, { status: 404 });

    if (draft.complianceStatus !== "passed") {
      return NextResponse.json(
        { error: "Content must pass compliance check before export." },
        { status: 403 }
      );
    }
    if (draft.modificationScore === null || draft.modificationScore > MODIFICATION_THRESHOLD) {
      return NextResponse.json(
        { error: "Please modify the AI draft more before exporting. Add your personal touch." },
        { status: 403 }
      );
    }
    if (!draft.userDraft) {
      return NextResponse.json({ error: "Draft has no edited content to export." }, { status: 403 });
    }

    const exportedAt = new Date();
    await userDb.content.updateDraft(draft.id, { exportedAt });
    await userDb.audit.log({
      actorUserId: account.userId,
      action: "content.exported",
      resourceType: "content_draft",
      resourceId: draft.id,
    });

    return NextResponse.json({ data: { content: draft.userDraft, exportedAt } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Export failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
