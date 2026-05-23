"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function SyncBanner({ show }: { show: boolean }) {
  const router = useRouter();
  const [syncing, setSyncing] = useState(false);
  if (!show) return null;

  async function sync() {
    setSyncing(true);
    await fetch("/api/crm/sync", { method: "POST" });
    router.refresh();
    setSyncing(false);
  }

  return (
    <div className="flex items-center justify-between gap-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
      <span>You may have new leads from funnels, magnets, or webinars.</span>
      <button type="button" onClick={() => void sync()} disabled={syncing} className="rounded-md bg-amber-900 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-60">
        {syncing ? "Syncing..." : "Sync Now"}
      </button>
    </div>
  );
}
