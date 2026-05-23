import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/session";
import { adminDb } from "@/lib/db/scoped"; // ADMIN: cross-account query intentional

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { token: string } }
) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { token } = params;
  // ADMIN: cross-account query intentional
  const invite = await adminDb.invites.findByToken(token);
  if (!invite) return NextResponse.json({ error: "Invite not found" }, { status: 404 });
  if (invite.acceptedAt) {
    return NextResponse.json({ error: "Accepted invites cannot be revoked" }, { status: 400 });
  }

  // ADMIN: cross-account query intentional
  await adminDb.invites.deleteByToken(token);
  await adminDb.audit.log({
    accountId: invite.accountId,
    actorUserId: admin.userId,
    action: "invite.revoked",
    resourceType: "invite_token",
    resourceId: invite.id,
    metadata: JSON.stringify({ email: invite.email }),
  });

  return NextResponse.json({ ok: true });
}
