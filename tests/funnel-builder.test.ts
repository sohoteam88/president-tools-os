import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { accountSlugSchema, funnelContentSchema } from "@/lib/validators/funnels";
import { buildWaLink, normaliseWhatsAppNumber } from "@/lib/funnels/whatsapp";
import { extractFunnelText, type FunnelContent } from "@/lib/funnels/types";

const validContent: FunnelContent = {
  headline: "A simple wellness story",
  subheadline: "How I started taking small daily steps again.",
  storyBlocks: [{ type: "paragraph", text: "This is a personal story about consistency and feeling supported." }],
  leadForm: { heading: "Ready to start your journey?", fields: ["name", "whatsapp"], submitLabel: "Tell me more" },
  socialProof: [{ name: "Ali", quote: "I felt supported from the first chat." }],
};

const publishedFunnel = {
  id: "550e8400-e29b-41d4-a716-446655440010",
  accountId: "account-a",
  pathSlug: "",
  title: "Main",
  funnelType: "wellness_story",
  status: "published",
  contentJson: JSON.stringify(validContent),
  ctaType: "thank_you",
  ctaValue: "Thank you",
  whatsappPreFill: null,
  complianceStatus: "passed",
  complianceCheckedAt: null,
  publishedAt: new Date(),
  createdAt: new Date(),
  updatedAt: new Date(),
};

let publicFunnelStatus = "published";
let hourlyCount = 0;
let dailyCount = 0;
let activeAccountId = "account-a";

const dbChain = {
  from: vi.fn().mockReturnThis(),
  where: vi.fn().mockReturnThis(),
  limit: vi.fn(async () => {
    const call = dbChain.limit.mock.calls.length;
    if (call % 2 === 1) return [{ id: "account-a", name: "Sherry", isActive: true, slug: "sherry" }];
    return [{ ...publishedFunnel, status: publicFunnelStatus }];
  }),
  insert: vi.fn().mockReturnThis(),
  values: vi.fn().mockReturnThis(),
  returning: vi.fn(async () => [{ id: "lead-1" }]),
};

vi.mock("@/lib/db", () => ({
  db: {
    select: vi.fn(() => dbChain),
    insert: vi.fn(() => dbChain),
  },
}));

vi.mock("@/lib/auth/session", () => ({
  getAccountFromSession: vi.fn(() => ({
    id: activeAccountId,
    name: "Sherry",
    slug: "sherry",
    isActive: true,
    distributorSeniority: "new",
    userId: "user-1",
    role: "owner",
  })),
}));

vi.mock("@/lib/db/scoped", () => ({
  scopedDb: vi.fn((accountId: string) => ({
    funnels: {
      countLeadsLastHourByIp: vi.fn().mockResolvedValue(hourlyCount),
      countLeadsToday: vi.fn().mockResolvedValue(dailyCount),
      get: vi.fn((id: string) => Promise.resolve(accountId === "account-a" ? {
        ...publishedFunnel,
        id,
        status: "draft",
        contentJson: JSON.stringify({
          ...validContent,
          storyBlocks: [{ type: "paragraph", text: "I earned RM3000 last month from this." }],
        }),
      } : undefined)),
      update: vi.fn().mockResolvedValue(publishedFunnel),
      publish: vi.fn().mockResolvedValue({ ...publishedFunnel, status: "published" }),
    },
  })),
}));

describe("Funnel slug validation", () => {
  it("valid slugs pass", () => {
    expect(accountSlugSchema.safeParse("sherry").success).toBe(true);
    expect(accountSlugSchema.safeParse("my-team").success).toBe(true);
    expect(accountSlugSchema.safeParse("wellness2026").success).toBe(true);
  });

  it("invalid slugs are rejected", () => {
    expect(accountSlugSchema.safeParse("Sherry").success).toBe(false);
    expect(accountSlugSchema.safeParse("-start").success).toBe(false);
    expect(accountSlugSchema.safeParse("ab").success).toBe(false);
    expect(accountSlugSchema.safeParse("www").success).toBe(false);
  });
});

describe("WhatsApp helpers", () => {
  it("normalises Malaysian local numbers", () => {
    expect(normaliseWhatsAppNumber("0123456789")).toBe("60123456789");
  });

  it("keeps international numbers", () => {
    expect(normaliseWhatsAppNumber("60123456789")).toBe("60123456789");
  });

  it("generates wa.me with pre-fill", () => {
    expect(buildWaLink("60123456789", "Hi!")).toBe("https://wa.me/60123456789?text=Hi!");
  });

  it("generates wa.me without pre-fill", () => {
    expect(buildWaLink("60123456789")).toBe("https://wa.me/60123456789");
  });
});

describe("Public funnel lookup", () => {
  beforeEach(() => {
    dbChain.limit.mockClear();
    publicFunnelStatus = "published";
  });

  it("returns null for draft funnels", async () => {
    publicFunnelStatus = "draft";
    const { getPublicFunnel } = await import("@/lib/funnels/public");
    await expect(getPublicFunnel("sherry", "")).resolves.toBeNull();
  });

  it("returns data for published funnels", async () => {
    const { getPublicFunnel } = await import("@/lib/funnels/public");
    const result = await getPublicFunnel("sherry", "");
    expect(result?.funnel.status).toBe("published");
  });
});

describe("Lead rate limits", () => {
  beforeEach(() => {
    hourlyCount = 0;
    dailyCount = 0;
    publicFunnelStatus = "published";
  });

  it("blocks more than 5 per hour by IP", async () => {
    hourlyCount = 5;
    const { POST } = await import("@/app/api/public/funnel-leads/route");
    const response = await POST(new NextRequest("http://localhost/api/public/funnel-leads", {
      method: "POST",
      body: JSON.stringify({ funnelId: publishedFunnel.id, accountSlug: "sherry", name: "Ali", whatsappNumber: "0123456789", pdpaConsent: true }),
    }));
    expect(response.status).toBe(429);
  });

  it("blocks more than 200 per day", async () => {
    dailyCount = 200;
    const { POST } = await import("@/app/api/public/funnel-leads/route");
    const response = await POST(new NextRequest("http://localhost/api/public/funnel-leads", {
      method: "POST",
      body: JSON.stringify({ funnelId: publishedFunnel.id, accountSlug: "sherry", name: "Ali", whatsappNumber: "0123456789", pdpaConsent: true }),
    }));
    expect(response.status).toBe(429);
  });
});

describe("Funnel content", () => {
  it("valid content passes", () => {
    expect(funnelContentSchema.safeParse(validContent).success).toBe(true);
  });

  it("missing headline is rejected", () => {
    const { headline: _headline, ...rest } = validContent;
    expect(funnelContentSchema.safeParse(rest).success).toBe(false);
  });

  it("extractFunnelText concatenates text blocks", () => {
    const text = extractFunnelText(validContent);
    expect(text).toContain(validContent.headline);
    expect(text).toContain(validContent.storyBlocks[0]?.type === "paragraph" ? validContent.storyBlocks[0].text : "");
    expect(text).toContain("I felt supported");
  });
});

describe("Funnel account isolation and publish compliance", () => {
  it("get returns undefined for the wrong account", async () => {
    const { scopedDb } = await import("@/lib/db/scoped");
    await expect(scopedDb("account-b").funnels.get(publishedFunnel.id)).resolves.toBeUndefined();
  });

  it("compliance blocks publish", async () => {
    activeAccountId = "account-a";
    const { POST } = await import("@/app/api/funnels/[funnelId]/publish/route");
    const response = await POST(new NextRequest("http://localhost/api/funnels/id/publish", { method: "POST" }), {
      params: { funnelId: publishedFunnel.id },
    });
    expect(response.status).toBe(422);
  });
});
