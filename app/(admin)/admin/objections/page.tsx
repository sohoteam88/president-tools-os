import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth/session";
import { adminDb } from "@/lib/db/scoped";
import { CATEGORY_LABELS } from "@/lib/objections/types";

export const metadata = { title: "Admin Objections" };

export default async function AdminObjectionsPage() {
  const admin = await requireAdmin();
  if (!admin) redirect("/login");
  const responses = await adminDb.objections.listAll();
  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">Objection Library Admin</h1>
        <p className="text-sm text-muted-foreground">Review, publish, and manage master responses.</p>
      </div>
      <div className="space-y-3">
        {responses.map((response) => (
          <article key={response.id} className="rounded-md border border-border bg-card p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold">{CATEGORY_LABELS[response.category]} · {response.title}</p>
                <p className="text-xs text-muted-foreground">{response.complianceStatus.toUpperCase()} · {response.isPublished ? "Published" : "Unpublished"} · {response.tone}</p>
              </div>
            </div>
            <p className="mt-3 text-sm leading-6">{response.responseText}</p>
            {response.complianceFlags ? <p className="mt-3 rounded-md bg-amber-50 p-3 text-xs text-amber-900">{response.complianceFlags}</p> : null}
          </article>
        ))}
        {responses.length === 0 ? <p className="text-sm text-muted-foreground">No responses yet.</p> : null}
      </div>
    </div>
  );
}
