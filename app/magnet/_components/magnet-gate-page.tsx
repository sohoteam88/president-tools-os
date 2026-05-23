"use client";

import { useState } from "react";
import type { PublicMagnetData } from "@/lib/magnets/public";

export function MagnetGatePage({ magnet }: { magnet: PublicMagnetData }) {
  const [name, setName] = useState("");
  const [whatsappNumber, setWhatsappNumber] = useState("");
  const [email, setEmail] = useState("");
  const [pdpaConsent, setPdpaConsent] = useState(false);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    const response = await fetch("/api/public/magnet-downloads", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        accountSlug: magnet.accountSlug,
        accountLeadMagnetId: magnet.accountLeadMagnetId,
        name,
        whatsappNumber,
        email: email || undefined,
        pdpaConsent: true,
      }),
    });
    const body = (await response.json()) as { downloadUrl?: string; error?: string };
    setLoading(false);
    if (!response.ok) {
      setMessage(response.status === 429 ? "You've already requested this recently. Check your WhatsApp — we'll be in touch!" : body.error ?? "Something went wrong. Please try again.");
      return;
    }
    setDownloadUrl(body.downloadUrl ?? null);
  }

  return (
    <main className="min-h-screen bg-white text-slate-950">
      <div className="mx-auto max-w-[480px] px-5 py-8 text-[18px] leading-8">
        {magnet.thumbnailUrl ? <img src={magnet.thumbnailUrl} alt="" className="mb-8 w-full rounded-lg object-cover" /> : null}
        <p className="text-sm font-semibold uppercase tracking-wide text-emerald-700">Free Guide</p>
        <h1 className="mt-2 text-4xl font-semibold leading-tight">{magnet.title}</h1>
        <p className="mt-4 text-xl text-slate-600">{magnet.description}</p>

        <section className="mt-8 rounded-lg border border-slate-200 p-5">
          {downloadUrl ? (
            <div className="space-y-4">
              <p className="font-medium text-emerald-700">Your guide is ready.</p>
              <a href={downloadUrl} target="_blank" rel="noopener noreferrer" className="block rounded-md bg-emerald-600 px-4 py-3 text-center font-semibold text-white">
                Download Your Free Guide
              </a>
              <p className="text-sm text-slate-500">Link expires in 15 minutes.</p>
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-4">
              <h2 className="text-2xl font-semibold">Get your free copy</h2>
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
                {loading ? "Preparing..." : "Send Me the Guide →"}
              </button>
              {message ? <p className="text-sm text-red-700">{message}</p> : null}
            </form>
          )}
        </section>

        <footer className="mt-10 border-t pt-5 text-sm leading-6 text-slate-500">
          <p>Shared by {magnet.accountName}</p>
          <p>Independent Herbalife Distributor</p>
        </footer>
      </div>
    </main>
  );
}
