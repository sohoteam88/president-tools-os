import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/db/scoped";
import { getPublicWebinar, countRegistrationsLastHourByIp, registerForWebinar } from "@/lib/webinars/public";
import { normaliseWhatsAppNumber } from "@/lib/funnels/whatsapp";
import { WebinarRegistrationSchema } from "@/lib/validators/webinars";
import { PDPA_CONSENT_TEXT } from "@/lib/pdpa/consent";

export async function POST(request: NextRequest) {
  const parsed = WebinarRegistrationSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const webinar = await getPublicWebinar(parsed.data.accountSlug);
  if (!webinar || webinar.accountWebinarId !== parsed.data.accountWebinarId) {
    return NextResponse.json({ error: "Webinar not found" }, { status: 404 });
  }
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if ((await countRegistrationsLastHourByIp(webinar.accountWebinarId, ip)) >= 5) {
    return NextResponse.json({ error: "You've already registered. Check your phone — your replay link was saved." }, { status: 429 });
  }
  const registration = await registerForWebinar({
    accountId: webinar.accountId,
    accountWebinarId: webinar.accountWebinarId,
    name: parsed.data.name,
    whatsappNumber: normaliseWhatsAppNumber(parsed.data.whatsappNumber),
    email: parsed.data.email || undefined,
    pdpaConsent: true,
    consentText: PDPA_CONSENT_TEXT,
    ipAddress: ip,
    userAgent: request.headers.get("user-agent") ?? "",
  });
  if (!registration) return NextResponse.json({ error: "Registration failed" }, { status: 500 });
  await adminDb.audit.log({
    accountId: webinar.accountId,
    actorUserId: null,
    action: "public.webinar_registration.submitted",
    resourceType: "webinar_registration",
    resourceId: registration.id,
    metadata: JSON.stringify({ accountWebinarId: webinar.accountWebinarId, source: "public_form" }),
  });
  return NextResponse.json({ ok: true, replayUrl: `/webinar/${webinar.accountSlug}/watch/${registration.watchToken}` });
}
