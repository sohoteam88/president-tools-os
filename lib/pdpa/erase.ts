/**
 * PDPA Data Erasure
 *
 * Anonymizes all personal data for a given WhatsApp number within an account.
 * Covers funnel_leads, lead_magnet_downloads, webinar_registrations, contacts.
 * Records are NOT deleted — referential integrity and aggregate stats are preserved.
 */
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { funnelLeads } from "@/lib/db/schema/funnels";
import { leadMagnetDownloads } from "@/lib/db/schema/magnets";
import { webinarRegistrations } from "@/lib/db/schema/webinars";
import { contacts } from "@/lib/db/schema/crm";

const ANONYMIZED_NAME = "[Deleted]";
const ANONYMIZED_WHATSAPP = "00000000000";

export type EraseResult = {
  funnelLeads: number;
  magnetDownloads: number;
  webinarRegistrations: number;
  crmContacts: number;
};

export async function eraseDataByWhatsApp(
  whatsappNumber: string,
  accountId: string
): Promise<EraseResult> {
  const [fl, md, wr, c] = await Promise.all([
    db
      .update(funnelLeads)
      .set({ name: ANONYMIZED_NAME, whatsappNumber: ANONYMIZED_WHATSAPP, email: null })
      .where(and(eq(funnelLeads.whatsappNumber, whatsappNumber), eq(funnelLeads.accountId, accountId)))
      .returning({ id: funnelLeads.id }),

    db
      .update(leadMagnetDownloads)
      .set({ name: ANONYMIZED_NAME, whatsappNumber: ANONYMIZED_WHATSAPP, email: null })
      .where(and(eq(leadMagnetDownloads.whatsappNumber, whatsappNumber), eq(leadMagnetDownloads.accountId, accountId)))
      .returning({ id: leadMagnetDownloads.id }),

    db
      .update(webinarRegistrations)
      .set({ name: ANONYMIZED_NAME, whatsappNumber: ANONYMIZED_WHATSAPP, email: null })
      .where(and(eq(webinarRegistrations.whatsappNumber, whatsappNumber), eq(webinarRegistrations.accountId, accountId)))
      .returning({ id: webinarRegistrations.id }),

    db
      .update(contacts)
      .set({ name: ANONYMIZED_NAME, whatsappNumber: ANONYMIZED_WHATSAPP, email: null })
      .where(and(eq(contacts.whatsappNumber, whatsappNumber), eq(contacts.accountId, accountId)))
      .returning({ id: contacts.id }),
  ]);

  return {
    funnelLeads: fl.length,
    magnetDownloads: md.length,
    webinarRegistrations: wr.length,
    crmContacts: c.length,
  };
}
