"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { getMytDateString } from "@/lib/coach/date";
import { PLATFORMS, PLATFORM_LABELS, type Platform } from "@/lib/validators/ads";
import type { AdEntry } from "@/lib/db/schema/ads";
import { useLanguage } from "@/lib/i18n";

const numberFields = ["reach", "likes", "comments", "saves", "shares", "dmsReceived", "leadsGenerated", "linkClicks"] as const;

export function LogPostModal({ onCreated }: { onCreated: (entry: AdEntry) => void }) {
  const router = useRouter();
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const [createdEntry, setCreatedEntry] = useState<AdEntry | null>(null);
  const [ocrStatus, setOcrStatus] = useState("");
  const [error, setError] = useState("");

  async function submit(formData: FormData) {
    setError("");
    const payload = {
      platform: formData.get("platform"),
      postedAt: formData.get("postedAt"),
      captionPreview: formData.get("captionPreview") || null,
      notes: formData.get("notes") || null,
      ...Object.fromEntries(numberFields.map((field) => {
        const raw = String(formData.get(field) ?? "");
        return [field, raw ? Number(raw) : null];
      })),
    };
    const response = await fetch("/api/ads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const body = (await response.json()) as { entry?: AdEntry; error?: string };
    if (!response.ok || !body.entry) {
      setError(body.error ?? t.couldNotSavePost);
      return;
    }
    setCreatedEntry(body.entry);
    onCreated(body.entry);
  }

  async function uploadScreenshot(file: File) {
    if (!createdEntry) return;
    if (file.size > 5 * 1024 * 1024) {
      setError(t.screenshotTooLarge);
      return;
    }
    const uploadResponse = await fetch("/api/ads/screenshot-upload-url", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entryId: createdEntry.id, mimeType: file.type }),
    });
    const uploadBody = (await uploadResponse.json()) as { uploadUrl?: string; key?: string };
    if (!uploadResponse.ok || !uploadBody.uploadUrl || !uploadBody.key) {
      setError(t.couldNotPrepareUpload);
      return;
    }
    await fetch(uploadBody.uploadUrl, { method: "PUT", headers: { "content-type": file.type }, body: file });
    await fetch(`/api/ads/${createdEntry.id}/confirm-screenshot`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: uploadBody.key }),
    });
    setCreatedEntry({ ...createdEntry, screenshotKey: uploadBody.key });
    setOcrStatus(t.screenshotUploaded);
  }

  async function runOcr() {
    if (!createdEntry) return;
    setOcrStatus(t.extractingStats);
    const response = await fetch(`/api/ads/${createdEntry.id}/ocr`, { method: "POST" });
    const body = (await response.json()) as { confidence?: string | null; extracted?: Record<string, number> | null };
    if (!response.ok || !body.extracted) {
      setOcrStatus(t.ocrCouldNotRead);
      return;
    }
    setOcrStatus(body.confidence === "high" ? t.highConfidenceStats : t.lowConfidenceStats);
    router.refresh();
  }

  function close() {
    setOpen(false);
    setCreatedEntry(null);
    setOcrStatus("");
    setError("");
    router.refresh();
  }

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">
        {t.logAPost}
      </button>
      {open ? (
        <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/40 p-4">
          <div className="w-full max-w-2xl rounded-md bg-background p-5 shadow-lg">
            <form action={submit} className="space-y-4">
              <div>
                <h2 className="text-lg font-semibold">{t.logAPostTitle}</h2>
                <p className="text-sm text-muted-foreground">{t.trackOrganicPosts}</p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="space-y-1 text-sm">
                  <span>{t.platform}</span>
                  <select name="platform" defaultValue="facebook" className="w-full rounded-md border border-input bg-background px-3 py-2">
                    {PLATFORMS.map((p) => <option key={p} value={p}>{PLATFORM_LABELS[p]}</option>)}
                  </select>
                </label>
                <label className="space-y-1 text-sm">
                  <span>{t.postedOn}</span>
                  <input name="postedAt" type="date" defaultValue={getMytDateString()} className="w-full rounded-md border border-input bg-background px-3 py-2" />
                </label>
              </div>
              <textarea name="captionPreview" maxLength={200} placeholder={t.captionPreviewLabel} className="min-h-20 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
              <div className="grid gap-3 sm:grid-cols-4">
                {numberFields.map((field) => (
                  <input key={field} name={field} type="number" min="0" placeholder={field} className="rounded-md border border-input bg-background px-3 py-2 text-sm" />
                ))}
              </div>
              <textarea name="notes" maxLength={500} placeholder={t.notesPlaceholder} className="min-h-20 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
              {error ? <p className="text-sm text-destructive">{error}</p> : null}
              <div className="flex flex-wrap items-center gap-2">
                <button type="submit" className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">{t.save}</button>
                <button type="button" onClick={close} className="rounded-md border border-border px-4 py-2 text-sm">{t.cancel}</button>
                {createdEntry ? (
                  <>
                    <label className="cursor-pointer rounded-md border border-border px-4 py-2 text-sm">
                      {t.uploadScreenshot}
                      <input type="file" accept="image/jpeg,image/png" className="hidden" onChange={(event) => {
                        const file = event.target.files?.[0];
                        if (file) void uploadScreenshot(file);
                      }} />
                    </label>
                    {createdEntry.screenshotKey ? (
                      <button type="button" onClick={() => void runOcr()} className="rounded-md border border-border px-4 py-2 text-sm">{t.extractStatsWithAI}</button>
                    ) : null}
                  </>
                ) : null}
              </div>
              {createdEntry ? <p className="text-xs text-muted-foreground">{t.postSavedOptional}</p> : null}
              {ocrStatus ? <p className="text-sm text-amber-700">{ocrStatus}</p> : null}
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}
