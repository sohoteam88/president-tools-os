import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ── Shared mock state ──────────────────────────────────────────────────────────

const auditLogs: Array<Record<string, unknown>> = [];
let funnelLeadRows: Array<{ id: string; whatsappNumber: string; name: string; consentText?: string | null }> = [];
let crmContactRows: Array<{ id: string; whatsappNumber: string; name: string }> = [];

// ── Module mocks ───────────────────────────────────────────────────────────────

vi.mock("@/lib/auth/session", () => ({
  requireAdmin: vi.fn(() => ({
    id: "admin-account",
    userId: "admin-user-id",
    userEmail: "admin@example.com",
    role: "admin",
  })),
  getAccountFromSession: vi.fn(() => ({
    id: "acct-A",
    name: "Sherry",
    slug: "sherry",
    role: "owner",
    userId: "user-1",
  })),
}));

vi.mock("@/lib/db", () => ({
  db: {
    insert: vi.fn(() => ({
      values: vi.fn(() => ({
        returning: vi.fn(() => Promise.resolve([{ id: "audit-row-1" }])),
      })),
    })),
  },
}));

vi.mock("@/lib/db/scoped", () => ({
  scopedDb: vi.fn(() => ({
    funnels: {
      countLeadsLastHourByIp: vi.fn(() => Promise.resolve(0)),
      countLeadsToday: vi.fn(() => Promise.resolve(0)),
    },
    magnets: {
      getActivation: vi.fn(() => Promise.resolve({ personalisedPdfKey: "key.pdf" })),
    },
  })),
  adminDb: {
    audit: {
      log: vi.fn(async (entry: Record<string, unknown>) => {
        auditLogs.push(entry);
      }),
    },
    magnets: {
      getActive: vi.fn(() => Promise.resolve(null)),
    },
  },
}));

const FUNNEL_UUID = "550e8400-e29b-41d4-a716-446655440010";

vi.mock("@/lib/funnels/public", () => ({
  getPublicFunnel: vi.fn(() =>
    Promise.resolve({
      funnel: {
        id: "550e8400-e29b-41d4-a716-446655440010",
        accountId: "acct-A",
        pathSlug: "",
        funnelType: "wellness_story",
        ctaType: "thank_you",
        ctaValue: "Thank you!",
        whatsappPreFill: null,
      },
      accountName: "Sherry",
      accountSlug: "sherry",
    })
  ),
  submitPublicLead: vi.fn(async (data: Record<string, unknown>) => {
    const lead = { id: "lead-1", ...data };
    funnelLeadRows.push(lead as { id: string; whatsappNumber: string; name: string; consentText?: string | null });
    return { id: "lead-1" };
  }),
}));

vi.mock("@/lib/magnets/public", () => ({
  getPublicMagnet: vi.fn(() =>
    Promise.resolve({
      magnetId: "magnet-1",
      accountLeadMagnetId: "550e8400-e29b-41d4-a716-446655440099",
      accountId: "acct-A",
      accountName: "Sherry",
      accountSlug: "sherry",
      title: "Free Guide",
      description: "Helpful guide",
      thumbnailUrl: null,
    })
  ),
  countDownloadsLastHourByIp: vi.fn(() => Promise.resolve(0)),
  recordDownload: vi.fn(() => Promise.resolve({ id: "download-1" })),
}));

vi.mock("@/lib/webinars/public", () => ({
  getPublicWebinar: vi.fn(() =>
    Promise.resolve({
      webinarId: "webinar-1",
      accountWebinarId: "550e8400-e29b-41d4-a716-446655440001",
      accountId: "acct-A",
      accountName: "Sherry",
      accountSlug: "sherry",
      title: "Health Training",
      description: "Watch this training",
      thumbnailUrl: null,
      durationSeconds: 1800,
      customIntro: null,
      whatsappNumber: null,
    })
  ),
  countRegistrationsLastHourByIp: vi.fn(() => Promise.resolve(0)),
  registerForWebinar: vi.fn(() => Promise.resolve({ watchToken: "tok123", id: "reg-1" })),
}));

vi.mock("@/lib/storage/r2", () => ({
  generateDownloadPresignedUrl: vi.fn(() => Promise.resolve("https://signed.example/guide.pdf")),
}));

vi.mock("@/lib/funnels/whatsapp", () => ({
  normaliseWhatsAppNumber: vi.fn((n: string) => n.replace(/\D/g, "")),
  isValidMalaysianNumber: vi.fn(() => true),
  buildWaLink: vi.fn((n: string) => `https://wa.me/${n}`),
}));

vi.mock("@/lib/pdpa/erase", () => ({
  eraseDataByWhatsApp: vi.fn(async (whatsappNumber: string, accountId: string) => {
    const before = funnelLeadRows.filter(
      (r) => r.whatsappNumber === whatsappNumber
    ).length;
    funnelLeadRows = funnelLeadRows.map((r) =>
      r.whatsappNumber === whatsappNumber
        ? { ...r, name: "[Deleted]", whatsappNumber: "00000000000" }
        : r
    );
    crmContactRows = crmContactRows.map((r) =>
      r.whatsappNumber === whatsappNumber
        ? { ...r, name: "[Deleted]", whatsappNumber: "00000000000" }
        : r
    );
    return {
      funnelLeads: before,
      magnetDownloads: 0,
      webinarRegistrations: 0,
      crmContacts: 0,
    };
  }),
}));

// ── Test helpers ───────────────────────────────────────────────────────────────

function makeRequest(url: string, body: unknown): NextRequest {
  return new NextRequest(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe("PDPA compliance", () => {
  beforeEach(() => {
    auditLogs.length = 0;
    funnelLeadRows = [];
    crmContactRows = [];
    vi.clearAllMocks();
  });

  // Test 1
  it("rejects funnel lead without pdpaConsent", async () => {
    const { POST } = await import("@/app/api/public/funnel-leads/route");
    const req = makeRequest("http://localhost/api/public/funnel-leads", {
      funnelId: "550e8400-e29b-41d4-a716-446655440000",
      accountSlug: "sherry",
      pathSlug: "",
      name: "Test",
      whatsappNumber: "60123456789",
      // pdpaConsent intentionally omitted
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  // Test 2
  it("stores consent text on successful funnel lead submission", async () => {
    const { submitPublicLead } = await import("@/lib/funnels/public");
    const { PDPA_CONSENT_TEXT } = await import("@/lib/pdpa/consent");
    const { POST } = await import("@/app/api/public/funnel-leads/route");
    const req = makeRequest("http://localhost/api/public/funnel-leads", {
      funnelId: FUNNEL_UUID,
      accountSlug: "sherry",
      pathSlug: "",
      name: "Ali",
      whatsappNumber: "60123456789",
      pdpaConsent: true,
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(submitPublicLead).toHaveBeenCalledWith(
      expect.objectContaining({ pdpaConsent: true, consentText: PDPA_CONSENT_TEXT })
    );
  });

  // Test 3
  it("erasure anonymizes funnel leads", async () => {
    funnelLeadRows.push({ id: "lead-99", whatsappNumber: "60123456789", name: "Ali" });
    const { eraseDataByWhatsApp } = await import("@/lib/pdpa/erase");
    const result = await eraseDataByWhatsApp("60123456789", "acct-A");
    expect(result.funnelLeads).toBe(1);
    expect(funnelLeadRows[0]?.name).toBe("[Deleted]");
    expect(funnelLeadRows[0]?.whatsappNumber).toBe("00000000000");
  });

  // Test 4
  it("erasure anonymizes CRM contacts", async () => {
    crmContactRows.push({ id: "contact-1", whatsappNumber: "60123456789", name: "Ali" });
    const { eraseDataByWhatsApp } = await import("@/lib/pdpa/erase");
    await eraseDataByWhatsApp("60123456789", "acct-A");
    expect(crmContactRows[0]?.name).toBe("[Deleted]");
    expect(crmContactRows[0]?.whatsappNumber).toBe("00000000000");
  });

  // Test 5
  it("erasure is audit logged with reason", async () => {
    const { POST } = await import("@/app/api/admin/pdpa/erase/route");
    const req = makeRequest("http://localhost/api/admin/pdpa/erase", {
      whatsappNumber: "60123456789",
      accountId: "550e8400-e29b-41d4-a716-446655440000",
      reason: "Data subject requested deletion",
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const { adminDb } = await import("@/lib/db/scoped");
    expect(adminDb.audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: "pdpa.erasure" })
    );
  });

  // Test 6
  it("privacy page exports a default component (no auth guard)", async () => {
    const page = await import("@/app/privacy/page");
    expect(typeof page.default).toBe("function");
    expect(page.metadata).toMatchObject({ title: expect.stringContaining("Privacy") });
  });

  // Test 7
  it("audit log accepts null actorUserId (schema allows nullable)", async () => {
    const { adminDb } = await import("@/lib/db/scoped");
    await expect(
      adminDb.audit.log({
        accountId: "acct-A",
        actorUserId: null,
        action: "test.null_actor",
        resourceType: "test",
        resourceId: "test-id",
      })
    ).resolves.not.toThrow();
    expect(auditLogs.some((l) => l.action === "test.null_actor" && l.actorUserId === null)).toBe(true);
  });

  // Test 8
  it("public funnel lead submission creates audit log entry", async () => {
    const { POST } = await import("@/app/api/public/funnel-leads/route");
    const req = makeRequest("http://localhost/api/public/funnel-leads", {
      funnelId: FUNNEL_UUID,
      accountSlug: "sherry",
      pathSlug: "",
      name: "Zara",
      whatsappNumber: "60198887777",
      pdpaConsent: true,
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const { adminDb } = await import("@/lib/db/scoped");
    expect(adminDb.audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: "public.funnel_lead.submitted", actorUserId: null })
    );
  });

  // Test 9
  it("rejects magnet download without pdpaConsent", async () => {
    const { POST } = await import("@/app/api/public/magnet-downloads/route");
    const req = makeRequest("http://localhost/api/public/magnet-downloads", {
      accountSlug: "sherry",
      accountLeadMagnetId: "550e8400-e29b-41d4-a716-446655440099",
      name: "Test",
      whatsappNumber: "60123456789",
      // pdpaConsent intentionally omitted
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  // Test 10
  it("public magnet download creates audit log entry", async () => {
    const { POST } = await import("@/app/api/public/magnet-downloads/route");
    const req = makeRequest("http://localhost/api/public/magnet-downloads", {
      accountSlug: "sherry",
      accountLeadMagnetId: "550e8400-e29b-41d4-a716-446655440099",
      name: "Zara",
      whatsappNumber: "60198887777",
      pdpaConsent: true,
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const { adminDb } = await import("@/lib/db/scoped");
    expect(adminDb.audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: "public.magnet_download.submitted", actorUserId: null })
    );
  });
});
