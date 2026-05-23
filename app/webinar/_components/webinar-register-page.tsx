"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { PublicWebinarData } from "@/lib/webinars/public";

export function formatDuration(seconds: number | null): string | null {
  if (!seconds) return null;
  const mins = Math.round(seconds / 60);
  if (mins < 60) return `${mins} min training`;
  const hours = Math.floor(mins / 60);
  const rem = mins % 60;
  return rem > 0 ? `${hours}h ${rem}min training` : `${hours}hr training`;
}

export function WebinarRegisterPage({ webinar }: { webinar: PublicWebinarData }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [whatsappNumber, setWhatsappNumber] = useState("");
  const [email, setEmail] = useState("");
  const [pdpaConsent, setPdpaConsent] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    const response = await fetch("/api/public/webinar-register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        accountSlug: webinar.accountSlug,
        accountWebinarId: webinar.accountWebinarId,
        name,
        whatsappNumber,
        email: email || undefined,
        pdpaConsent: true,
      }),
    });
    const body = (await response.json()) as { replayUrl?: string; error?: string };
    setLoading(false);
    if (!response.ok) {
      setMessage(response.status === 429 ? "You've already registered. Check your phone — your replay link was saved." : body.error ?? "Something went wrong. Please try again.");
      return;
    }
    if (body.replayUrl) router.push(body.replayUrl);
  }

  return (
    <main className="min-h-screen bg-white text-slate-950">
      <div className="mx-auto max-w-[520px] px-5 py-8 text-[18px] leading-8">
        {webinar.thumbnailUrl ? <img src={webinar.thumbnailUrl} alt="" className="mb-8 w-full rounded-lg" /> : null}
        <p className="text-sm font-semibold uppercase tracking-wide text-emerald-700">RECORDED TRAINING</p>
        <h1 className="mt-2 text-4xl font-semibold leading-tight">{webinar.title}</h1>
        {formatDuration(webinar.durationSeconds) ? <p className="mt-2 text-sm font-medium text-slate-500">{formatDuration(webinar.durationSeconds)}</p> : null}
        <p className="mt-4 text-xl text-slate-600">{webinar.description}</p>
        {webinar.customIntro ? <blockquote className="mt-6 rounded-lg bg-slate-50 p-4">{webinar.customIntro}<br />— {webinar.accountName}, Herbalife Distributor</blockquote> : null}

        <form onSubmit={submit} className="mt-8 space-y-4 rounded-lg border border-slate-200 p-5">
          <h2 className="text-2xl font-semibold">Watch the free replay</h2>
          <input required value={name} onChange={(event) => setName(event.target.value)} placeholder="Your Name" className="w-full rounded-md border px-3 py-3" />
          <input required value={whatsappNumber} onChange={(event) => setWhatsappNumber(event.target.value)} placeholder="WhatsApp Number" className="w-full rounded-md border px-3 py-3" />
          <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="Email" className="w-full rounded-md border px-3 py-3" />
          <div className="flex items-start gap-2 text-xs text-muted-foreground">
            <input
              id="pdpa-consent"
              type="checkbox"
              checked={pdpaConsent}
              onChange={(e) => setPdpaConsent(e.target.checked)}
              className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 accent-emerald-600"
              required
            />
            <label htmlFor="pdpa-consent" className="text-slate-500">
              I consent to my personal data (name and WhatsApp number) being collected and used
              by this independent Herbalife distributor for follow-up, in accordance with Malaysia&apos;s{" "}
              <a href="/privacy" target="_blank" rel="noopener noreferrer" className="underline text-slate-700">
                Personal Data Protection Act 2010
              </a>.
            </label>
          </div>
          <button disabled={loading || !pdpaConsent} className="w-full rounded-md bg-emerald-600 px-4 py-3 font-semibold text-white disabled:opacity-60">
            {loading ? "Registering..." : "Watch Now →"}
          </button>
          {message ? <p className="text-sm text-red-700">{message}</p> : null}
        </form>

        <footer className="mt-10 border-t pt-5 text-sm leading-6 text-slate-500">
          <p>Shared by {webinar.accountName}</p>
          <p>Independent Herbalife Distributor</p>
        </footer>
      </div>
    </main>
  );
}
