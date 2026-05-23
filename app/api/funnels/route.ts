import { NextRequest, NextResponse } from "next/server";
import { getAccountFromSession } from "@/lib/auth/session";
import { scopedDb } from "@/lib/db/scoped";
import { runComplianceFilter } from "@/lib/compliance/filter";
import { extractFunnelText } from "@/lib/funnels/types";
import { normaliseWhatsAppNumber, isValidMalaysianNumber } from "@/lib/funnels/whatsapp";
import { funnelUpsertSchema } from "@/lib/validators/funnels";

export async function GET() {
  const account = await getAccountFromSession();
  if (!account) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ data: { funnels: await scopedDb(account.id).funnels.list() } });
}

export async function POST(request: NextRequest) {
  try {
    const account = await getAccountFromSession();
    if (!account) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const parsed = funnelUpsertSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "Invalid funnel" }, { status: 400 });

    const userDb = scopedDb(account.id);
    if (await userDb.funnels.getByPathSlug(parsed.data.pathSlug)) {
      return NextResponse.json({ error: "Path slug already exists" }, { status: 409 });
    }
    if (parsed.data.ctaType === "whatsapp") {
      const phone = normaliseWhatsAppNumber(parsed.data.ctaValue ?? "");
      if (!isValidMalaysianNumber(phone)) return NextResponse.json({ error: "Invalid WhatsApp number" }, { status: 400 });
    }
    if (parsed.data.ctaType === "custom_url" && parsed.data.ctaValue && !parsed.data.ctaValue.startsWith("https://")) {
      return NextResponse.json({ error: "Custom URL must start with https://" }, { status: 400 });
    }

    const compliance = await runComplianceFilter(extractFunnelText(parsed.data.contentJson), account.id, "new-funnel");
    if (!compliance.passed) return NextResponse.json({ error: "Compliance failed", flags: compliance.flags }, { status: 422 });

    const funnel = await userDb.funnels.create({
      title: parsed.data.title,
      funnelType: parsed.data.funnelType,
      pathSlug: parsed.data.pathSlug,
      contentJson: JSON.stringify(parsed.data.contentJson),
      ctaType: parsed.data.ctaType,
      ctaValue: parsed.data.ctaType === "whatsapp" ? normaliseWhatsAppNumber(parsed.data.ctaValue ?? "") : parsed.data.ctaValue,
      whatsappPreFill: parsed.data.whatsappPreFill,
      complianceStatus: "passed",
      complianceCheckedAt: new Date(),
    });
    return NextResponse.json({ data: { funnel } }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create funnel";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
