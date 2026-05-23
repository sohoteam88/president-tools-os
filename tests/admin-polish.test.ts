import { describe, expect, it, beforeEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { NextRequest } from "next/server";
import { EmptyState } from "@/app/(app)/_components/empty-state";

const state = vi.hoisted(() => ({
  invite: {
    id: "invite-1",
    token: "tok-1",
    email: "member@example.com",
    accountId: "acct-1",
    acceptedAt: null as Date | null,
  },
  deletedToken: "",
  accountPatch: null as Record<string, unknown> | null,
  auditActions: [] as string[],
}));

vi.mock("@/lib/auth/session", () => ({
  requireAdmin: vi.fn(() => ({ userId: "admin-1", userEmail: "steven@example.com", name: "Steven" })),
}));

vi.mock("@/lib/db/scoped", () => ({
  adminDb: {
    invites: {
      findByToken: vi.fn(() => Promise.resolve(state.invite)),
      deleteByToken: vi.fn((token: string) => {
        state.deletedToken = token;
        return Promise.resolve();
      }),
      listAllWithAccounts: vi.fn(() => Promise.resolve([{
        id: "invite-1",
        token: "tok-1",
        email: "member@example.com",
        role: "owner",
        expiresAt: new Date(Date.now() + 60_000),
        acceptedAt: null,
        createdAt: new Date(),
        account: { id: "acct-1", name: "A", slug: "a" },
      }])),
    },
    accounts: {
      update: vi.fn((_id: string, patch: Record<string, unknown>) => {
        state.accountPatch = patch;
        return Promise.resolve({ id: "acct-1", name: "A", isActive: patch.isActive ?? true });
      }),
      getById: vi.fn(() => Promise.resolve({ id: "acct-1", name: "A", isActive: true })),
      getStats: vi.fn(() => Promise.resolve({
        voiceCaptures: 1,
        contentDrafts: 2,
        funnels: 3,
        contacts: 4,
        magnetDownloads: 5,
        webinarRegistrations: 6,
        adEntries: 7,
      })),
    },
    audit: {
      log: vi.fn((entry: { action: string }) => {
        state.auditActions.push(entry.action);
        return Promise.resolve();
      }),
      listForAccount: vi.fn(() => Promise.resolve([])),
    },
    usage: {
      getOverview: vi.fn(() => Promise.resolve({
        tokenUsage: {
          coach: { promptTokens: 10, completionTokens: 5 },
          adInsights: { promptTokens: 8, completionTokens: 4 },
          contentStudio: null,
          voiceCapture: null,
        },
        adoption: {
          totalAccounts: 2,
          voiceCapture: 1,
          contentStudio: 1,
          funnels: 1,
          contacts: 2,
          leadMagnets: 1,
          webinars: 1,
          adInsights: 1,
        },
        recentActivity: [],
      })),
    },
  },
}));

beforeEach(() => {
  state.invite.acceptedAt = null;
  state.deletedToken = "";
  state.accountPatch = null;
  state.auditActions = [];
});

function source(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

function request(body: unknown) {
  return new NextRequest("http://localhost/api/test", {
    method: "PATCH",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

describe("admin final polish", () => {
  it("invite revoke blocks used invite", async () => {
    state.invite.acceptedAt = new Date();
    const { DELETE } = await import("@/app/api/accounts/invite/[token]/route");
    const response = await DELETE(new NextRequest("http://localhost"), { params: { token: "tok-1" } });
    expect(response.status).toBe(400);
    expect(state.deletedToken).toBe("");
  });

  it("invite revoke removes pending invite", async () => {
    const { DELETE } = await import("@/app/api/accounts/invite/[token]/route");
    const response = await DELETE(new NextRequest("http://localhost"), { params: { token: "tok-1" } });
    expect(response.status).toBe(200);
    expect(state.deletedToken).toBe("tok-1");
    expect(state.auditActions).toContain("invite.revoked");
  });

  it("account deactivate sets inactive", async () => {
    const { PATCH } = await import("@/app/api/admin/accounts/[accountId]/route");
    const response = await PATCH(request({ isActive: false }), { params: { accountId: "acct-1" } });
    expect(response.status).toBe(200);
    expect(state.accountPatch).toMatchObject({ isActive: false });
  });

  it("reset setup clears completed timestamp", async () => {
    const { PATCH } = await import("@/app/api/admin/accounts/[accountId]/route");
    await PATCH(request({ resetSetup: true }), { params: { accountId: "acct-1" } });
    expect(state.accountPatch).toMatchObject({ setupWizardCompletedAt: null });
  });

  it("usage stats shape includes tokens, adoption, and activity", async () => {
    const { GET } = await import("@/app/api/admin/usage/route");
    const response = await GET();
    const body = await response.json();
    expect(body.tokenUsage.coach.promptTokens).toBe(10);
    expect(body.adoption.totalAccounts).toBe(2);
    expect(Array.isArray(body.recentActivity)).toBe(true);
  });

  it("toast success on stage move is wired", () => {
    expect(source("app/(app)/contacts/_components/contact-card.tsx")).toContain("toast.success");
  });

  it("toast error on API failure is wired", () => {
    expect(source("app/(app)/contacts/_components/contact-card.tsx")).toContain("toast.error");
  });

  it("EmptyState renders when list empty", () => {
    const element = EmptyState({ title: "No rows", description: "Start here." });
    expect(element.props.children[0].props.children).toBe("No rows");
  });

  it("loading.tsx component renders", async () => {
    const Loading = (await import("@/app/(app)/dashboard/loading")).default;
    const element = Loading();
    expect(element.props.children.type.name).toBe("SkeletonList");
  });

  it("security headers include X-Frame-Options", async () => {
    const config = (await import("../next.config.mjs")).default;
    const headers = await config.headers?.();
    expect(headers?.[0]?.headers).toContainEqual({ key: "X-Frame-Options", value: "DENY" });
  });

  it("coach widget uses MYT date not UTC", () => {
    expect(source("app/(app)/dashboard/page.tsx")).toContain("getMytDateString()");
  });

  it("admin nav contains all 7 links", () => {
    const layout = source("app/(admin)/layout.tsx");
    for (const label of ["Dashboard", "Accounts", "Invites", "Lead Magnet", "Webinar", "Objections", "Usage"]) {
      expect(layout).toContain(label);
    }
  });

  it("global 404 renders", () => {
    expect(source("app/not-found.tsx")).toContain("Page not found");
  });

  it("dashboard stats sums pipeline stages", () => {
    const dashboard = source("app/(app)/dashboard/page.tsx");
    expect(dashboard).toContain("Object.values(stageCounts).reduce");
    expect(dashboard).toContain("contactsTotal");
  });
});
