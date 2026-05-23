import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/session";
import { getBunnyVideo, statusLabel } from "@/lib/webinars/bunny";

export async function POST(request: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => null) as { bunnyVideoId?: string } | null;
  if (!body?.bunnyVideoId) return NextResponse.json({ error: "bunnyVideoId required" }, { status: 400 });
  const video = await getBunnyVideo(body.bunnyVideoId);
  return NextResponse.json({
    data: {
      status: video.status,
      statusLabel: statusLabel(video.status),
      durationSeconds: video.length || null,
    },
  });
}
