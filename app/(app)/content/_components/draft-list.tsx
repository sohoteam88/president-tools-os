"use client";

import { useState } from "react";
import type { ContentDraft } from "@/lib/db/schema/content";
import { formatDate } from "@/lib/utils";
import { useLanguage } from "@/lib/i18n";
import { CONTENT_TYPE_KEY_MAP } from "./content-type-selector";

const platformIcon: Record<string, string> = {
  facebook: "📘",
  instagram: "📸",
  whatsapp: "💬",
  tiktok_script: "🎬",
  invitation: "🤝",
};

function DraftRow({
  draft,
  onLoad,
  onDelete,
}: {
  draft: ContentDraft;
  onLoad: (draft: ContentDraft) => void;
  onDelete: (draftId: string) => void;
}) {
  const { t } = useLanguage();
  const [confirming, setConfirming] = useState(false);
  const key = CONTENT_TYPE_KEY_MAP[draft.contentType];

  return (
    <div className="flex items-center gap-2 p-3">
      <span className="text-lg">{platformIcon[draft.platform] ?? "✍️"}</span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">
          {key ? t[key] : draft.contentType}
        </p>
        <p className="text-xs text-muted-foreground">{formatDate(draft.createdAt)}</p>
      </div>
      <span className="rounded-full border border-border px-2 py-1 text-xs">
        {draft.complianceStatus}
      </span>
      {draft.modificationScore !== null ? (
        <span className="rounded-full bg-muted px-2 py-1 text-xs">
          {Math.round((1 - draft.modificationScore) * 100)}%
        </span>
      ) : null}
      <button
        type="button"
        onClick={() => onLoad(draft)}
        className="rounded-md border border-border px-2 py-1 text-xs font-medium"
      >
        {t.load}
      </button>
      {confirming ? (
        <span className="flex items-center gap-1">
          <span className="text-xs text-muted-foreground">{t.deleteConfirm}</span>
          <button
            type="button"
            onClick={() => { onDelete(draft.id); setConfirming(false); }}
            className="rounded-md bg-destructive px-2 py-1 text-xs font-medium text-destructive-foreground"
          >
            {t.deleteYes}
          </button>
          <button
            type="button"
            onClick={() => setConfirming(false)}
            className="rounded-md border border-border px-2 py-1 text-xs"
          >
            {t.deleteNo}
          </button>
        </span>
      ) : (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="rounded-md border border-border px-2 py-1 text-xs text-destructive hover:bg-destructive/10"
        >
          {t.delete}
        </button>
      )}
    </div>
  );
}

export function DraftList({
  drafts,
  onLoad,
  onDelete,
}: {
  drafts: ContentDraft[];
  onLoad: (draft: ContentDraft) => void;
  onDelete: (draftId: string) => void;
}) {
  const { t } = useLanguage();

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold">{t.recentDrafts}</h2>
      {drafts.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t.noDraftsYet}</p>
      ) : (
        <div className="divide-y divide-border rounded-md border border-border">
          {drafts.slice(0, 10).map((draft) => (
            <DraftRow key={draft.id} draft={draft} onLoad={onLoad} onDelete={onDelete} />
          ))}
        </div>
      )}
    </section>
  );
}
