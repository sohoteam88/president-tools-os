import { NextRequest, NextResponse } from "next/server";
import { getAccountFromSession } from "@/lib/auth/session";
import { scopedDb } from "@/lib/db/scoped";
import { runComplianceFilter } from "@/lib/compliance/filter";
import { extractFunnelText, funnelContentSchema } from "@/lib/funnels/types";
import { funnelUpdateSchema } from "@/lib/validators/funnels";

export async function GET(_request: NextRequest, { params }: { params: { funnelId: string } }) {
  const account = await getAccountFromSession();
  if (!account) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const funnel = await scopedDb(account.id).funnels.get(params.funnelId);
  return funnel ? NextResponse.json({ data: { funnel } }) : NextResponse.json({ error: "Not found" }, { status: 404 });
}

export async function PUT(request: NextRequest, { params }: { params: { funnelId: string } }) {
  try {
    const account = await getAccountFromSession();
    if (!account) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const userDb = scopedDb(account.id);
    const funnel = await userDb.funnels.get(params.funnelId);
    if (!funnel) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const parsed = funnelUpdateSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "Invalid funnel" }, { status: 400 });
    if (funnel.publishedAt && parsed.data.pathSlug !== undefined && parsed.data.pathSlug !== funnel.pathSlug) {
      return NextResponse.json({ error: "Path slug cannot change after publishing" }, { status: 409 });
    }

    let complianceStatus = funnel.complianceStatus;
    let complianceCheckedAt = funnel.complianceCheckedAt;
    if (parsed.data.contentJson) {
      const compliance = await runComplianceFilter(extractFunnelText(parsed.data.contentJson), account.id, funnel.id);
      if (!compliance.passed && funnel.status === "published") {
        return NextResponse.json({ error: "Compliance failed", flags: compliance.flags }, { status: 422 });
      }
      complianceStatus = compliance.passed ? "passed" : "flagged";
      complianceCheckedAt = new Date();
    }

    const updated = await userDb.funnels.update(funnel.id, {
      title: parsed.data.title,
      funnelType: parsed.data.funnelType,
      pathSlug: parsed.data.pathSlug,
      contentJson: parsed.data.contentJson ? JSON.stringify(parsed.data.contentJson) : undefined,
      ctaType: parsed.data.ctaType,
      ctaValue: parsed.data.ctaValue,
      whatsappPreFill: parsed.data.whatsappPreFill,
      complianceStatus,
      complianceCheckedAt,
    });
    return NextResponse.json({ data: { funnel: updated } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update funnel";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: { funnelId: string } }) {
  try {
    const account = await getAccountFromSession();
    if (!account) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    await scopedDb(account.id).funnels.delete(params.funnelId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to delete funnel";
    return NextResponse.json({ error: message }, { status: message.includes("Unpublish") ? 409 : 500 });
  }
}
