import { notFound, redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth/session";
import { adminDb } from "@/lib/db/scoped"; // ADMIN: cross-account query intentional
import { formatDate } from "@/lib/utils";
import { AccountAdminActions } from "./account-admin-actions";

export const metadata = { title: "Account Detail - Admin" };

export default async function AdminAccountDetailPage({
  params,
}: {
  params: { accountId: string };
}) {
  const admin = await requireAdmin();
  if (!admin) redirect("/dashboard");

  const { accountId } = params;
  const account = await adminDb.accounts.getById(accountId);
  if (!account) notFound();

  const [stats, recentAuditLogs] = await Promise.all([
    adminDb.accounts.getStats(accountId),
    adminDb.audit.listForAccount(accountId, 20),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold">{account.name}</h1>
          <p className="text-sm text-muted-foreground">
            {account.herbalifeId ?? "No Herbalife ID"} · {account.isActive ? "Active" : "Inactive"}
          </p>
        </div>
        <AccountAdminActions accountId={account.id} isActive={account.isActive} />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Object.entries(stats).map(([label, value]) => (
          <div key={label} className="rounded-md border border-border bg-card p-4">
            <p className="text-xs text-muted-foreground">{label.replace(/([A-Z])/g, " $1")}</p>
            <p className="mt-1 text-2xl font-semibold">{value}</p>
          </div>
        ))}
      </div>

      <section className="rounded-md border border-border bg-card p-4">
        <h2 className="mb-3 text-sm font-semibold">Recent Audit Logs</h2>
        <div className="space-y-2">
          {recentAuditLogs.length === 0 ? (
            <p className="text-sm text-muted-foreground">No audit activity yet.</p>
          ) : (
            recentAuditLogs.map((log) => (
              <div key={log.id} className="flex items-center justify-between gap-3 border-t border-border pt-2 first:border-t-0 first:pt-0">
                <span className="text-sm">{log.action}</span>
                <span className="text-xs text-muted-foreground">{formatDate(log.createdAt)}</span>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
