"use client";

import { useState } from "react";
import type { Funnel } from "@/lib/db/schema/funnels";
import { funnelContentSchema } from "@/lib/funnels/types";

export function FunnelEditorForm({ funnel }: { funnel: Funnel }) {
  const initial = funnelContentSchema.parse(JSON.parse(funnel.contentJson) as unknown);
  const [headline, setHeadline] = useState(initial.headline);
  const [subheadline, setSubheadline] = useState(initial.subheadline);
  const [story, setStory] = useState(initial.storyBlocks.find((block) => block.type === "paragraph")?.text ?? "");
  const [message, setMessage] = useState<string | null>(null);

  async function save(publish = false) {
    const contentJson = {
      ...initial,
      headline,
      subheadline,
      storyBlocks: [{ type: "paragraph" as const, text: story }],
    };
    const response = await fetch(`/api/funnels/${funnel.id}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ contentJson }),
    });
    if (!response.ok) {
      setMessage("Save failed. Check compliance wording.");
      return;
    }
    if (publish) {
      const publishResponse = await fetch(`/api/funnels/${funnel.id}/publish`, { method: "POST" });
      setMessage(publishResponse.ok ? "Published." : "Publish blocked by compliance or missing slug.");
    } else {
      setMessage("Saved.");
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="space-y-4">
        <input value={headline} onChange={(event) => setHeadline(event.target.value)} className="w-full rounded-md border px-3 py-2" />
        <textarea value={subheadline} onChange={(event) => setSubheadline(event.target.value)} className="min-h-20 w-full rounded-md border px-3 py-2" />
        <textarea value={story} onChange={(event) => setStory(event.target.value)} className="min-h-56 w-full rounded-md border px-3 py-2" />
        <div className="flex gap-2">
          <button onClick={() => save(false)} className="rounded-md border px-4 py-2 text-sm">Save Draft</button>
          <button onClick={() => save(true)} className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white">Publish</button>
        </div>
        {message ? <p className="text-sm">{message}</p> : null}
      </div>
      <div className="rounded-lg border p-5">
        <h1 className="text-3xl font-semibold">{headline}</h1>
        <p className="mt-3 text-muted-foreground">{subheadline}</p>
        <p className="mt-6 leading-7">{story}</p>
      </div>
    </div>
  );
}
