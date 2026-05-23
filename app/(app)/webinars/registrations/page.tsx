import { redirect } from "next/navigation";
import { getServerAccount } from "@/lib/auth/session";
import { scopedDb } from "@/lib/db/scoped";
import { LeadTable } from "../../funnels/_components/lead-table";

export default async function WebinarRegistrationsPage() {
  const account = await getServerAccount();
  if (!account) redirect("/login");
  const registrations = await scopedDb(account.id).webinars.listRegistrations(200);
  const leads = registrations.map((registration) => ({
    id: registration.id,
    accountId: registration.accountId,
    funnelId: registration.accountWebinarId,
    name: registration.name,
    whatsappNumber: registration.whatsappNumber,
    email: registration.email,
    pdpaConsent: registration.pdpaConsent,
    consentText: registration.consentText,
    ipAddress: null,
    userAgent: null,
    notes: registration.watchedAt ? "Watched" : null,
    contactedAt: registration.watchedAt,
    submittedAt: registration.registeredAt,
  }));
  return (
    <div className="mx-auto max-w-5xl space-y-4 p-6">
      <h1 className="text-2xl font-semibold">Webinar Registrations</h1>
      <p className="text-sm text-muted-foreground">Total registrations: {registrations.length}</p>
      <LeadTable leads={leads} />
    </div>
  );
}
