"use client";

import { useEffect, useState } from "react";
import type { Contact } from "@/lib/db/schema/crm";
import { useLanguage } from "@/lib/i18n";
import { ContactKanban } from "./contact-kanban";
import { ContactList } from "./contact-list";
import { EmptyState } from "@/app/(app)/_components/empty-state";

export function ContactsWorkspace({ contacts }: { contacts: Contact[] }) {
  const { t } = useLanguage();
  const [view, setView] = useState<"kanban" | "list">("kanban");

  useEffect(() => {
    const stored = window.localStorage.getItem("contacts:view");
    if (stored === "kanban" || stored === "list") setView(stored);
  }, []);

  function changeView(nextView: "kanban" | "list") {
    setView(nextView);
    window.localStorage.setItem("contacts:view", nextView);
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end gap-2">
        <button type="button" onClick={() => changeView("kanban")} className={`rounded-md border px-3 py-2 text-sm ${view === "kanban" ? "border-primary bg-primary text-primary-foreground" : "border-border"}`}>
          {t.kanban}
        </button>
        <button type="button" onClick={() => changeView("list")} className={`rounded-md border px-3 py-2 text-sm ${view === "list" ? "border-primary bg-primary text-primary-foreground" : "border-border"}`}>
          {t.listView}
        </button>
      </div>
      {contacts.length === 0 ? (
        <EmptyState title={t.noContactsYet} description={t.noContactsDesc} />
      ) : view === "kanban" ? (
        <ContactKanban initialContacts={contacts} />
      ) : (
        <ContactList contacts={contacts} />
      )}
    </div>
  );
}
