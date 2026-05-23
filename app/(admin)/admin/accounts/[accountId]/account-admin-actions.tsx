"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

export function AccountAdminActions({
  accountId,
  isActive,
}: {
  accountId: string;
  isActive: boolean;
}) {
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const router = useRouter();

  async function patchAccount(body: { isActive?: boolean; resetSetup?: boolean }, success: string) {
    setBusyAction(success);
    const response = await fetch(`/api/admin/accounts/${accountId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const result = await response.json().catch(() => ({}));
    setBusyAction(null);
    if (!response.ok) {
      toast.error(result.error ?? "Account update failed");
      return;
    }
    toast.success(success);
    router.refresh();
  }

  return (
    <div className="flex flex-wrap gap-2">
      <button
        type="button"
        onClick={() => void patchAccount({ isActive: !isActive }, isActive ? "Account deactivated" : "Account activated")}
        disabled={!!busyAction}
        className="rounded-md border border-border px-3 py-2 text-sm font-medium"
      >
        {isActive ? "Deactivate" : "Reactivate"}
      </button>
      <button
        type="button"
        onClick={() => void patchAccount({ resetSetup: true }, "Setup reset")}
        disabled={!!busyAction}
        className="rounded-md border border-border px-3 py-2 text-sm font-medium"
      >
        Reset Setup
      </button>
    </div>
  );
}
