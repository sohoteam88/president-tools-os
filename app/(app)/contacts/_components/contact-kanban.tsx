"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import type { Contact } from "@/lib/db/schema/crm";
import { PIPELINE_STAGES, type PipelineStage } from "@/lib/crm/types";
import { useLanguage } from "@/lib/i18n";
import type { TranslationKeys } from "@/lib/translations";
import { ContactCard } from "./contact-card";

const STAGE_KEY_MAP: Record<PipelineStage, keyof TranslationKeys> = {
  new: "stageNew",
  warm: "stageWarm",
  hot: "stageHot",
  customer: "stageCustomer",
  team_member: "stageTeamMember",
};

export function ContactKanban({ initialContacts }: { initialContacts: Contact[] }) {
  const { t } = useLanguage();
  const [contacts, setContacts] = useState(initialContacts);

  const grouped = useMemo(() => {
    return PIPELINE_STAGES.reduce<Record<PipelineStage, Contact[]>>((acc, stage) => {
      acc[stage] = contacts.filter((contact) => contact.stage === stage && !contact.isArchived);
      return acc;
    }, { new: [], warm: [], hot: [], customer: [], team_member: [] });
  }, [contacts]);

  function setContactStage(contactId: string, stage: PipelineStage) {
    setContacts((current) => current.map((contact) => (
      contact.id === contactId ? { ...contact, stage } : contact
    )));
  }

  function archiveContact(contactId: string) {
    setContacts((current) => current.filter((contact) => contact.id !== contactId));
    void fetch(`/api/crm/contacts/${contactId}/archive`, { method: "POST" });
  }

  async function dropContact(contactId: string, stage: PipelineStage) {
    const previous = contacts;
    setContactStage(contactId, stage);
    const response = await fetch(`/api/crm/contacts/${contactId}/stage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stage }),
    });
    if (!response.ok) {
      setContacts(previous);
      toast.error(t.couldNotMoveContact);
      return;
    }
    toast.success(t.contactStageUpdated);
  }

  return (
    <div className="grid gap-3 lg:grid-cols-5">
      {PIPELINE_STAGES.map((stage) => (
        <section
          key={stage}
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            const contactId = event.dataTransfer.getData("text/plain");
            if (contactId) void dropContact(contactId, stage);
          }}
          className="min-h-72 rounded-md border border-border bg-muted/40 p-3"
        >
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-xs font-semibold uppercase tracking-wide">{t[STAGE_KEY_MAP[stage]]}</h2>
            <span className="rounded bg-background px-2 py-0.5 text-xs">{grouped[stage].length}</span>
          </div>
          <div className="space-y-3">
            {grouped[stage].map((contact) => (
              <ContactCard
                key={contact.id}
                contact={contact}
                onStageChange={setContactStage}
                onArchive={archiveContact}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
