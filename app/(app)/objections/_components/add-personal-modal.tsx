"use client";

import { useState } from "react";
import { OBJECTION_CATEGORIES, type ObjectionCategory } from "@/lib/objections/types";
import { TONES, type Tone } from "@/lib/validators/objections";
import type { AccountObjectionResponse } from "@/lib/db/schema/objections";
import { useLanguage } from "@/lib/i18n";
import type { TranslationKeys } from "@/lib/translations";

const CATEGORY_KEY_MAP: Record<ObjectionCategory, keyof TranslationKeys> = {
  price: "categoryPrice",
  skepticism: "categorySkepticism",
  mlm_concern: "categoryMlmConcern",
  time: "categoryTime",
  loyalty: "categoryLoyalty",
};

const TONE_KEY_MAP: Record<string, keyof TranslationKeys> = {
  empathetic: "toneEmpathetic",
  logical: "toneLogical",
  story: "toneStory",
};

export function AddPersonalModal({ onCreated }: { onCreated: (response: AccountObjectionResponse) => void }) {
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [error, setError] = useState("");

  async function submit(formData: FormData) {
    setError("");
    const response = await fetch("/api/objections/personal", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        category: formData.get("category") as ObjectionCategory,
        title: formData.get("title"),
        responseText: formData.get("responseText"),
        tone: formData.get("tone") as Tone,
      }),
    });
    const body = (await response.json()) as { response?: AccountObjectionResponse; error?: string };
    if (!response.ok || !body.response) {
      setError(body.error ?? t.couldNotSave);
      return;
    }
    onCreated(body.response);
    setOpen(false);
    setText("");
  }

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">
        {t.addMyOwnResponse}
      </button>
      {open ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4">
          <form action={submit} className="w-full max-w-xl space-y-4 rounded-md bg-background p-5 shadow-lg">
            <h2 className="text-lg font-semibold">{t.addPersonalResponse}</h2>
            <select name="category" className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
              {OBJECTION_CATEGORIES.map((category) => (
                <option key={category} value={category}>{t[CATEGORY_KEY_MAP[category]]}</option>
              ))}
            </select>
            <input name="title" required minLength={3} maxLength={80} placeholder={t.titlePlaceholder} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
            <textarea name="responseText" required minLength={50} maxLength={500} value={text} onChange={(event) => setText(event.target.value)} placeholder={t.responseTextPlaceholder} className="min-h-36 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
            <p className="text-xs text-muted-foreground">{text.length}/500 {t.characters}</p>
            <select name="tone" defaultValue="empathetic" className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
              {TONES.map((tone) => {
                const key = TONE_KEY_MAP[tone];
                return <option key={tone} value={tone}>{key ? t[key] : tone}</option>;
              })}
            </select>
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
