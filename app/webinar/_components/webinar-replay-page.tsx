"use client";

import { useEffect } from "react";
import type { ReplayData } from "@/lib/webinars/public";

export function WebinarReplayPage({ replay, watchToken }: { replay: ReplayData; watchToken: string }) {
  useEffect(() => {
    void fetch("/api/public/webinar-watched", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ watchToken }),
    });
  }, [watchToken]);

  return (
    <main className="min-h-screen bg-white text-slate-950">
      <div className="mx-auto max-w-[640px] px-5 py-8">
        <h1 className="text-3xl font-semibold">{replay.webinarTitle}</h1>
        <p className="mt-1 text-sm font-semibold uppercase tracking-wide text-emerald-700">RECORDED TRAINING</p>
        <div className="mt-6" style={{ position: "relative", paddingTop: "56.25%" }}>
          <iframe
            src={replay.bunnyEmbedUrl}
            style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", border: "none" }}
            allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture;"
            allowFullScreen
          />
        </div>
        <section className="mt-8 rounded-lg border p-5">
          <h2 className="text-xl font-semibold">Ready to take the next step?</h2>
          <a href={`/funnel/${replay.accountSlug}`} className="mt-4 inline-flex rounded-md bg-emerald-600 px-4 py-2 font-medium text-white">
            Chat with {replay.accountName}
          </a>
        </section>
        <footer className="mt-10 border-t pt-5 text-sm leading-6 text-slate-500">
          <p>Independent Herbalife Distributor</p>
        </footer>
      </div>
    </main>
  );
}
