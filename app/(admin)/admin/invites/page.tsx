import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth/session";
import { adminDb } from "@/lib/db/scoped"; // ADMIN: cross-account query intentional
import { formatDate } from "@/lib/utils";
import { EmptyState } from "@/app/(app)/_components/empty-state";
import { InviteActions, RevokeInviteButton } from "./_components/invite-actions";

export const metadata = { title: "Invites - Admin" };

export default async function AdminInvitesPage() {
  const admin = await requireAdmin();
  if (!admin) redirect("/dashboard");

  const [accounts, invites] = await Promise.all([
    adminDb.accounts.listAll(),
    adminDb.invites.listAllWithAccounts(),
  ]);
  const now = Date.now();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold">Invites</h1>
        <p className="text-sm text-muted-foreground">Create, copy, and revoke downline invite links.</p>
      </div>

      <InviteActions accounts={accounts.map((account) => ({ id: account.id, name: account.name }))} />

      {invites.length === 0 ? (
        <EmptyState title="No invites yet" description="Send an invite to create the first pending link." />
      ) : (
        <div className="overflow-hidden rounded-md border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs text-muted-foreground">
              <tr>
                <th className="px-4 py-3 text-left font-medium">Email</th>
                <th className="px-4 py-3 text-left font-medium">Account</th>
                <th className="px-4 py-3 text-left font-medium">Status</th>
                <th className="px-4 py-3 text-left font-medium">Expires</th>
                <th className="px-4 py-3 text-right font-medium">Action</th>
              </tr>
            </thead>
            <tbody>
              {invites.map((invite) => {
                const status = invite.acceptedAt ? "accepted" : invite.expiresAt.getTime() < now ? "expired" : "pending";
                return (
                  <tr key={invite.id} className="border-t border-border">
                    <td className="px-4 py-3 font-medium">{invite.email}</td>
                    <td className="px-4 py-3 text-muted-foreground">{invite.account.name}</td>
                    <td className="px-4 py-3 capitalize">{status}</td>
                    <td className="px-4 py-3 text-muted-foreground">{formatDate(invite.expiresAt)}</td>
                    <td className="px-4 py-3 text-right">
                      {status === "accepted" ? null : <RevokeInviteButton token={invite.token} />}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
