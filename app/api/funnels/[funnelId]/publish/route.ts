import { NextRequest, NextResponse } from "next/server";
import { getAccountFromSession } from "@/lib/auth/session";
import { scopedDb } from "@/lib/db/scoped";
import { runComplianceFilter } from "@/lib/compliance/filter";
import { extractFunnelText, funnelContentSchema } from "@/lib/funnels/types";

export async function POST(_request: NextRequest, { params }: { params: { funnelId: string } }) {
  try {
    const account = await getAccountFromSession();
    if (!account) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!account.slug) return NextResponse.json({ error: "Set your account slug before publishing." }, { status: 400 });
    const userDb = scopedDb(account.id);
    const funnel = await userDb.funnels.get(params.funnelId);
    if (!funnel) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (funnel.funnelType === "free_resource") {
      const activation = await userDb.magnets.getActivation();
      if (!activation?.isActive) {
        return NextResponse.json(
          { error: "Activate your Lead Magnet before publishing a Free Resource funnel." },
          { status: 400 }
        );
      }
    }
    if (funnel.funnelType === "event_rsvp") {
      const activation = await userDb.webinars.getActivation();
      if (!activation?.isActive) {
        return NextResponse.json(
          { error: "Activate your Webinar before publishing an Event RSVP funnel." },
          { status: 400 }
        );
      }
    }
    const content = funnelContentSchema.parse(JSON.parse(funnel.contentJson) as unknown);
    const compliance = await runComplianceFilter(extractFunnelText(content), account.id, funnel.id);
    if (!compliance.passed) {
      await userDb.funnels.update(funnel.id, { complianceStatus: "flagged", complianceCheckedAt: new Date() });
      return NextResponse.json({ error: "Compliance failed", flags: compliance.flags }, { status: 422 });
    }
    await userDb.funnels.update(funnel.id, { complianceStatus: "passed", complianceCheckedAt: new Date() });
    return NextResponse.json({ data: { funnel: await userDb.funnels.publish(funnel.id) } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to publish funnel";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
