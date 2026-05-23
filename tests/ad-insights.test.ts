import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { AdEntrySchema, PLATFORMS } from "@/lib/validators/ads";
import { buildOcrUpdates, extractStatsFromScreenshot } from "@/lib/ads/ocr";
import type { AdAnalysis, AdEntry } from "@/lib/db/schema/ads";

const state = vi.hoisted(() => ({
  entries: [] as AdEntry[],
  analysis: undefined as AdAnalysis | undefined,
  analyseCalls: 0,
  deleteObject: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({
  getAccountFromSession: vi.fn(() => ({ id: "acct-A", name: "Sherry", slug: "sherry", role: "owner" })),
  getServerAccount: vi.fn(() => ({ id: "acct-A", name: "Sherry", slug: "sherry", role: "owner" })),
}));

vi.mock("@/lib/storage/r2", () => ({
  deleteObject: state.deleteObject,
  generateUploadPresignedUrl: vi.fn((key: string) => Promise.resolve(`https://r2.example/${key}`)),
  getObjectBytes: vi.fn(() => Promise.resolve(new Uint8Array([1, 2, 3]))),
}));

vi.mock("@/lib/ads/analyse", () => ({
  analyseAdPerformance: vi.fn(() => {
    state.analyseCalls++;
    return Promise.resolve({ text: "Your Facebook story posts are working.", promptTokens: 10, completionTokens: 20 });
  }),
}));

vi.mock("@/lib/db/scoped", () => ({
  scopedDb: vi.fn((accountId: string) => ({
    ads: {
      list: vi.fn((opts?: { limit?: number }) => Promise.resolve(
        state.entries.filter((entry) => entry.accountId === accountId).slice(0, opts?.limit ?? 100)
      )),
      get: vi.fn((entryId: string) => Promise.resolve(
        state.entries.find((entry) => entry.accountId === accountId && entry.id === entryId)
      )),
      create: vi.fn((data: Partial<AdEntry>) => {
        const entry = makeEntry({ ...data, accountId });
        state.entries.push(entry);
        return Promise.resolve(entry);
      }),
      update: vi.fn((entryId: string, data: Partial<AdEntry>) => {
        const entry = state.entries.find((item) => item.accountId === accountId && item.id === entryId);
        if (!entry) return Promise.resolve(undefined);
        Object.assign(entry, data, { updatedAt: new Date() });
        return Promise.resolve(entry);
      }),
      delete: vi.fn(async (entryId: string) => {
        const entry = state.entries.find((item) => item.accountId === accountId && item.id === entryId);
        if (entry?.screenshotKey) await state.deleteObject(entry.screenshotKey);
        state.entries = state.entries.filter((item) => !(item.accountId === accountId && item.id === entryId));
      }),
      count: vi.fn(() => Promise.resolve(state.entries.filter((entry) => entry.accountId === accountId).length)),
      getAnalysis: vi.fn(() => Promise.resolve(state.analysis)),
      upsertAnalysis: vi.fn((data: Omit<AdAnalysis, "id" | "accountId">) => {
        state.analysis = { id: "analysis-1", accountId, ...data };
        return Promise.resolve();
      }),
    },
  })),
}));

beforeEach(() => {
  state.entries.length = 0;
  state.analysis = undefined;
  state.analyseCalls = 0;
  state.deleteObject.mockClear();
  vi.restoreAllMocks();
});

describe("Ad Insights", () => {
  it("defines all 5 platforms", () => {
    expect(PLATFORMS).toHaveLength(5);
    expect(PLATFORMS).toContain("whatsapp_status");
  });

  it("accepts a valid complete ad entry", () => {
    const parsed = AdEntrySchema.safeParse({
      platform: "facebook",
      postedAt: "2026-05-21",
      captionPreview: "A practical morning routine",
      reach: 1200,
      likes: 50,
      comments: 10,
      saves: 4,
      shares: 2,
      dmsReceived: 3,
      leadsGenerated: 1,
      linkClicks: 7,
      notes: "Story post worked.",
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects negative reach", () => {
    expect(AdEntrySchema.safeParse({ platform: "facebook", postedAt: "2026-05-21", reach: -1 }).success).toBe(false);
  });

  it("rejects invalid dates", () => {
    expect(AdEntrySchema.safeParse({ platform: "facebook", postedAt: "21/05/2026" }).success).toBe(false);
  });

  it("does not overwrite manual OCR fields", () => {
    const updates = buildOcrUpdates(makeEntry({ likes: 50 }), {
      stats: { likes: 60 },
      confidence: "high",
    });
    expect(updates.likes).toBeUndefined();
  });

  it("fills null OCR fields", () => {
    const updates = buildOcrUpdates(makeEntry({ reach: null }), {
      stats: { reach: 1200 },
      confidence: "high",
    });
    expect(updates.reach).toBe(1200);
  });

  it("returns null when GPT OCR fails", async () => {
    const previous = process.env.OPENAI_API_KEY;
    process.env.OPENAI_API_KEY = "sk-test";
    vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new Error("network"))));
    await expect(extractStatsFromScreenshot("abc")).resolves.toBeNull();
    process.env.OPENAI_API_KEY = previous;
  });

  it("accepts screenshot keys scoped to the account", async () => {
    state.entries.push(makeEntry({ id: "entry-1", accountId: "acct-A" }));
    const { POST } = await import("@/app/api/ads/[entryId]/confirm-screenshot/route");
    const response = await POST(jsonRequest({ key: "ad-screenshots/acct-A/entry-1.jpg" }), { params: { entryId: "entry-1" } });
    expect(response.status).toBe(200);
  });

  it("rejects screenshot keys from another account", async () => {
    state.entries.push(makeEntry({ id: "entry-1", accountId: "acct-A" }));
    const { POST } = await import("@/app/api/ads/[entryId]/confirm-screenshot/route");
    const response = await POST(jsonRequest({ key: "ad-screenshots/acct-B/entry-1.jpg" }), { params: { entryId: "entry-1" } });
    expect(response.status).toBe(400);
  });

  it("blocks analysis with fewer than 3 entries", async () => {
    state.entries.push(makeEntry({ id: "entry-1" }), makeEntry({ id: "entry-2" }));
    const { POST } = await import("@/app/api/ads/analysis/route");
    const response = await POST();
    expect(response.status).toBe(400);
  });

  it("runs analysis with 3 or more entries", async () => {
    state.entries.push(makeEntry({ id: "entry-1" }), makeEntry({ id: "entry-2" }), makeEntry({ id: "entry-3" }));
    const { POST } = await import("@/app/api/ads/analysis/route");
    const response = await POST();
    expect(response.status).toBe(200);
    expect(state.analyseCalls).toBe(1);
    expect(state.analysis?.entriesAnalysed).toBe(3);
  });

  it("returns cached analysis without rerunning Haiku", async () => {
    state.analysis = {
      id: "analysis-1",
      accountId: "acct-A",
      analysisText: "Cached result",
      entriesAnalysed: 3,
      analysedAt: new Date(),
      promptTokens: 1,
      completionTokens: 1,
    };
    const { GET } = await import("@/app/api/ads/analysis/route");
    const response = await GET();
    expect(response.status).toBe(200);
    expect(state.analyseCalls).toBe(0);
  });

  it("scopes entries to the account", async () => {
    state.entries.push(makeEntry({ accountId: "acct-B" }));
    const { scopedDb } = await import("@/lib/db/scoped");
    await expect(scopedDb("acct-A").ads.list()).resolves.toEqual([]);
  });

  it("deletes screenshots from R2 when deleting entries", async () => {
    state.entries.push(makeEntry({ id: "entry-1", screenshotKey: "ad-screenshots/acct-A/entry-1.jpg" }));
    const { DELETE } = await import("@/app/api/ads/[entryId]/route");
    const response = await DELETE(new NextRequest("http://localhost/api/ads/entry-1", { method: "DELETE" }), { params: { entryId: "entry-1" } });
    expect(response.status).toBe(200);
    expect(state.deleteObject).toHaveBeenCalledWith("ad-screenshots/acct-A/entry-1.jpg");
  });
});

function makeEntry(overrides: Partial<AdEntry> = {}): AdEntry {
  return {
    id: overrides.id ?? `entry-${state.entries.length + 1}`,
    accountId: overrides.accountId ?? "acct-A",
    platform: overrides.platform ?? "facebook",
    contentDraftId: overrides.contentDraftId ?? null,
    captionPreview: overrides.captionPreview ?? "A practical story post",
    postedAt: overrides.postedAt ?? "2026-05-21",
    reach: overrides.reach ?? null,
    likes: overrides.likes ?? null,
    comments: overrides.comments ?? null,
    saves: overrides.saves ?? null,
    shares: overrides.shares ?? null,
    dmsReceived: overrides.dmsReceived ?? null,
    leadsGenerated: overrides.leadsGenerated ?? null,
    linkClicks: overrides.linkClicks ?? null,
    screenshotKey: overrides.screenshotKey ?? null,
    ocrExtractedStats: overrides.ocrExtractedStats ?? null,
    ocrConfidence: overrides.ocrConfidence ?? null,
    notes: overrides.notes ?? null,
    createdAt: overrides.createdAt ?? new Date(),
    updatedAt: overrides.updatedAt ?? new Date(),
  };
}

function jsonRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/ads", {
    method: "POST",
    body: JSON.stringify(body),
  });
}
