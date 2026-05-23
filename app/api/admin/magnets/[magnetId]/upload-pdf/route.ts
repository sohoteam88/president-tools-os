import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/session";
import { generateUploadPresignedUrl } from "@/lib/storage/r2";

export async function POST(_request: NextRequest, { params }: { params: { magnetId: string } }) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const key = `magnets/master/${params.magnetId}.pdf`;
  const uploadUrl = await generateUploadPresignedUrl(key, "application/pdf");
  return NextResponse.json({ data: { uploadUrl } });
}
