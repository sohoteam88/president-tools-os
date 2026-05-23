"use client";

import { useState } from "react";

export function FunnelSlugSetup() {
  const [slug, setSlug] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  async function save() {
    const response = await fetch("/api/account/slug", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ slug }),
    });
    setMessage(response.ok ? "Saved. Refreshing..." : "That address is not available.");
    if (response.ok) window.location.reload();
  }

  return (
    <div className="rounded-lg border-2 border-dashed border-border p-6">
      <h2 className="text-base font-semibold">Set your funnel address</h2>
      <p className="mt-1 text-sm text-muted-foreground">Choose the subdomain people will visit.</p>
      <div className="mt-4 flex gap-2">
        <input value={slug} onChange={(event) => setSlug(event.target.value.toLowerCase())} className="min-w-0 flex-1 rounded-md border px-3 py-2 text-sm" placeholder="sherry" />
        <button onClick={save} className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">Save</button>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">{slug || "your-name"}.yourteam.com</p>
      {message ? <p className="mt-2 text-sm">{message}</p> : null}
    </div>
  );
}
