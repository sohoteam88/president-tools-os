import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth/session";
import { adminDb } from "@/lib/db/scoped"; // ADMIN: cross-account query intentional
import { formatDate } from "@/lib/utils";

export const metadata = { title: "Usage - Admin" };

export default async function AdminUsagePage() {
  const admin = await requireAdmin();
  if (!admin) redirect("/dashboard");

  const usage = await adminDb.usage.getOverview();
  const adoptionEntries = Object.entries(usage.adoption).filter(([key]) => key !== "totalAccounts");
  const totalAccounts = usage.adoption.totalAccounts || 1;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold">Usage</h1>
        <p className="text-sm text-muted-foreground">Token usage, module adoption, and recent platform activity.</p>
      </div>

      <section className="grid gap-3 md:grid-cols-2">
        {Object.entries(usage.tokenUsage).map(([module, tokens]) => (
          <div key={module} className="rounded-md border border-border bg-card p-4">
            <h2 className="text-sm font-semibold capitalize">{module.replace(/([A-Z])/g, " $1")}</h2>
            {tokens ? (
              <p className="mt-2 text-sm text-muted-foreground">
                {tokens.promptTokens + tokens.completionTokens} total tokens · {tokens.promptTokens} prompt · {tokens.completionTokens} completion
              </p>
            ) : (
              <p className="mt-2 text-sm text-muted-foreground">—</p>
            )}
          </div>
        ))}
      </section>

      <section className="rounded-md border border-border bg-card p-4">
        <h2 className="mb-3 text-sm font-semibold">Feature Adoption</h2>
        <div className="grid gap-3 md:grid-cols-2">
          {adoptionEntries.map(([module, count]) => (
            <div key={module}>
              <div className="mb-1 flex items-center justify-between text-xs">
                <span className="capitalize text-muted-foreground">{module.replace(/([A-Z])/g, " $1")}</span>
                <span>{count}/{usage.adoption.totalAccounts}</span>
              </div>
              <div className="h-2 rounded-full bg-muted">
                <div className="h-2 rounded-full bg-primary" style={{ width: `${Math.min(100, (Number(count) / totalAccounts) * 100)}%` }} />
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-md border border-border bg-card p-4">
        <h2 className="mb-3 text-sm font-semibold">Recent Activity</h2>
        <div className="space-y-2">
          {usage.recentActivity.map((log) => (
            <div key={log.id} className="flex items-center justify-between gap-3 border-t border-border pt-2 first:border-t-0 first:pt-0">
              <span className="text-sm">{log.action}</span>
              <span className="text-xs text-muted-foreground">{formatDate(log.createdAt)}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
