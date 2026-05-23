"use client";

import type { FunnelLead } from "@/lib/db/schema/funnels";
import { buildWaLink } from "@/lib/funnels/whatsapp";
import { formatDate } from "@/lib/utils";

export function LeadTable({ leads }: { leads: FunnelLead[] }) {
  function exportCsv() {
    const rows = [["name", "whatsapp", "email", "submitted"], ...leads.map((lead) => [lead.name, lead.whatsappNumber, lead.email ?? "", lead.submittedAt.toISOString()])];
    const csv = rows.map((row) => row.map((cell) => `"${cell.replaceAll('"', '""')}"`).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "funnel-leads.csv";
    link.click();
  }

  return (
    <div className="space-y-3">
      <button onClick={exportCsv} className="rounded-md border px-3 py-2 text-sm">Export CSV</button>
      <div className="divide-y rounded-lg border">
        {leads.map((lead) => (
          <div key={lead.id} className="grid gap-2 p-3 sm:grid-cols-4">
            <span className="font-medium">{lead.name}</span>
            <a className="text-emerald-700" href={buildWaLink(lead.whatsappNumber)}>WhatsApp</a>
            <span>{lead.email ?? "-"}</span>
            <span className="text-sm text-muted-foreground">{formatDate(lead.submittedAt)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
