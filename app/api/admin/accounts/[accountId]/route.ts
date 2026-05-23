import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/session";
import { adminDb } from "@/lib/db/scoped"; // ADMIN: cross-account query intentional

const PatchSchema = z.object({
  isActive: z.boolean().optional(),
  resetSetup: z.boolean().optional(),
});

export async function GET(
  _request: NextRequest,
  { params }: { params: { accountId: string } }
) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { accountId } = params;
  // ADMIN: cross-account query intentional
  const account = await adminDb.accounts.getById(accountId);
  if (!account) return NextResponse.json({ error: "Account not found" }, { status: 404 });

  const [stats, recentAuditLogs] = await Promise.all([
    adminDb.accounts.getStats(accountId),
    adminDb.audit.listForAccount(accountId, 20),
  ]);

  return NextResponse.json({ account, stats, recentAuditLogs });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { accountId: string } }
) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = PatchSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Validation error" }, { status: 400 });
  }

  const patch: { isActive?: boolean; setupWizardCompletedAt?: null } = {};
  if (typeof parsed.data.isActive === "boolean") patch.isActive = parsed.data.isActive;
  if (parsed.data.resetSetup) patch.setupWizardCompletedAt = null;

  const { accountId } = params;
  // ADMIN: cross-account query intentional
  const account = await adminDb.accounts.update(accountId, patch);
  if (!account) return NextResponse.json({ error: "Account not found" }, { status: 404 });

  await adminDb.audit.log({
    accountId,
    actorUserId: admin.userId,
    action: "account.updated",
    resourceType: "account",
    resourceId: accountId,
    metadata: JSON.stringify(parsed.data),
  });

  return NextResponse.json({ account });
}
