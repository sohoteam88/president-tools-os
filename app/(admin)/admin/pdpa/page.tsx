"use client";

import { useState } from "react";

type EraseResult = {
  funnelLeads: number;
  magnetDownloads: number;
  webinarRegistrations: number;
  crmContacts: number;
};

export default function PdpaPage() {
  const [whatsappNumber, setWhatsappNumber] = useState("");
  const [accountId, setAccountId] = useState("");
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<EraseResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleErase(event: React.FormEvent) {
    event.preventDefault();
    if (!confirm("Anonymize all records for this number? This cannot be undone.")) return;
    setLoading(true);
    setError(null);
    setResult(null);
    const response = await fetch("/api/admin/pdpa/erase", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ whatsappNumber, accountId, reason }),
    });
    const body = (await response.json()) as { ok?: boolean; result?: EraseResult; error?: string };
    setLoading(false);
    if (!response.ok) {
      setError(body.error ?? "Erasure failed");
      return;
    }
    setResult(body.result ?? null);
  }

  return (
    <div className="max-w-xl space-y-6">
      <div>
        <h1 className="text-lg font-semibold">PDPA Erasure Requests</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Anonymize all records for a data subject to comply with a PDPA deletion request.
        </p>
      </div>

      <form onSubmit={handleErase} className="space-y-4 rounded-lg border p-5">
        <div className="space-y-1">
          <label className="text-sm font-medium">WhatsApp Number</label>
          <input
            required
            value={whatsappNumber}
            onChange={(e) => setWhatsappNumber(e.target.value)}
            placeholder="e.g. 60123456789"
            className="w-full rounded-md border px-3 py-2 text-sm"
          />
        </div>
        <div className="space-y-1">
          <label className="text-sm font-medium">Account ID</label>
          <input
            required
            value={accountId}
            onChange={(e) => setAccountId(e.target.value)}
            placeholder="UUID of the distributor account"
            className="w-full rounded-md border px-3 py-2 text-sm"
          />
        </div>
        <div className="space-y-1">
          <label className="text-sm font-medium">Reason</label>
          <input
            required
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Data subject requested deletion via WhatsApp on 2026-05-20"
            className="w-full rounded-md border px-3 py-2 text-sm"
          />
        </div>
        <p className="rounded-md bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800">
          ⚠ This action cannot be undone. It will anonymize all records matching this number
          across funnels, lead magnets, webinars, and CRM.
        </p>
        <button
          type="submit"
          disabled={loading}
          className="rounded-md bg-red-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
        >
          {loading ? "Anonymizing..." : "Anonymize Records"}
        </button>
      </form>

      {error ? (
        <p className="text-sm text-red-700">{error}</p>
      ) : null}

      {result ? (
        <div className="rounded-lg border p-5 space-y-2">
          <p className="text-sm font-semibold text-emerald-700">Erasure complete.</p>
          <table className="w-full text-sm">
            <tbody>
              <tr><td className="py-0.5 text-muted-foreground">Funnel leads</td><td className="text-right font-mono">{result.funnelLeads}</td></tr>
              <tr><td className="py-0.5 text-muted-foreground">Magnet downloads</td><td className="text-right font-mono">{result.magnetDownloads}</td></tr>
              <tr><td className="py-0.5 text-muted-foreground">Webinar registrations</td><td className="text-right font-mono">{result.webinarRegistrations}</td></tr>
              <tr><td className="py-0.5 text-muted-foreground">CRM contacts</td><td className="text-right font-mono">{result.crmContacts}</td></tr>
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
