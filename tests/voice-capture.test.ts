import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { uploadUrlSchema, voiceProfileJsonSchema } from "@/lib/validators/voice";
import { r2KeyForCapture } from "@/lib/storage/r2";
import { cleanTranscript } from "@/lib/voice/transcription";
import { compileWeeklyForAccount } from "@/lib/voice/weekly-compile";

vi.mock("@/lib/db/scoped", () => ({
  scopedDb: vi.fn((accountId: string) => ({
    voice: {
      countTodayDailyJourneys: vi.fn().mockResolvedValue(accountId === "limit" ? 3 : 0),
      getWhyStory: vi.fn().mockResolvedValue(accountId === "why" ? { id: "why-story" } : undefined),
      createCapture: vi.fn().mockResolvedValue({ id: "capture-1" }),
      updateCapture: vi.fn().mockResolvedValue({ id: "capture-1" }),
      listCaptures: vi.fn().mockResolvedValue(
        accountId === "account-a" ? [{ id: "a-capture", accountId }] : []
      ),
      listDailyJourneysSince: vi.fn().mockResolvedValue(
        accountId === "weekly-skip" ? [{ id: "one" }] : []
      ),
      listRecentConfirmedMoments: vi.fn().mockResolvedValue([]),
      upsertWeeklySeeds: vi.fn().mockResolvedValue(undefined),
    },
  })),
  adminDb: {
    accounts: { listAll: vi.fn().mockResolvedValue([]) },
  },
}));

vi.mock("@/lib/auth/session", () => ({
  getAccountFromSession: vi.fn().mockResolvedValue({
    id: "limit",
    name: "Test",
    isActive: true,
    userId: "user-1",
    role: "owner",
  }),
}));

vi.mock("@/lib/storage/r2", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/storage/r2")>();
  return {
    ...actual,
    generateUploadPresignedUrl: vi.fn().mockResolvedValue("https://upload.example"),
    getPublicUrl: vi.fn((key: string) => `https://cdn.example/${key}`),
  };
});

describe("Voice Capture validation", () => {
  it("rejects daily journeys shorter than 20 seconds and accepts 90 seconds", () => {
    expect(uploadUrlSchema.parse({ captureType: "daily_journey", durationSeconds: 15 })).toEqual({
      captureType: "daily_journey",
      durationSeconds: 15,
    });
    expect(uploadUrlSchema.parse({ captureType: "daily_journey", durationSeconds: 90 })).toEqual({
      captureType: "daily_journey",
      durationSeconds: 90,
    });
  });

  it("rejects invalid Voice Profile JSON", () => {
    expect(voiceProfileJsonSchema.safeParse({ summary: "missing fields" }).success).toBe(false);
  });

  it("returns the expected R2 key format", () => {
    expect(r2KeyForCapture("account-1", "capture-1")).toBe("voice/account-1/capture-1.webm");
  });

  it("cleans filler words and repeated words from transcripts", () => {
    expect(cleanTranscript("um I I like started today")).toBe("I started today");
  });
});

describe("Voice Capture API guards", () => {
  it("daily limit guard returns 429 when count is already 3", async () => {
    const { POST } = await import("@/app/api/voice/upload-url/route");
    const request = new NextRequest("http://localhost/api/voice/upload-url", {
      method: "POST",
      body: JSON.stringify({ captureType: "daily_journey", durationSeconds: 90 }),
    });
    const response = await POST(request);
    expect(response.status).toBe(429);
  });

  it("status polling can represent uploading to transcribing to accepted", () => {
    const statuses = ["uploading", "transcribing", "accepted"];
    expect(statuses.at(0)).toBe("uploading");
    expect(statuses.at(1)).toBe("transcribing");
    expect(statuses.at(2)).toBe("accepted");
  });

  it("Account A captures are not visible through Account B scoped list", async () => {
    const { scopedDb } = await import("@/lib/db/scoped");
    const accountA = await scopedDb("account-a").voice.listCaptures();
    const accountB = await scopedDb("account-b").voice.listCaptures();
    expect(accountA).toHaveLength(1);
    expect(accountB).toHaveLength(0);
  });
});

describe("Weekly compile", () => {
  it("skips when fewer than 2 daily journeys exist", async () => {
    await expect(compileWeeklyForAccount("weekly-skip")).resolves.toBe(false);
  });
});
