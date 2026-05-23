"use client";

import { useMemo, useState } from "react";
import type { AccountObjectionResponse, ObjectionResponse } from "@/lib/db/schema/objections";
import { OBJECTION_CATEGORIES, type ObjectionCategory } from "@/lib/objections/types";
import { useLanguage } from "@/lib/i18n";
import type { TranslationKeys } from "@/lib/translations";
import { AddPersonalModal } from "./_components/add-personal-modal";
import { ResponseCard } from "./_components/response-card";

const CATEGORY_KEY_MAP: Record<ObjectionCategory, keyof TranslationKeys> = {
  price: "categoryPrice",
  skepticism: "categorySkepticism",
  mlm_concern: "categoryMlmConcern",
  time: "categoryTime",
  loyalty: "categoryLoyalty",
};

export function ObjectionsClient({
  masterResponses,
  personalResponses,
  favouriteIds,
}: {
  masterResponses: ObjectionResponse[];
  personalResponses: AccountObjectionResponse[];
  favouriteIds: string[];
}) {
  const { t } = useLanguage();
  const [tab, setTab] = useState<ObjectionCategory | "all" | "mine">("all");
  const [favourites, setFavourites] = useState(new Set(favouriteIds));
  const [personal, setPersonal] = useState(personalResponses);
  const visibleMaster = useMemo(() => (
    tab === "mine" ? [] : masterResponses.filter((response) => tab === "all" || response.category === tab)
  ), [masterResponses, tab]);

  function toggleFavourite(responseId: string, next: boolean) {
    setFavourites((current) => {
      const copy = new Set(current);
      if (next) copy.add(responseId);
      else copy.delete(responseId);
      return copy;
    });
    void fetch("/api/objections/favourites", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ responseId, action: next ? "add" : "remove" }),
    });
  }

  function deletePersonal(responseId: string) {
    setPersonal((current) => current.filter((r) => r.id !== responseId));
    void fetch(`/api/objections/personal/${responseId}`, { method: "DELETE" });
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{t.objectionLibrary}</h1>
          <p className="text-sm text-muted-foreground">{t.objectionLibrarySubtitle}</p>
        </div>
        <AddPersonalModal onCreated={(response) => setPersonal((current) => [response, ...current])} />
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setTab("all")}
          className={`rounded-md border border-border px-3 py-2 text-sm ${tab === "all" ? "bg-primary text-primary-foreground border-primary" : ""}`}
        >
          {t.allTab}
        </button>
        {OBJECTION_CATEGORIES.map((category) => (
          <button
            key={category}
            onClick={() => setTab(category)}
            className={`rounded-md border border-border px-3 py-2 text-sm ${tab === category ? "bg-primary text-primary-foreground border-primary" : ""}`}
          >
            {t[CATEGORY_KEY_MAP[category]]}
          </button>
        ))}
        <button
          onClick={() => setTab("mine")}
          className={`rounded-md border border-border px-3 py-2 text-sm ${tab === "mine" ? "bg-primary text-primary-foreground border-primary" : ""}`}
        >
          {t.myResponses}
        </button>
      </div>
      {tab !== "mine" ? (
        <section className="space-y-4">
          {visibleMaster.map((response) => (
            <ResponseCard
              key={response.id}
              response={response}
              isPersonal={false}
              isFavourited={favourites.has(response.id)}
              onFavourite={toggleFavourite}
            />
          ))}
        </section>
      ) : (
        <section className="space-y-4">
          {personal.map((response) => (
            <ResponseCard
              key={response.id}
              response={response}
              isPersonal
              isFavourited={false}
              onDelete={deletePersonal}
            />
          ))}
          {personal.length === 0 ? <p className="rounded-md border border-border bg-muted p-4 text-sm text-muted-foreground">{t.noPersonalResponses}</p> : null}
        </section>
      )}
    </div>
  );
}
