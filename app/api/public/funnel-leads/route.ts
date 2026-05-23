import { NextRequest, NextResponse } from "next/server";
import { scopedDb, adminDb } from "@/lib/db/scoped";
import { getPublicFunnel, submitPublicLead } from "@/lib/funnels/public";
import { buildWaLink, isValidMalaysianNumber, normaliseWhatsAppNumber } from "@/lib/funnels/whatsapp";
import { publicLeadSchema } from "@/lib/validators/funnels";
import { PDPA_CONSENT_TEXT } from "@/lib/pdpa/consent";

export async function POST(request: NextRequest) {
  try {
    const parsed = publicLeadSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    const data = await getPublicFunnel(parsed.data.accountSlug, parsed.data.pathSlug);
    if (!data || data.funnel.id !== parsed.data.funnelId) return NextResponse.json({ error: "Funnel not found" }, { status: 404 });

    const ipAddress = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
    const userDb = scopedDb(data.funnel.accountId);
    if ((await userDb.funnels.countLeadsLastHourByIp(data.funnel.id, ipAddress)) >= 5) {
      return NextResponse.json({ error: "You've already submitted recently. We'll be in touch!" }, { status: 429 });
    }
    if ((await userDb.funnels.countLeadsToday(data.funnel.id)) >= 200) {
      return NextResponse.json({ error: "Submission limit reached" }, { status: 429 });
    }

    const whatsappNumber = normaliseWhatsAppNumber(parsed.data.whatsappNumber);
    if (!isValidMalaysianNumber(whatsappNumber)) console.warn("[funnel-leads] non-Malaysian number submitted");
    const lead = await submitPublicLead({
      funnelId: data.funnel.id,
      accountId: data.funnel.accountId,
      name: parsed.data.name,
      whatsappNumber,
      email: parsed.data.email,
      pdpaConsent: true,
      consentText: PDPA_CONSENT_TEXT,
      ipAddress,
      userAgent: request.headers.get("user-agent") ?? "",
    });
    if (lead) {
      await adminDb.audit.log({
        accountId: data.funnel.accountId,
        actorUserId: null,
        action: "public.funnel_lead.submitted",
        resourceType: "funnel_lead",
        resourceId: lead.id,
        metadata: JSON.stringify({ funnelId: data.funnel.id, source: "public_form" }),
      });
    }

    if (data.funnel.funnelType === "free_resource") {
      return NextResponse.json({ ok: true, cta: { action: "redirect", url: `/magnet/${data.accountSlug}` } });
    }
    if (data.funnel.funnelType === "event_rsvp") {
      return NextResponse.json({ ok: true, cta: { action: "redirect", url: `/webinar/${data.accountSlug}` } });
    }
    if (data.funnel.ctaType === "whatsapp") {
      return NextResponse.json({ ok: true, cta: { action: "redirect", url: buildWaLink(data.funnel.ctaValue ?? "", data.funnel.whatsappPreFill ?? undefined) } });
    }
    if (data.funnel.ctaType === "custom_url") {
      return NextResponse.json({ ok: true, cta: { action: "redirect", url: data.funnel.ctaValue } });
    }
    return NextResponse.json({ ok: true, cta: { action: "message", message: data.funnel.ctaValue ?? "Thank you. I will be in touch soon." } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Submission failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
