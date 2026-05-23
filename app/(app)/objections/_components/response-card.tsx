"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { AccountObjectionResponse, ObjectionResponse } from "@/lib/db/schema/objections";
import { useLanguage } from "@/lib/i18n";
import type { TranslationKeys } from "@/lib/translations";

type ResponseLike = ObjectionResponse | AccountObjectionResponse;

const CATEGORY_KEY_MAP: Record<string, keyof TranslationKeys> = {
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

export function ResponseCard({
  response,
  isFavourited,
  isPersonal,
  onFavourite,
  onDelete,
}: {
  response: ResponseLike;
  isFavourited: boolean;
  isPersonal: boolean;
  onFavourite?: (responseId: string, next: boolean) => void;
  onDelete?: (responseId: string) => void;
}) {
  const router = useRouter();
  const { t } = useLanguage();
  const [copied, setCopied] = useState(false);
  const [confirming, setConfirming] = useState(false);

  async function copy() {
    await navigator.clipboard.writeText(response.responseText);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  }

  async function useAsContent() {
    const result = await fetch(`/api/objections/${response.id}/use-as-content`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ responseType: isPersonal ? "personal" : "master" }),
    });
    const body = (await result.json()) as { draftId?: string };
    if (body.draftId) router.push(`/content?draftId=${body.draftId}`);
  }

  const categoryKey = CATEGORY_KEY_MAP[response.category];
  const toneKey = TONE_KEY_MAP[response.tone];

  return (
    <article className="space-y-4 rounded-md border border-border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold">{response.title}</h3>
          <p className="text-xs text-muted-foreground">
            {categoryKey ? t[categoryKey] : response.category} · {toneKey ? t[toneKey] : response.tone}
          </p>
        </div>
        {isPersonal && response.complianceStatus === "flagged" ? (
          <span className="rounded bg-amber-100 px-2 py-1 text-xs text-amber-800">{t.flagged}</span>
        ) : null}
      </div>
      <p className="text-sm leading-6 text-foreground">{response.responseText}</p>
      {isPersonal && response.complianceFlags ? (
        <p className="rounded-md bg-amber-50 p-3 text-xs text-amber-900">{response.complianceFlags}</p>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => void copy()} className="rounded-md border border-border px-3 py-2 text-xs">
          {copied ? t.copied : t.copy}
        </button>
        {!isPersonal && onFavourite ? (
          <button type="button" onClick={() => onFavourite(response.id, !isFavourited)} className="rounded-md border border-border px-3 py-2 text-xs">
            {isFavourited ? t.unsave : t.save}
          </button>
        ) : null}
        <button type="button" onClick={() => void useAsContent()} className="rounded-md bg-primary px-3 py-2 text-xs font-medium text-primary-foreground">
          {t.useAsContent}
        </button>
        {isPersonal && onDelete ? (
          confirming ? (
            <span className="flex items-center gap-1.5">
              <span className="text-xs text-muted-foreground">{t.deleteConfirm}</span>
              <button
                type="button"
                onClick={() => { onDelete(response.id); setConfirming(false); }}
                className="rounded-md bg-destructive px-3 py-2 text-xs font-medium text-destructive-foreground"
              >
                {t.deleteYes}
              </button>
              <button
                type="button"
                onClick={() => setConfirming(false)}
                className="rounded-md border border-border px-3 py-2 text-xs"
              >
                {t.deleteNo}
              </button>
            </span>
          ) : (
            <button
              type="button"
              onClick={() => setConfirming(true)}
              className="rounded-md border border-border px-3 py-2 text-xs text-destructive hover:bg-destructive/10"
            >
              {t.delete}
            </button>
          )
        ) : null}
      </div>
    </article>
  );
}
