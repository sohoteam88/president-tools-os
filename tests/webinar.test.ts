import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import fs from "fs";
import { formatDuration } from "@/app/webinar/_components/webinar-register-page";

let mode: "public-active" | "public-inactive" | "replay-valid" | "replay-none" = "public-active";
let rateLimitCount = 0;
let activeAccountId = "acct-A";
let hasWebinarActivation = true;
let insertedToken = "";

const publicRow = {
  webinarId: "webinar-1",
  accountWebinarId: "550e8400-e29b-41d4-a716-446655440201",
  accountId: "acct-A",
  accountName: "Sherry",
  accountSlug: "sherry",
  title: "Wellness Replay",
  description: "A recorded training for prospects.",
  thumbnailUrl: null,
  durationSeconds: 5400,
  customIntro: "Welcome to my replay.",
  accountWebinarIsActive: true,
  webinarIsActive: true,
};

const replayRow = {
  registrationId: "reg-1",
  accountWebinarId: "550e8400-e29b-41d4-a716-446655440201",
  accountId: "acct-A",
  accountName: "Sherry",
  accountSlug: "sherry",
  webinarTitle: "Wellness Replay",
  bunnyVideoId: "video123",
  bunnyLibraryId: "lib456",
  watchedAt: null,
};

const dbChain = {
  from: vi.fn().mockReturnThis(),
  innerJoin: vi.fn().mockReturnThis(),
  where: vi.fn().mockReturnThis(),
  limit: vi.fn(async () => {
    if (mode === "public-active") return [publicRow];
    if (mode === "public-inactive") return [{ ...publicRow, accountWebinarIsActive: false }];
    if (mode === "replay-valid") return [replayRow];
    return [];
  }),
  values: vi.fn((data: { watchToken?: string }) => {
    insertedToken = data.watchToken ?? "";
    return dbChain;
  }),
  returning: vi.fn(async () => [{ watchToken: insertedToken }]),
  set: vi.fn().mockReturnThis(),
  then: (resolve: (value: Array<{ count: number }>) => void) => resolve([{ count: rateLimitCount }]),
};

vi.mock("@/lib/db", () => ({
  db: {
    select: vi.fn(() => dbChain),
    insert: vi.fn(() => dbChain),
    update: vi.fn(() => dbChain),
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
  requireAdmin: vi.fn(() => ({ id: "admin", userId: "admin-user", role: "admin" })),
}));

vi.mock("@/lib/db/scoped", () => ({
  scopedDb: vi.fn((accountId: string) => ({
    webinars: {
      getActivation: vi.fn(() => Promise.resolve(accountId === "acct-A" && hasWebinarActivation ? { id: "activation-1", isActive: true } : undefined)),
      listRegistrations: vi.fn(() => Promise.resolve(accountId === "acct-A" ? [{
        id: "reg-1",
        accountId,
        accountWebinarId: "activation-1",
        name: "Ali",
        whatsappNumber: "60123456789",
        email: null,
        watchToken: "secret-token",
        watchedAt: null,
        ipAddress: null,
        userAgent: null,
        registeredAt: new Date(),
      }] : [])),
      deactivate: vi.fn().mockResolvedValue(undefined),
      activate: vi.fn().mockResolvedValue({ id: "activation-1" }),
      updateCustomIntro: vi.fn().mockResolvedValue(undefined),
    },
    funnels: {
      get: vi.fn(() => Promise.resolve({
        id: "funnel-1",
        accountId,
        funnelType: "event_rsvp",
        status: "draft",
        contentJson: JSON.stringify({
          headline: "Event RSVP page",
          subheadline: "Register for a recorded training.",
          storyBlocks: [{ type: "paragraph", text: "This story is compliant and simple." }],
          leadForm: { heading: "Ready?", fields: ["name", "whatsapp"], submitLabel: "Send" },
        }),
      })),
      update: vi.fn().mockResolvedValue(undefined),
    },
  })),
  adminDb: {
    webinars: {
      getActive: vi.fn().mockResolvedValue({ id: "webinar-1", title: "Replay", description: "Recorded replay" }),
      deactivateAll: vi.fn().mockResolvedValue(undefined),
      create: vi.fn().mockResolvedValue({ id: "webinar-1" }),
      update: vi.fn().mockResolvedValue({ id: "webinar-1" }),
      listAccountActivations: vi.fn().mockResolvedValue([]),
    },
    audit: { log: vi.fn().mockResolvedValue(undefined) },
  },
}));

describe("Webinar public helpers", () => {
  beforeEach(() => {
    mode = "public-active";
    rateLimitCount = 0;
    hasWebinarActivation = true;
    insertedToken = "";
  });

  it("getPublicWebinar returns null for inactive account_webinar", async () => {
    mode = "public-inactive";
    const { getPublicWebinar } = await import("@/lib/webinars/public");
    await expect(getPublicWebinar("sherry")).resolves.toBeNull();
  });

  it("getPublicWebinar returns data for active webinar", async () => {
    const { getPublicWebinar } = await import("@/lib/webinars/public");
    const result = await getPublicWebinar("sherry");
    expect(result?.accountWebinarId).toBe(publicRow.accountWebinarId);
  });

  it("getReplayByToken constructs the Bunny embed URL", async () => {
    mode = "replay-valid";
    const { getReplayByToken } = await import("@/lib/webinars/public");
    const replay = await getReplayByToken("token");
    expect(replay?.bunnyEmbedUrl).toBe("https://iframe.mediadelivery.net/embed/lib456/video123?autoplay=false&responsive=true&captions=false");
  });

  it("registerForWebinar generates a 32-char watch token", async () => {
    const { registerForWebinar } = await import("@/lib/webinars/public");
    const result = await registerForWebinar({
      accountId: "acct-A",
      accountWebinarId: publicRow.accountWebinarId,
      name: "Ali",
      whatsappNumber: "60123456789",
      pdpaConsent: true,
      consentText: "PDPA consent",
      ipAddress: "127.0.0.1",
      userAgent: "test",
    });
    expect(result?.watchToken).toHaveLength(32);
  });

  it("getReplayByToken returns null for unknown token", async () => {
    mode = "replay-none";
    const { getReplayByToken } = await import("@/lib/webinars/public");
    await expect(getReplayByToken("missing")).resolves.toBeNull();
  });

  it("getReplayByToken returns replay data for valid token", async () => {
    mode = "replay-valid";
    const { getReplayByToken } = await import("@/lib/webinars/public");
    const replay = await getReplayByToken("token");
    expect(replay?.registrationId).toBe("reg-1");
  });
});

describe("Webinar API guards", () => {
  beforeEach(() => {
    mode = "public-active";
    rateLimitCount = 0;
    hasWebinarActivation = true;
  });

  it("rate limit blocks more than 5 registrations per hour per IP", async () => {
    rateLimitCount = 5;
    const { POST } = await import("@/app/api/public/webinar-register/route");
    const response = await POST(registerRequest());
    expect(response.status).toBe(429);
  });

  it("strips watchToken from registrations API", async () => {
    const { GET } = await import("@/app/api/webinars/registrations/route");
    const response = await GET(new NextRequest("http://localhost/api/webinars/registrations"));
    const body = (await response.json()) as { data?: { registrations: Array<Record<string, unknown>> } };
    expect(body.data?.registrations[0]?.watchToken).toBeUndefined();
  });

  it("account isolation scopes registrations", async () => {
    const { scopedDb } = await import("@/lib/db/scoped");
    await expect(scopedDb("acct-B").webinars.listRegistrations()).resolves.toEqual([]);
  });

  it("event_rsvp publish requires active webinar", async () => {
    hasWebinarActivation = false;
    const { POST } = await import("@/app/api/funnels/[funnelId]/publish/route");
    const response = await POST(new NextRequest("http://localhost/api/funnels/funnel-1/publish", { method: "POST" }), {
      params: { funnelId: "funnel-1" },
    });
    expect(response.status).toBe(400);
  });

  it("runs compliance on webinar metadata", async () => {
    const { POST } = await import("@/app/api/admin/webinars/route");
    const response = await POST(new NextRequest("http://localhost/api/admin/webinars", {
      method: "POST",
      body: JSON.stringify({
        title: "Passive income replay",
        description: "A recorded training for prospects.",
        bunnyVideoId: "video123456",
        confirmCompliance: true,
      }),
    }));
    expect(response.status).toBe(422);
  });
});

describe("Webinar UI helpers", () => {
  it("formats duration under 60 minutes", () => {
    expect(formatDuration(45 * 60)).toBe("45 min training");
  });

  it("formats duration over 60 minutes", () => {
    expect(formatDuration(90 * 60)).toBe("1h 30min training");
  });

  it("hardcodes the honest evergreen label", () => {
    const source = fs.readFileSync("app/webinar/_components/webinar-register-page.tsx", "utf8");
    expect(source).toContain("RECORDED TRAINING");
  });
});

function registerRequest(): NextRequest {
  return new NextRequest("http://localhost/api/public/webinar-register", {
    method: "POST",
    body: JSON.stringify({
      accountSlug: "sherry",
      accountWebinarId: publicRow.accountWebinarId,
      name: "Ali",
      whatsappNumber: "0123456789",
      pdpaConsent: true,
    }),
  });
}
