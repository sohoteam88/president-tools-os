/**
 * Admin — Accounts List
 *
 * Shows all downline accounts. Provides:
 * - Create new account
 * - Send invite to existing account
 * - View account status (active, onboarding phase)
 *
 * Phase 1: list + create + invite. Edit/deactivate in Phase 2+.
 */

import { requireAdmin } from "@/lib/auth/session";
import { adminDb } from "@/lib/db/scoped"; // ADMIN: cross-account query intentional
import { redirect } from "next/navigation";
import { formatDate } from "@/lib/utils";
import Link from "next/link";
import { EmptyState } from "@/app/(app)/_components/empty-state";

export const metadata = { title: "Accounts — Admin" };

export default async function AdminAccountsPage() {
  const admin = await requireAdmin();
  if (!admin) redirect("/dashboard");

  // ADMIN: cross-account query intentional
  const accounts = await adminDb.accounts.listAll();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-foreground">Accounts</h1>
          <p className="text-sm text-muted-foreground">
            {accounts.length} downline{accounts.length !== 1 ? "s" : ""} registered
          </p>
        </div>
      </div>

      <div className="rounded-lg border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/30">
              <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Name</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Herbalife ID</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Seniority</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Path</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Status</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Created</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">Action</th>
            </tr>
          </thead>
          <tbody>
            {accounts.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8">
                  <EmptyState title="No accounts yet" description="Create the first downline account through the invite flow." />
                </td>
              </tr>
            ) : (
              accounts.map((account) => (
                <tr key={account.id} className="border-b border-border last:border-0 hover:bg-muted/20">
                  <td className="px-4 py-3 font-medium text-foreground">{account.name}</td>
                  <td className="px-4 py-3 text-muted-foreground">{account.herbalifeId ?? "—"}</td>
                  <td className="px-4 py-3 text-muted-foreground capitalize">{account.distributorSeniority}</td>
                  <td className="px-4 py-3 text-muted-foreground text-xs">{account.onboardingPath}</td>
                  <td className="px-4 py-3">
                    <span className={`
                      text-xs px-2 py-0.5 rounded-full font-medium
                      ${account.isActive
                        ? "bg-green-50 text-green-700 border border-green-200"
                        : "bg-red-50 text-red-700 border border-red-200"
                      }
                    `}>
                      {account.isActive ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground text-xs">
                    {formatDate(account.createdAt)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link href={`/admin/accounts/${account.id}`} className="rounded-md border border-border px-2.5 py-1.5 text-xs font-medium">
                      View
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
