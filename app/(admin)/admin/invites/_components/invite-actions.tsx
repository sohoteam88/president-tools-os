"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

export function InviteActions({ accounts }: { accounts: { id: string; name: string }[] }) {
  const [email, setEmail] = useState("");
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const [inviteUrl, setInviteUrl] = useState("");
  const [isSending, setIsSending] = useState(false);
  const router = useRouter();

  async function sendInvite(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSending(true);
    const response = await fetch("/api/accounts/invite", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, accountId }),
    });
    const body = await response.json().catch(() => ({}));
    setIsSending(false);
    if (!response.ok) {
      toast.error(body.error ?? "Invite failed");
      return;
    }
    setInviteUrl(body.inviteUrl);
    setEmail("");
    toast.success("Invite created");
    router.refresh();
  }

  async function copyInvite() {
    if (!inviteUrl) return;
    await navigator.clipboard.writeText(inviteUrl);
    toast.success("Invite link copied");
  }

  return (
    <form onSubmit={sendInvite} className="grid gap-3 rounded-md border border-border bg-card p-4 md:grid-cols-[1fr_1fr_auto]">
      <input
        type="email"
        required
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        placeholder="new.member@example.com"
        className="rounded-md border border-input bg-background px-3 py-2 text-sm"
      />
      <select
        value={accountId}
        onChange={(event) => setAccountId(event.target.value)}
        className="rounded-md border border-input bg-background px-3 py-2 text-sm"
      >
        {accounts.map((account) => (
          <option key={account.id} value={account.id}>
            {account.name}
          </option>
        ))}
      </select>
      <button
        type="submit"
        disabled={!accountId || isSending}
        className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
      >
        {isSending ? "Sending..." : "Send Invite"}
      </button>
      {inviteUrl ? (
        <div className="md:col-span-3 flex items-center gap-2 rounded-md bg-muted px-3 py-2 text-xs">
          <span className="min-w-0 flex-1 truncate">{inviteUrl}</span>
          <button type="button" onClick={copyInvite} className="rounded border border-border bg-background px-2 py-1">
            Copy
          </button>
        </div>
      ) : null}
    </form>
  );
}

export function RevokeInviteButton({ token }: { token: string }) {
  const [isRevoking, setIsRevoking] = useState(false);
  const router = useRouter();

  async function revoke() {
    setIsRevoking(true);
    const response = await fetch(`/api/accounts/invite/${token}`, { method: "DELETE" });
    const body = await response.json().catch(() => ({}));
    setIsRevoking(false);
    if (!response.ok) {
      toast.error(body.error ?? "Could not revoke invite");
      return;
    }
    toast.success("Invite revoked");
    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={revoke}
      disabled={isRevoking}
      className="rounded-md border border-red-200 px-2.5 py-1.5 text-xs font-medium text-red-700 disabled:opacity-50"
    >
      {isRevoking ? "Revoking..." : "Revoke"}
    </button>
  );
}
