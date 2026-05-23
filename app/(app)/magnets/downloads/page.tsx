import { redirect } from "next/navigation";
import { getServerAccount } from "@/lib/auth/session";
import { scopedDb } from "@/lib/db/scoped";
import { LeadTable } from "../../funnels/_components/lead-table";

export default async function MagnetDownloadsPage() {
  const account = await getServerAccount();
  if (!account) redirect("/login");
  const downloads = await scopedDb(account.id).magnets.listDownloads(200);
  const leads = downloads.map((download) => ({
    id: download.id,
    accountId: download.accountId,
    funnelId: download.accountLeadMagnetId,
    name: download.name,
    whatsappNumber: download.whatsappNumber,
    email: download.email,
    pdpaConsent: download.pdpaConsent,
    consentText: download.consentText,
    ipAddress: null,
    userAgent: null,
    notes: null,
    contactedAt: null,
    submittedAt: download.downloadedAt,
  }));
  return (
    <div className="mx-auto max-w-5xl space-y-4 p-6">
      <h1 className="text-2xl font-semibold">Lead Magnet Downloads</h1>
      <p className="text-sm text-muted-foreground">Total downloads: {downloads.length}</p>
      <LeadTable leads={leads} />
    </div>
  );
}
