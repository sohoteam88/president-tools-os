import { NextRequest, NextResponse } from "next/server";
import { scopedDb, adminDb } from "@/lib/db/scoped";
import { generateDownloadPresignedUrl } from "@/lib/storage/r2";
import { getPublicMagnet, countDownloadsLastHourByIp, recordDownload } from "@/lib/magnets/public";
import { normaliseWhatsAppNumber } from "@/lib/funnels/whatsapp";
import { MagnetDownloadRequestSchema } from "@/lib/validators/magnets";
import { PDPA_CONSENT_TEXT } from "@/lib/pdpa/consent";

export async function POST(request: NextRequest) {
  try {
    const parsed = MagnetDownloadRequestSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    const magnet = await getPublicMagnet(parsed.data.accountSlug);
    if (!magnet || magnet.accountLeadMagnetId !== parsed.data.accountLeadMagnetId) {
      return NextResponse.json({ error: "Guide not found" }, { status: 404 });
    }
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
    if ((await countDownloadsLastHourByIp(magnet.accountLeadMagnetId, ip)) >= 3) {
      return NextResponse.json({ error: "You've already requested this recently. Check your WhatsApp — we'll be in touch!" }, { status: 429 });
    }
    const userDb = scopedDb(magnet.accountId);
    const activation = await userDb.magnets.getActivation();
    const master = await import("@/lib/db/scoped").then((mod) => mod.adminDb.magnets.getActive());
    const pdfKey = activation?.personalisedPdfKey ?? master?.masterPdfKey;
    if (!pdfKey) return NextResponse.json({ error: "Guide is not ready" }, { status: 404 });
    const download = await recordDownload({
      accountId: magnet.accountId,
      accountLeadMagnetId: magnet.accountLeadMagnetId,
      name: parsed.data.name,
      whatsappNumber: normaliseWhatsAppNumber(parsed.data.whatsappNumber),
      email: parsed.data.email || undefined,
      pdpaConsent: true,
      consentText: PDPA_CONSENT_TEXT,
      ipAddress: ip,
      userAgent: request.headers.get("user-agent") ?? "",
    });
    if (download) {
      await adminDb.audit.log({
        accountId: magnet.accountId,
        actorUserId: null,
        action: "public.magnet_download.submitted",
        resourceType: "lead_magnet_download",
        resourceId: download.id,
        metadata: JSON.stringify({ accountLeadMagnetId: magnet.accountLeadMagnetId, source: "public_form" }),
      });
    }
    const downloadUrl = await generateDownloadPresignedUrl(pdfKey, 900);
    return NextResponse.json({ ok: true, downloadUrl, expiresInSeconds: 900 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Download failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
