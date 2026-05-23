import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { buildContentPrompt } from "@/lib/content/prompt-builder";
import { runComplianceFilter } from "@/lib/compliance/filter";
import { computeSimilarity, isModifiedEnough, tokenize } from "@/lib/compliance/modification";

const accountDrafts = {
  "account-a": {
    id: "550e8400-e29b-41d4-a716-446655440001",
    accountId: "account-a",
    generatedDraft: "hello world foo",
    userDraft: "hello world bar",
    complianceStatus: "passed",
    modificationScore: 0.5,
  },
  "not-compliant": {
    id: "550e8400-e29b-41d4-a716-446655440002",
    accountId: "not-compliant",
    generatedDraft: "draft",
    userDraft: "edited",
    complianceStatus: "flagged",
    modificationScore: 0.5,
  },
  "not-modified": {
    id: "550e8400-e29b-41d4-a716-446655440003",
    accountId: "not-modified",
    generatedDraft: "draft",
    userDraft: "draft",
    complianceStatus: "passed",
    modificationScore: 0.95,
  },
};

let activeAccountId = "account-a";

vi.mock("@/lib/auth/session", () => ({
  getAccountFromSession: vi.fn(() => ({
    id: activeAccountId,
    name: "Test",
    isActive: true,
    userId: "user-1",
    role: "owner",
  })),
}));

vi.mock("@/lib/db/scoped", () => ({
  scopedDb: vi.fn((accountId: keyof typeof accountDrafts | string) => ({
    content: {
      getDraft: vi.fn((id: string) => {
        const draft = accountDrafts[accountId as keyof typeof accountDrafts];
        return Promise.resolve(draft?.id === id ? draft : undefined);
      }),
      updateDraft: vi.fn().mockResolvedValue(undefined),
      listDrafts: vi.fn().mockResolvedValue([]),
      logCompliance: vi.fn().mockResolvedValue(undefined),
    },
    audit: {
      log: vi.fn().mockResolvedValue(undefined),
    },
  })),
}));

const basePromptContext = {
  platform: "facebook" as const,
  contentType: "lifestyle_story",
  userTopic: "",
  voiceProfile: null,
  whyStoryTranscript: null,
  recentJourneyTranscripts: [],
  accountName: "Steven",
  distributorSeniority: "new",
};

describe("Content prompt builder", () => {
  it("Layer 7 absent contains No Voice Profile", () => {
    expect(buildContentPrompt(basePromptContext)).toContain("No Voice Profile");
  });

  it("includes all 9 layer markers", () => {
    const prompt = buildContentPrompt(basePromptContext);
    for (let layer = 1; layer <= 9; layer += 1) {
      expect(prompt).toContain(`Layer ${layer}`);
    }
  });
});

describe("Compliance filter", () => {
  it("Layer 1 catches income claims", async () => {
    const result = await runComplianceFilter("I earned RM3000 last month", "a", "d");
    expect(result.passed).toBe(false);
    expect(result.flags[0]?.code).toBe("INCOME_CLAIM");
  });

  it("Layer 1 lets clean lifestyle text through", async () => {
    const result = await runComplianceFilter("Today I had a nice walk with my team and felt encouraged.", "a", "d");
    expect(result.flags.some((flag) => flag.layer === 1)).toBe(false);
  });

  it("Layer 2 catches numeric weight claims", async () => {
    const result = await runComplianceFilter("I lost 15kg after starting this routine.", "a", "d");
    expect(result.flags[0]?.code).toMatch(/WEIGHT|NUMERIC/);
  });

  it("Layer 4 catches missing disclosure", async () => {
    const result = await runComplianceFilter("My product results gave me more energy.", "a", "d");
    expect(result.flags[0]?.code).toBe("MISSING_DISCLOSURE");
  });

  it("Layer 4 passes when no trigger words are present", async () => {
    const result = await runComplianceFilter("I met friends for coffee and felt supported.", "a", "d");
    expect(result.passed).toBe(true);
  });
});

describe("Modification rule", () => {
  it("identical text has similarity 1.0 and is not modified enough", () => {
    expect(computeSimilarity("hello world foo", "hello world foo")).toBe(1);
    expect(isModifiedEnough("hello world foo", "hello world foo")).toBe(false);
  });

  it("50% changed is modified enough", () => {
    expect(computeSimilarity("hello world foo", "hello world bar")).toBeCloseTo(0.5);
    expect(isModifiedEnough("hello world foo", "hello world bar")).toBe(true);
  });

  it("empty strings return similarity 0 and are modified enough", () => {
    expect(computeSimilarity("", "")).toBe(0);
    expect(isModifiedEnough("", "")).toBe(true);
  });

  it("Jaccard similarity known example equals 0.5", () => {
    const a = tokenize("hello world foo");
    const b = tokenize("hello world bar");
    const intersection = [...a].filter((word) => b.has(word)).length;
    const union = new Set([...a, ...b]).size;
    expect(intersection / union).toBe(0.5);
  });
});

describe("Content export guard", () => {
  it("returns 403 if compliance did not pass", async () => {
    activeAccountId = "not-compliant";
    const { POST } = await import("@/app/api/content/export/route");
    const response = await POST(
      new NextRequest("http://localhost/api/content/export", {
        method: "POST",
        body: JSON.stringify({ draftId: accountDrafts["not-compliant"].id }),
      })
    );
    expect(response.status).toBe(403);
  });

  it("returns 403 if modification score is too high", async () => {
    activeAccountId = "not-modified";
    const { POST } = await import("@/app/api/content/export/route");
    const response = await POST(
      new NextRequest("http://localhost/api/content/export", {
        method: "POST",
        body: JSON.stringify({ draftId: accountDrafts["not-modified"].id }),
      })
    );
    expect(response.status).toBe(403);
  });

  it("getDraft with wrong accountId returns undefined", async () => {
    const { scopedDb } = await import("@/lib/db/scoped");
    await expect(
      scopedDb("account-b").content.getDraft(accountDrafts["account-a"].id)
    ).resolves.toBeUndefined();
  });
});
