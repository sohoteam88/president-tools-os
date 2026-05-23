import { redirect } from "next/navigation";
import { getServerAccount } from "@/lib/auth/session";
import { scopedDb } from "@/lib/db/scoped";
import { ContactDetailClient } from "./contact-detail-client";

export const metadata = { title: "Contact Details" };

export default async function ContactDetailPage({ params }: { params: { contactId: string } }) {
  const account = await getServerAccount();
  if (!account) redirect("/login");
  const userDb = scopedDb(account.id);
  const contact = await userDb.crm.get(params.contactId);
  if (!contact) redirect("/contacts");
  const activities = await userDb.crm.listActivities(params.contactId, 20);
  return <ContactDetailClient contact={contact} activities={activities} />;
}
