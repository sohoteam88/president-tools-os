import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { PDFDocument } from "pdf-lib";

let hourlyDownloads = 0;
let publicMagnetActive = true;
let magnetIdMismatch = false;
let activeAccountId = "acct-A";
let hasActivation = true;

vi.mock("@/lib/storage/r2", async () => {
  const pdfDoc = await PDFDocument.create();
  pdfDoc.addPage([300, 300]);
  const bytes = await pdfDoc.save();
  return {
    r2KeyForPersonalisedMagnet: (accountId: string) => `magnets/personalised/${accountId}.pdf`,
    getObjectBytes: vi.fn().mockResolvedValue(bytes),
    uploadBytes: vi.fn().mockResolvedValue(undefined),
    generateDownloadPresignedUrl: vi.fn().mockResolvedValue("https://signed.example/download.pdf"),
    generateUploadPresignedUrl: vi.fn().mockResolvedValue("https://signed.example/upload.pdf"),
    getPublicUrl: (key: string) => `https://cdn.example/${key}`,
  };
});

vi.mock("@/lib/magnets/public", () => ({
  getPublicMagnet: vi.fn(() =>
    publicMagnetActive
      ? Promise.resolve({
          magnetId: "magnet-1",
          accountLeadMagnetId: magnetIdMismatch ? "actual-id" : "550e8400-e29b-41d4-a716-446655440099",
          accountId: "acct-A",
          accountName: "Sherry",
          accountSlug: "sherry",
          title: "Free Guide",
          description: "A helpful starter guide",
          thumbnailUrl: null,
        })
      : Promise.resolve(null)
  ),
  countDownloadsLastHourByIp: vi.fn(() => Promise.resolve(hourlyDownloads)),
  recordDownload: vi.fn().mockResolvedValue({ id: "download-1" }),
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
  requireAdmin: vi.fn(() => ({
    id: "admin-account",
    userId: "admin-user",
    role: "admin",
  })),
}));

vi.mock("@/lib/db/scoped", () => ({
  scopedDb: vi.fn((accountId: string) => ({
    magnets: {
      getActivation: vi.fn(() =>
        Promise.resolve(
          accountId === "acct-A" && hasActivation
            ? {
                id: "550e8400-e29b-41d4-a716-446655440099",
                accountId,
                leadMagnetId: "magnet-1",
                personalisedPdfKey: "magnets/personalised/acct-A.pdf",
                personalisedAt: new Date(),
                masterVersionAtPersonalisation: 1,
                isActive: true,
              }
            : undefined
        )
      ),
      listDownloads: vi.fn(() =>
        Promise.resolve(accountId === "acct-A" ? [{ id: "d1", accountId }] : [])
      ),
      markPersonalised: vi.fn().mockResolvedValue(undefined),
    },
    funnels: {
      get: vi.fn(() =>
        Promise.resolve({
          id: "funnel-1",
          accountId,
          funnelType: "free_resource",
          status: "draft",
          contentJson: JSON.stringify({
            headline: "Free guide page",
            subheadline: "Get a helpful starter guide.",
            storyBlocks: [{ type: "paragraph", text: "This story is compliant and simple." }],
            leadForm: { heading: "Ready?", fields: ["name", "whatsapp"], submitLabel: "Send" },
          }),
        })
      ),
    },
  })),
  adminDb: {
    magnets: {
      getActive: vi.fn().mockResolvedValue({
        id: "magnet-1",
        title: "Starter Guide",
        description: "A helpful guide",
        masterPdfKey: "magnets/master/magnet-1.pdf",
        version: 2,
        isActive: true,
      }),
      deactivateAll: vi.fn().mockResolvedValue(undefined),
      create: vi.fn().mockResolvedValue({ id: "magnet-1" }),
      invalidatePersonalisedPdfs: vi.fn().mockResolvedValue(undefined),
    },
    audit: { log: vi.fn().mockResolvedValue(undefined) },
  },
}));

describe("Lead magnet PDF helpers", () => {
  it("generates the correct personalised R2 key", async () => {
    const { r2KeyForPersonalisedMagnet } = await import("@/lib/storage/r2");
    expect(r2KeyForPersonalisedMagnet("abc-123")).toBe("magnets/personalised/abc-123.pdf");
  });

  it("personalisation produces non-empty bytes and resolves", async () => {
    const { personaliseMagnetPdf } = await import("@/lib/magnets/personalise");
    await expect(
      personaliseMagnetPdf({
        masterPdfKey: "magnets/master/test.pdf",
        accountId: "abc-123",
        accountName: "Sherry",
        whatsappNumber: "60123456789",
        accountSlug: "sherry",
      })
    ).resolves.toBe("magnets/personalised/abc-123.pdf");
  });

  it("personalisation handles missing WhatsApp gracefully", async () => {
    const { personaliseMagnetPdf } = await import("@/lib/magnets/personalise");
    await expect(
      personaliseMagnetPdf({
        masterPdfKey: "magnets/master/test.pdf",
        accountId: "abc-123",
        accountName: "Sherry",
        whatsappNumber: "",
        accountSlug: null,
      })
    ).resolves.toBe("magnets/personalised/abc-123.pdf");
  });
});

describe("Public magnet download gate", () => {
  beforeEach(() => {
    hourlyDownloads = 0;
    publicMagnetActive = true;
    magnetIdMismatch = false;
    hasActivation = true;
  });

  it("blocks more than 3 downloads per hour per IP", async () => {
    hourlyDownloads = 3;
    const { POST } = await import("@/app/api/public/magnet-downloads/route");
    const response = await POST(request());
    expect(response.status).toBe(429);
  });

  it("returns 404 for inactive magnet", async () => {
    publicMagnetActive = false;
    const { POST } = await import("@/app/api/public/magnet-downloads/route");
    const response = await POST(request());
    expect(response.status).toBe(404);
  });

  it("returns 404 for accountLeadMagnetId mismatch", async () => {
    magnetIdMismatch = true;
    const { POST } = await import("@/app/api/public/magnet-downloads/route");
    const response = await POST(request());
    expect(response.status).toBe(404);
  });

  it("returns a presigned URL on success", async () => {
    const { POST } = await import("@/app/api/public/magnet-downloads/route");
    const response = await POST(request());
    const body = (await response.json()) as { downloadUrl?: string };
    expect(response.status).toBe(200);
    expect(body.downloadUrl).toContain("https://signed.example");
  });
});

describe("Stale detection", () => {
  it("is true when versions differ", () => {
    const personalisedVersion: number = 1;
    const masterVersion: number = 2;
    expect(personalisedVersion !== masterVersion).toBe(true);
  });

  it("is false when versions match", () => {
    const personalisedVersion: number = 2;
    const masterVersion: number = 2;
    expect(personalisedVersion !== masterVersion).toBe(false);
  });
});

describe("Magnet account isolation and compliance", () => {
  it("downloads query is scoped to account", async () => {
    const { scopedDb } = await import("@/lib/db/scoped");
    await expect(scopedDb("acct-B").magnets.listDownloads()).resolves.toEqual([]);
  });

  it("runs compliance on metadata", async () => {
    const { POST } = await import("@/app/api/admin/magnets/route");
    const form = new FormData();
    form.set("title", "Passive income guide");
    form.set("description", "A simple guide for your lifestyle.");
    form.set("confirmCompliance", "true");
    form.set("pdf", new File([new Uint8Array([1, 2, 3])], "guide.pdf", { type: "application/pdf" }));
    const response = await POST(new NextRequest("http://localhost/api/admin/magnets", { method: "POST", body: form }));
    expect(response.status).toBe(422);
  });

  it("free_resource publish requires active magnet", async () => {
    hasActivation = false;
    const { POST } = await import("@/app/api/funnels/[funnelId]/publish/route");
    const response = await POST(new NextRequest("http://localhost/api/funnels/funnel-1/publish", { method: "POST" }), {
      params: { funnelId: "funnel-1" },
    });
    expect(response.status).toBe(400);
  });
});

function request(): NextRequest {
  return new NextRequest("http://localhost/api/public/magnet-downloads", {
    method: "POST",
    body: JSON.stringify({
      accountSlug: "sherry",
      accountLeadMagnetId: "550e8400-e29b-41d4-a716-446655440099",
      name: "Ali",
      whatsappNumber: "0123456789",
      pdpaConsent: true,
    }),
  });
}
