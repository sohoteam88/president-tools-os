"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
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

export function AddContactModal() {
  const router = useRouter();
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");

  async function submit(formData: FormData) {
    setError("");
    const response = await fetch("/api/crm/contacts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(Object.fromEntries(formData)),
    });
    if (!response.ok) {
      setError(response.status === 409 ? t.whatsappAlreadyExists : t.couldNotAddContact);
      return;
    }
    setOpen(false);
    router.refresh();
  }

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">
        {t.addContact}
      </button>
      {open ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4">
          <form action={submit} className="w-full max-w-md space-y-4 rounded-md bg-background p-5 shadow-lg">
            <div>
              <h2 className="text-lg font-semibold">{t.addContactTitle}</h2>
              <p className="text-sm text-muted-foreground">{t.addContactDesc}</p>
            </div>
            <input name="name" required placeholder={t.namePlaceholder} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
            <input name="whatsappNumber" required placeholder={t.whatsappPlaceholder} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
            <input name="email" type="email" placeholder={t.emailPlaceholder} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
            <select name="stage" defaultValue="new" className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
              {PIPELINE_STAGES.map((stage) => (
                <option key={stage} value={stage}>{t[STAGE_KEY_MAP[stage]]}</option>
              ))}
            </select>
            <textarea name="notes" maxLength={2000} placeholder={t.notesPlaceholder} className="min-h-24 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setOpen(false)} className="rounded-md border border-border px-4 py-2 text-sm">{t.cancel}</button>
              <button type="submit" className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">{t.save}</button>
            </div>
          </form>
        </div>
      ) : null}
    </>
  );
}
