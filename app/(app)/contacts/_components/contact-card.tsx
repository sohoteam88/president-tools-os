"use client";

import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
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

export function ContactCard({
  contact,
  onStageChange,
  onArchive,
}: {
  contact: Contact;
  onStageChange: (contactId: string, stage: PipelineStage) => void;
  onArchive?: (contactId: string) => void;
}) {
  const { t } = useLanguage();
  const [stage, setStage] = useState<PipelineStage>(contact.stage);
  const waLink = buildWaLink(contact.whatsappNumber, `Hi ${contact.name}, `);

  function relativeDate(value: Date | string | null): string {
    if (!value) return t.never;
    const date = new Date(value);
    const days = Math.floor((Date.now() - date.getTime()) / 86_400_000);
    if (days <= 0) return t.today;
    if (days === 1) return t.oneDayAgo;
    if (days < 14) return `${days}${t.daysAgoSuffix}`;
    return `${Math.floor(days / 7)}${t.weeksAgoSuffix}`;
  }

  function openWhatsApp() {
    void fetch(`/api/crm/contacts/${contact.id}/whatsapp-sent`, { method: "POST" });
    window.open(waLink, "_blank", "noopener,noreferrer");
  }

  async function changeStage(nextStage: PipelineStage) {
    const previous = stage;
    setStage(nextStage);
    onStageChange(contact.id, nextStage);
    const response = await fetch(`/api/crm/contacts/${contact.id}/stage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stage: nextStage }),
    });
    if (!response.ok) {
      setStage(previous);
      onStageChange(contact.id, previous);
      toast.error(t.couldNotMoveContact);
      return;
    }
    toast.success(t.contactStageUpdated);
  }

  const sourceKey = SOURCE_KEY_MAP[contact.source];

  return (
    <article
      draggable
      onDragStart={(event) => event.dataTransfer.setData("text/plain", contact.id)}
      className="space-y-3 rounded-md border border-border bg-card p-3 shadow-sm"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold">{contact.name}</h3>
          <p className="text-xs text-muted-foreground">{relativeDate(contact.lastContactedAt)}</p>
        </div>
        <span className="rounded bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
          {sourceKey ? t[sourceKey] : contact.source}
        </span>
      </div>
      {contact.notes ? <p className="line-clamp-2 text-xs text-muted-foreground">{contact.notes}</p> : null}
      <div className="flex items-center gap-2">
        <button type="button" onClick={openWhatsApp} className="rounded-md bg-green-600 px-2.5 py-1.5 text-xs font-medium text-white">
          WhatsApp
        </button>
        <Link href={`/contacts/${contact.id}`} className="rounded-md border border-border px-2.5 py-1.5 text-xs">
          {t.details}
        </Link>
        {onArchive ? (
          <button type="button" onClick={() => onArchive(contact.id)} className="rounded-md border border-border px-2.5 py-1.5 text-xs text-muted-foreground">
            {t.archive}
          </button>
        ) : null}
      </div>
      <select
        value={stage}
        onChange={(event) => void changeStage(event.target.value as PipelineStage)}
        className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-xs"
      >
        {PIPELINE_STAGES.map((pipelineStage) => (
          <option key={pipelineStage} value={pipelineStage}>
            {t[STAGE_KEY_MAP[pipelineStage]]}
          </option>
        ))}
      </select>
    </article>
  );
}

export { ContactCard as default };
