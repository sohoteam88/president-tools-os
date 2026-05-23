import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/session";
import { adminDb } from "@/lib/db/scoped";
import { runComplianceFilter } from "@/lib/compliance/filter";
import { uploadBytes, getPublicUrl } from "@/lib/storage/r2";
import { MagnetMetaSchema } from "@/lib/validators/magnets";

export async function POST(request: NextRequest) {
  try {
    const admin = await requireAdmin();
    if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const form = await request.formData();
    const parsed = MagnetMetaSchema.safeParse({
      title: form.get("title"),
      description: form.get("description"),
      thumbnailUrl: "",
    });
    if (!parsed.success) return NextResponse.json({ error: "Invalid metadata" }, { status: 400 });
    if (form.get("confirmCompliance") !== "true") {
      return NextResponse.json({ error: "Compliance confirmation is required" }, { status: 400 });
    }
    const compliance = await runComplianceFilter(`${parsed.data.title} ${parsed.data.description}`, admin.id, "magnet-meta");
    if (!compliance.passed) return NextResponse.json({ error: "Compliance failed", flags: compliance.flags }, { status: 422 });
    const pdf = form.get("pdf");
    if (!(pdf instanceof File)) return NextResponse.json({ error: "PDF is required" }, { status: 400 });

    const magnetId = crypto.randomUUID();
    const masterPdfKey = `magnets/master/${magnetId}.pdf`;
    await uploadBytes(masterPdfKey, new Uint8Array(await pdf.arrayBuffer()), "application/pdf");

    let thumbnailUrl: string | undefined;
    const thumbnail = form.get("thumbnail");
    if (thumbnail instanceof File && thumbnail.size > 0) {
      const key = `magnets/thumbnails/${magnetId}.jpg`;
      await uploadBytes(key, new Uint8Array(await thumbnail.arrayBuffer()), thumbnail.type || "image/jpeg");
      thumbnailUrl = getPublicUrl(key);
    }

    // ADMIN: cross-account query intentional
    await adminDb.magnets.deactivateAll();
    // ADMIN: cross-account query intentional
    const magnet = await adminDb.magnets.create({
      title: parsed.data.title,
      description: parsed.data.description,
      thumbnailUrl,
      masterPdfKey,
      version: 1,
      isActive: true,
    });
    // ADMIN: cross-account query intentional
    await adminDb.magnets.invalidatePersonalisedPdfs();
    await adminDb.audit.log({
      accountId: admin.id,
      actorUserId: admin.userId,
      action: "magnet.created",
      resourceType: "lead_magnet",
      resourceId: magnetId,
    });
    return NextResponse.json({ data: { magnet: magnet ? sanitiseMagnet(magnet) : null } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create magnet";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

function sanitiseMagnet<T extends { masterPdfKey?: string }>(magnet: T): Omit<T, "masterPdfKey"> {
  const { masterPdfKey: _key, ...safe } = magnet;
  return safe;
}
