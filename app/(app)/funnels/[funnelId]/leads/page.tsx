import { redirect } from "next/navigation";
import { getServerAccount } from "@/lib/auth/session";
import { scopedDb } from "@/lib/db/scoped";
import { LeadTable } from "../../_components/lead-table";

export default async function LeadsPage({ params }: { params: { funnelId: string } }) {
  const account = await getServerAccount();
  if (!account) redirect("/login");
  const leads = await scopedDb(account.id).funnels.listLeads(params.funnelId, 200);
  return (
    <div className="mx-auto max-w-5xl space-y-4 p-6">
      <h1 className="text-2xl font-semibold">Leads</h1>
      <p className="text-sm text-muted-foreground">Total leads: {leads.length}</p>
      <LeadTable leads={leads} />
    </div>
  );
}
