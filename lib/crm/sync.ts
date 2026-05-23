import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { scopedDb } from "@/lib/db/scoped";
import { funnelLeads } from "@/lib/db/schema/funnels";
import { leadMagnetDownloads } from "@/lib/db/schema/magnets";
import { webinarRegistrations } from "@/lib/db/schema/webinars";
import { normaliseWhatsAppNumber } from "@/lib/funnels/whatsapp";

export type SyncResult = {
  funnelLeads: { imported: number; skipped: number };
  magnetDownloads: { imported: number; skipped: number };
  webinarRegs: { imported: number; skipped: number };
};

function emptyResult(): SyncResult {
  return {
    funnelLeads: { imported: 0, skipped: 0 },
    magnetDownloads: { imported: 0, skipped: 0 },
    webinarRegs: { imported: 0, skipped: 0 },
  };
}

export async function syncContactsFromSources(accountId: string): Promise<SyncResult> {
  const userDb = scopedDb(accountId);
  const result = emptyResult();

  // Sync reads cross-table directly, filtered by accountId.
  const leads = await db.select().from(funnelLeads).where(eq(funnelLeads.accountId, accountId));
  for (const lead of leads) {
    const { created } = await userDb.crm.importFromSource({
      sourceId: lead.id,
      source: "funnel",
      name: lead.name,
      whatsappNumber: normaliseWhatsAppNumber(lead.whatsappNumber),
      email: lead.email ?? undefined,
    });
    if (created) result.funnelLeads.imported++;
    else result.funnelLeads.skipped++;
  }

  // Sync reads cross-table directly, filtered by accountId.
  const downloads = await db
    .select()
    .from(leadMagnetDownloads)
    .where(eq(leadMagnetDownloads.accountId, accountId));
  for (const download of downloads) {
    const { created } = await userDb.crm.importFromSource({
      sourceId: download.id,
      source: "lead_magnet",
      name: download.name,
      whatsappNumber: normaliseWhatsAppNumber(download.whatsappNumber),
      email: download.email ?? undefined,
    });
    if (created) result.magnetDownloads.imported++;
    else result.magnetDownloads.skipped++;
  }

  // Sync reads cross-table directly, filtered by accountId.
  const registrations = await db
    .select()
    .from(webinarRegistrations)
    .where(eq(webinarRegistrations.accountId, accountId));
  for (const registration of registrations) {
    const { created } = await userDb.crm.importFromSource({
      sourceId: registration.id,
      source: "webinar",
      name: registration.name,
      whatsappNumber: normaliseWhatsAppNumber(registration.whatsappNumber),
      email: registration.email ?? undefined,
    });
    if (created) result.webinarRegs.imported++;
    else result.webinarRegs.skipped++;
  }

  return result;
}
