"use client";

import { useState } from "react";
import type { Funnel } from "@/lib/db/schema/funnels";
import { funnelContentSchema } from "@/lib/funnels/types";

export function PublicFunnelView({ funnel, accountName, accountSlug }: { funnel: Funnel; accountName: string; accountSlug: string }) {
  const content = funnelContentSchema.parse(JSON.parse(funnel.contentJson) as unknown);
  const [name, setName] = useState("");
  const [whatsappNumber, setWhatsappNumber] = useState("");
  const [email, setEmail] = useState("");
  const [pdpaConsent, setPdpaConsent] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    const response = await fetch("/api/public/funnel-leads", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ funnelId: funnel.id, accountSlug, pathSlug: funnel.pathSlug, name, whatsappNumber, email: email || undefined, pdpaConsent: true }),
    });
    const body = (await response.json()) as { cta?: { action: string; url?: string; message?: string }; error?: string };
    setLoading(false);
    if (response.status === 429) {
      setMessage("You've already submitted recently. We'll be in touch!");
      return;
    }
    if (!response.ok) {
      setMessage(body.error ?? "Something went wrong. Please try again.");
      return;
    }
    if (body.cta?.action === "redirect" && body.cta.url) {
      window.location.href = body.cta.url;
      return;
    }
    setMessage(body.cta?.message ?? "Thank you. I will be in touch soon.");
  }

  return (
    <main className="min-h-screen bg-white text-slate-950">
      <div className="mx-auto max-w-[500px] px-5 py-8 text-[18px] leading-8">
        {content.coverImageUrl ? <img src={content.coverImageUrl} alt="" className="mb-8 h-[300px] w-full rounded-lg object-cover" /> : null}
        <h1 className="text-4xl font-semibold leading-tight">{content.headline}</h1>
        <p className="mt-4 text-xl text-slate-600">{content.subheadline}</p>

        <section className="mt-8 space-y-5">
          {content.storyBlocks.map((block, index) => {
            if (block.type === "image") return <img key={index} src={block.url} alt={block.alt} className="rounded-lg" />;
            if (block.type === "highlight") return <blockquote key={index} className="rounded-lg border-l-4 border-emerald-500 bg-emerald-50 p-4 font-medium">{block.text}</blockquote>;
            return <p key={index}>{block.text}</p>;
          })}
        </section>

        {content.socialProof?.length ? (
          <section className="mt-8 space-y-3">
            {content.socialProof.map((item) => <p key={item.name} className="rounded-lg bg-slate-50 p-4">“{item.quote}” — {item.name}</p>)}
          </section>
        ) : null}

        <section className="mt-10 rounded-lg border border-slate-200 p-5">
          {message ? (
            <p className="font-medium text-emerald-700">{message}</p>
          ) : (
            <form onSubmit={submit} className="space-y-4">
              <div>
                <h2 className="text-2xl font-semibold">{content.leadForm.heading}</h2>
                {content.leadForm.subheading ? <p className="mt-1 text-base text-slate-600">{content.leadForm.subheading}</p> : null}
              </div>
              <input required value={name} onChange={(event) => setName(event.target.value)} placeholder="Name" className="w-full rounded-md border px-3 py-3" />
              <input required value={whatsappNumber} onChange={(event) => setWhatsappNumber(event.target.value)} placeholder="WhatsApp number" className="w-full rounded-md border px-3 py-3" />
              {content.leadForm.fields.includes("email") ? <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="Email" className="w-full rounded-md border px-3 py-3" /> : null}
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
                {loading ? "Sending..." : content.leadForm.submitLabel}
              </button>
            </form>
          )}
        </section>

        <footer className="mt-10 border-t pt-5 text-sm leading-6 text-slate-500">
          <p>Powered by President Tools</p>
          <p>This page is operated by an independent Herbalife distributor, not Herbalife Ltd.</p>
          <p>{accountName}</p>
        </footer>
      </div>
    </main>
  );
}
