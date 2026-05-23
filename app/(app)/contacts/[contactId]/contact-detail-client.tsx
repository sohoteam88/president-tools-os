"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { Contact, ContactActivity } from "@/lib/db/schema/crm";
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

export function ContactDetailClient({
  contact,
  activities,
}: {
  contact: Contact;
  activities: ContactActivity[];
}) {
  const { t } = useLanguage();
  const [notes, setNotes] = useState(contact.notes ?? "");
  const [stage, setStage] = useState<PipelineStage>(contact.stage);
  const [saveState, setSaveState] = useState(t.saved);
  const waLink = useMemo(() => buildWaLink(contact.whatsappNumber, `Hi ${contact.name}, `), [contact.name, contact.whatsappNumber]);

  function relativeDate(value: Date | string | null): string {
    if (!value) return t.never;
    const date = new Date(value);
    const days = Math.floor((Date.now() - date.getTime()) / 86_400_000);
    if (days <= 0) return t.today;
    if (days === 1) return t.oneDayAgo;
    if (days < 14) return `${days}${t.daysAgoSuffix}`;
    return `${Math.floor(days / 7)}${t.weeksAgoSuffix}`;
  }

  function activityText(activity: ContactActivity): string {
    if (activity.activityType === "stage_change" && activity.payload) {
      const payload = JSON.parse(activity.payload) as { from?: PipelineStage; to?: PipelineStage };
      const fromKey = payload.from ? STAGE_KEY_MAP[payload.from] : null;
      const toKey = payload.to ? STAGE_KEY_MAP[payload.to] : null;
      const from = fromKey ? t[fromKey] : t.unknownStage;
      const to = toKey ? t[toKey] : t.unknownStage;
      return `${t.stageMoved} ${from} → ${to}`;
    }
    if (activity.activityType === "note_added") return t.noteAdded;
    if (activity.activityType === "whatsapp_sent") return t.whatsappOpened;
    return t.manualContactUpdate;
  }

  useEffect(() => {
    if (notes === (contact.notes ?? "")) return;
    setSaveState(t.saving);
    const timer = window.setTimeout(async () => {
      await fetch(`/api/crm/contacts/${contact.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes }),
      });
      setSaveState(t.saved);
    }, 1000);
    return () => window.clearTimeout(timer);
  }, [contact.id, contact.notes, notes, t.saving, t.saved]);

  async function moveStage(nextStage: PipelineStage) {
    setStage(nextStage);
    await fetch(`/api/crm/contacts/${contact.id}/stage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stage: nextStage }),
    });
  }

  function openWhatsApp() {
    void fetch(`/api/crm/contacts/${contact.id}/whatsapp-sent`, { method: "POST" });
    window.open(waLink, "_blank", "noopener,noreferrer");
  }

  async function markContacted() {
    await fetch(`/api/crm/contacts/${contact.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lastContactedAt: new Date().toISOString() }),
    });
  }

  async function archive() {
    await fetch(`/api/crm/contacts/${contact.id}/archive`, { method: "POST" });
    window.location.href = "/contacts";
  }

  const stageKey = STAGE_KEY_MAP[stage];
  const sourceKey = SOURCE_KEY_MAP[contact.source];

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <Link href="/contacts" className="text-sm text-muted-foreground hover:text-foreground">{t.backToContacts}</Link>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{contact.name}</h1>
          <p className="text-sm text-muted-foreground">
            {stageKey ? t[stageKey] : stage} | {sourceKey ? t[sourceKey] : contact.source} | {relativeDate(contact.lastContactedAt)}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={openWhatsApp} className="rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white">
            WhatsApp {contact.name}
          </button>
          <select value={stage} onChange={(event) => void moveStage(event.target.value as PipelineStage)} className="rounded-md border border-input bg-background px-3 py-2 text-sm">
            {PIPELINE_STAGES.map((pipelineStage) => <option key={pipelineStage} value={pipelineStage}>{t[STAGE_KEY_MAP[pipelineStage]]}</option>)}
          </select>
          <button type="button" onClick={() => void archive()} className="rounded-md border border-border px-4 py-2 text-sm">
            {t.archive}
          </button>
        </div>
      </div>
      <section className="space-y-2">
        <h2 className="text-sm font-semibold">{t.details}</h2>
        <div className="rounded-md border border-border p-4 text-sm">
          <p>WhatsApp: +{contact.whatsappNumber}</p>
          <p>{t.emailLabel} {contact.email ?? t.notProvided}</p>
        </div>
      </section>
      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">{t.notesPlaceholder}</h2>
          <span className="text-xs text-muted-foreground">{saveState}</span>
        </div>
        <textarea
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          maxLength={2000}
          className="min-h-44 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
        />
      </section>
      <section className="space-y-2">
        <h2 className="text-sm font-semibold">{t.markContacted}</h2>
        <button type="button" onClick={() => void markContacted()} className="rounded-md border border-border px-4 py-2 text-sm">
          {t.markAsContactedToday}
        </button>
      </section>
      <section className="space-y-3">
        <h2 className="text-sm font-semibold">{t.activityLog}</h2>
        <div className="space-y-2 rounded-md border border-border p-4">
          {activities.map((activity) => (
            <div key={activity.id} className="text-sm">
              <span className="text-muted-foreground">●</span> {activityText(activity)}
              <span className="ml-2 text-xs text-muted-foreground">{relativeDate(activity.createdAt)}</span>
            </div>
          ))}
          {activities.length === 0 ? <p className="text-sm text-muted-foreground">{t.noActivityYet}</p> : null}
        </div>
      </section>
    </div>
  );
}
