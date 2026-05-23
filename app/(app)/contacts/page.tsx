import { redirect } from "next/navigation";
import { getServerAccount } from "@/lib/auth/session";
import { scopedDb } from "@/lib/db/scoped";
import { syncContactsFromSources } from "@/lib/crm/sync";
import { getServerTranslations } from "@/lib/locale-server";
import { AddContactModal } from "./_components/add-contact-modal";
import { ContactsWorkspace } from "./_components/contacts-workspace";
import { SyncBanner } from "./_components/sync-banner";

export const metadata = { title: "Contacts" };

export default async function ContactsPage() {
  const account = await getServerAccount();
  if (!account) redirect("/login");
  const t = getServerTranslations();

  const userDb = scopedDb(account.id);
  let activeContacts = await userDb.crm.list();
  if (activeContacts.length === 0) {
    await syncContactsFromSources(account.id);
    activeContacts = await userDb.crm.list();
  }
  const contacts = await userDb.crm.list({ includeArchived: true });
  const counts = await userDb.crm.countByStage();
  const total = Object.values(counts).reduce((sum, count) => sum + count, 0);

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{t.contacts}</h1>
          <p className="text-sm text-muted-foreground">{total} {t.activeContactsLabel}</p>
        </div>
        <div className="flex items-center gap-2">
          <form action="/api/crm/sync" method="POST">
            <button type="submit" className="rounded-md border border-border px-4 py-2 text-sm font-medium">
              {t.sync}
            </button>
          </form>
          <AddContactModal />
        </div>
      </div>
      <SyncBanner show={activeContacts.length < 500} />
      {contacts.length >= 500 ? (
        <p className="rounded-md border border-border bg-muted p-3 text-sm text-muted-foreground">
          {t.showingFirst500}
        </p>
      ) : null}
      <ContactsWorkspace contacts={contacts} />
    </div>
  );
}
