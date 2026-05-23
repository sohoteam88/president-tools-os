"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { Contact } from "@/lib/db/schema/crm";
import { buildWaLink } from "@/lib/funnels/whatsapp";
import { PIPELINE_STAGES, type PipelineStage } from "@/lib/crm/types";
import { useLanguage } from "@/lib/i18n";
import type { TranslationKeys } from "@/lib/translations";

const STAGE_KEY_MAP: Record<PipelineStage, keyof TranslationKeys> = {
  new: "stageNew",
  warm: "stageWarm",
  hot: "stageHot",
  customer: "stageCustomer",
  team_member: "stageTeamMember",
};

const SOURCE_KEY_MAP: Record<string, keyof TranslationKeys> = {
  funnel: "sourceFunnel",
  lead_magnet: "sourceLeadMagnet",
  webinar: "sourceWebinar",
  manual: "sourceManual",
};

type SortKey = "name" | "stage" | "lastContactedAt";

export function ContactList({ contacts }: { contacts: Contact[] }) {
  const { t } = useLanguage();
  const [stage, setStage] = useState<PipelineStage | "all">("all");
  const [sortKey, setSortKey] = useState<SortKey>("lastContactedAt");
  const [archiveFilter, setArchiveFilter] = useState<"active" | "archived">("active");
  const visible = useMemo(() => {
    return contacts
      .filter((contact) => (archiveFilter === "archived" ? contact.isArchived : !contact.isArchived))
      .filter((contact) => stage === "all" || contact.stage === stage)
      .sort((a, b) => {
        if (sortKey === "name") return a.name.localeCompare(b.name);
        if (sortKey === "stage") return a.stage.localeCompare(b.stage);
        return new Date(a.lastContactedAt ?? 0).getTime() - new Date(b.lastContactedAt ?? 0).getTime();
      });
  }, [archiveFilter, contacts, sortKey, stage]);

  function relativeDate(value: Date | string | null): string {
    if (!value) return t.never;
    const date = new Date(value);
    const days = Math.floor((Date.now() - date.getTime()) / 86_400_000);
    if (days <= 0) return t.today;
    if (days === 1) return t.oneDayAgo;
    if (days < 14) return `${days}${t.daysAgoSuffix}`;
    return `${Math.floor(days / 7)}${t.weeksAgoSuffix}`;
  }

  async function toggleArchive(contactId: string, archived: boolean) {
    await fetch(`/api/crm/contacts/${contactId}/${archived ? "unarchive" : "archive"}`, { method: "POST" });
    window.location.reload();
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <select value={stage} onChange={(event) => setStage(event.target.value as PipelineStage | "all")} className="rounded-md border border-input bg-background px-3 py-2 text-sm">
          <option value="all">{t.allStages}</option>
          {PIPELINE_STAGES.map((pipelineStage) => <option key={pipelineStage} value={pipelineStage}>{t[STAGE_KEY_MAP[pipelineStage]]}</option>)}
        </select>
        <select value={sortKey} onChange={(event) => setSortKey(event.target.value as SortKey)} className="rounded-md border border-input bg-background px-3 py-2 text-sm">
          <option value="lastContactedAt">{t.sortLastContacted}</option>
          <option value="name">{t.sortByName}</option>
          <option value="stage">{t.sortByStage}</option>
        </select>
        <select value={archiveFilter} onChange={(event) => setArchiveFilter(event.target.value as "active" | "archived")} className="rounded-md border border-input bg-background px-3 py-2 text-sm">
          <option value="active">{t.activeFilter}</option>
          <option value="archived">{t.archivedFilter}</option>
        </select>
      </div>
      <div className="overflow-x-auto rounded-md border border-border">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="bg-muted text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="p-3">{t.nameColumn}</th>
              <th className="p-3">WhatsApp</th>
              <th className="p-3">{t.stageColumn}</th>
              <th className="p-3">{t.sourceColumn}</th>
              <th className="p-3">{t.lastContactedColumn}</th>
              <th className="p-3">{t.actionsColumn}</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((contact) => {
              const sourceKey = SOURCE_KEY_MAP[contact.source];
              return (
                <tr key={contact.id} className="border-t border-border">
                  <td className="p-3 font-medium">{contact.name}</td>
                  <td className="p-3">
                    <button
                      type="button"
                      onClick={() => {
                        void fetch(`/api/crm/contacts/${contact.id}/whatsapp-sent`, { method: "POST" });
                        window.open(buildWaLink(contact.whatsappNumber, `Hi ${contact.name}, `), "_blank", "noopener,noreferrer");
                      }}
                      className="rounded-md bg-green-600 px-2.5 py-1.5 text-xs font-medium text-white"
                    >
                      WhatsApp
                    </button>
                  </td>
                  <td className="p-3">{t[STAGE_KEY_MAP[contact.stage as PipelineStage]] ?? contact.stage}</td>
                  <td className="p-3">{sourceKey ? t[sourceKey] : contact.source}</td>
                  <td className="p-3">{relativeDate(contact.lastContactedAt)}</td>
                  <td className="p-3">
                    <div className="flex gap-2">
                      <Link href={`/contacts/${contact.id}`} className="rounded-md border border-border px-2.5 py-1.5 text-xs">{t.openLabel}</Link>
                      <button type="button" onClick={() => void toggleArchive(contact.id, contact.isArchived)} className="rounded-md border border-border px-2.5 py-1.5 text-xs">
                        {contact.isArchived ? t.unarchive : t.archive}
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
