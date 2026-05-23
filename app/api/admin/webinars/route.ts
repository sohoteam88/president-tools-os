import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/session";
import { adminDb } from "@/lib/db/scoped";
import { runComplianceFilter } from "@/lib/compliance/filter";
import { AdminWebinarSchema } from "@/lib/validators/webinars";
import { getBunnyLibraryId, getBunnyThumbnailUrl } from "@/lib/webinars/bunny";

export async function POST(request: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const contentType = request.headers.get("content-type") ?? "";
  const body = contentType.includes("form")
    ? Object.fromEntries((await request.formData()).entries())
    : await request.json().catch(() => null);
  const raw = body && typeof body === "object" ? body as Record<string, unknown> : {};
  const parsed = AdminWebinarSchema.safeParse({
    ...raw,
    durationSeconds: raw.durationSeconds ? Number(raw.durationSeconds) : undefined,
  });
  if (!parsed.success) return NextResponse.json({ error: "Invalid webinar metadata" }, { status: 400 });
  if (raw.confirmCompliance !== true && raw.confirmCompliance !== "true") {
    return NextResponse.json({ error: "Compliance confirmation is required" }, { status: 400 });
  }
  const compliance = await runComplianceFilter(`${parsed.data.title} ${parsed.data.description}`, admin.id, "webinar-meta");
  if (!compliance.passed) return NextResponse.json({ error: "Compliance failed", flags: compliance.flags }, { status: 422 });

  const libraryId = getBunnyLibraryId();
  // ADMIN: cross-account query intentional
  await adminDb.webinars.deactivateAll();
  // ADMIN: cross-account query intentional
  const webinar = await adminDb.webinars.create({
    title: parsed.data.title,
    description: parsed.data.description,
    bunnyVideoId: parsed.data.bunnyVideoId,
    bunnyLibraryId: libraryId,
    thumbnailUrl: parsed.data.thumbnailUrl || getBunnyThumbnailUrl(libraryId, parsed.data.bunnyVideoId),
    durationSeconds: parsed.data.durationSeconds,
    isActive: true,
  });
  await adminDb.audit.log({
    accountId: admin.id,
    actorUserId: admin.userId,
    action: "webinar.created",
    resourceType: "webinar",
    resourceId: webinar?.id,
  });
  return NextResponse.json({ data: { webinar } });
}
