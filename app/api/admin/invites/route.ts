import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/session";
import { adminDb } from "@/lib/db/scoped"; // ADMIN: cross-account query intentional

export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // ADMIN: cross-account query intentional
  const invites = await adminDb.invites.listAllWithAccounts();
  const now = Date.now();

  return NextResponse.json({
    invites: invites.map((invite) => ({
      ...invite,
      status: invite.acceptedAt
        ? "accepted"
        : invite.expiresAt.getTime() < now
          ? "expired"
          : "pending",
    })),
  });
}
