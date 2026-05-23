import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { MOMENT_TYPE_LABELS, WHY_STORY_QUESTIONS, type ContentDraftSeed } from "@/lib/voice/types";
import { recordAnswerAudio } from "@/lib/voice/why-story";
import { saveDailyCapture } from "@/lib/voice/daily-capture";
import { compileWeeklyForAccount } from "@/lib/voice/weekly-compile";
import { shouldRebuildVoiceProfile } from "@/lib/voice/profile";

const state = vi.hoisted(() => ({
  session: {
    id: "sess-1",
    accountId: "acct-1",
    status: "recording",
    audioKeys: [] as string[],
    transcripts: [] as string[],
    draftMoments: [] as Array<{ questionIndex: number; rawText: string; momentType: string; extracted: string }>,
  },
  moments: [] as Array<{ id: string; rawText: string; momentType: string; createdAt: Date }>,
  savedMoment: null as Record<string, unknown> | null,
  weeklySeeds: [] as ContentDraftSeed[],
  accountCreatedAt: new Date(Date.now() - 31 * 86_400_000),
  confirmedCount: 10,
  exportCount: 3,
}));

vi.mock("@/lib/auth/session", () => ({
  getAccountFromSession: vi.fn(() => ({ id: "acct-1", userId: "user-1", name: "A", role: "owner" })),
}));

vi.mock("@/lib/db/scoped", () => ({
  scopedDb: vi.fn((accountId: string) => {
    if (!accountId) throw new Error("accountId is required");
    return {
      voice: {
        abandonRecordingWhyStorySessions: vi.fn(() => Promise.resolve()),
        createWhyStorySession: vi.fn(() => Promise.resolve({ ...state.session, id: "sess-1" })),
        getWhyStorySession: vi.fn(() => Promise.resolve({ ...state.session, accountId })),
        updateWhyStorySession: vi.fn((_id: string, patch: Record<string, unknown>) => {
          Object.assign(state.session, patch);
          return Promise.resolve({ ...state.session });
        }),
        createJourneyMoment: vi.fn((data: Record<string, unknown>) => {
          state.savedMoment = { ...data, accountId, id: "moment-1" };
          return Promise.resolve(state.savedMoment);
        }),
        createJourneyMoments: vi.fn((rows: Record<string, unknown>[]) => {
          state.savedMoment = rows[0] ?? null;
          return Promise.resolve(rows.map((row, index) => ({ ...row, id: `moment-${index}` })));
        }),
        listRecentConfirmedMoments: vi.fn(() => Promise.resolve(state.moments)),
        upsertWeeklySeeds: vi.fn((_weekStart: string, seeds: ContentDraftSeed[]) => {
          state.weeklySeeds = seeds;
          return Promise.resolve();
        }),
        getWeeklySeeds: vi.fn(() => Promise.resolve({ seeds: state.weeklySeeds })),
        listConfirmedMoments: vi.fn(() => Promise.resolve([])),
        countConfirmedMoments: vi.fn(() => Promise.resolve(state.confirmedCount)),
      },
      content: {
        countExports: vi.fn(() => Promise.resolve(state.exportCount)),
      },
    };
  }),
  adminDb: {
    accounts: {
      getById: vi.fn(() => Promise.resolve({ id: "acct-1", createdAt: state.accountCreatedAt })),
      listAll: vi.fn(() => Promise.resolve([{ id: "acct-1" }])),
    },
  },
}));

beforeEach(() => {
  state.session.status = "recording";
  state.session.audioKeys = [];
  state.session.transcripts = [];
  state.session.draftMoments = [];
  state.moments = [];
  state.savedMoment = null;
  state.weeklySeeds = [];
  state.accountCreatedAt = new Date(Date.now() - 31 * 86_400_000);
  state.confirmedCount = 10;
  state.exportCount = 3;
});

describe("Voice remediation", () => {
  it("WHY_STORY_QUESTIONS has exactly 5 questions", () => {
    expect(WHY_STORY_QUESTIONS).toHaveLength(5);
  });

  it("MOMENT_TYPE_LABELS covers all 5 categories", () => {
    expect(Object.keys(MOMENT_TYPE_LABELS).sort()).toEqual([
      "challenge_overcome",
      "lifestyle_glimpse",
      "mindset_shift",
      "product_experience",
      "success_story",
    ]);
  });

  it("recordAnswerAudio rejects keys outside the account why-story prefix", async () => {
    await expect(recordAnswerAudio("acct-1", "sess-1", 0, "captures/acct-2/why-story/a.webm")).rejects.toThrow("Invalid audio key prefix");
  });

  it("recordAnswerAudio stores the answer key at the question index", async () => {
    await recordAnswerAudio("acct-1", "sess-1", 2, "captures/acct-1/why-story/sess-1/2.webm");
    expect(state.session.audioKeys[2]).toBe("captures/acct-1/why-story/sess-1/2.webm");
  });

  it("saveDailyCapture rejects text shorter than 10 characters", async () => {
    await expect(saveDailyCapture("acct-1", "short")).rejects.toThrow("too short");
  });

  it("saveDailyCapture rejects text longer than 2000 characters", async () => {
    await expect(saveDailyCapture("acct-1", "a".repeat(2001))).rejects.toThrow("too long");
  });

  it("daily captures are auto-confirmed", async () => {
    await saveDailyCapture("acct-1", "Today I helped someone and learned something useful.");
    expect(state.savedMoment?.source).toBe("daily_capture");
    expect(state.savedMoment?.confirmedAt).toBeInstanceOf(Date);
  });

  it("shouldRebuildVoiceProfile returns false before account age 30 days", async () => {
    state.accountCreatedAt = new Date(Date.now() - 10 * 86_400_000);
    await expect(shouldRebuildVoiceProfile("acct-1")).resolves.toBe(false);
  });

  it("shouldRebuildVoiceProfile requires 10 confirmed moments", async () => {
    state.confirmedCount = 9;
    await expect(shouldRebuildVoiceProfile("acct-1")).resolves.toBe(false);
  });

  it("shouldRebuildVoiceProfile requires 3 content exports", async () => {
    state.exportCount = 2;
    await expect(shouldRebuildVoiceProfile("acct-1")).resolves.toBe(false);
  });

  it("shouldRebuildVoiceProfile passes only when all three conditions are met", async () => {
    await expect(shouldRebuildVoiceProfile("acct-1")).resolves.toBe(true);
  });

  it("compileWeeklyForAccount skips accounts with zero moments", async () => {
    await expect(compileWeeklyForAccount("acct-1")).resolves.toBe(false);
  });

  it("compileWeeklyForAccount stores exactly 5 seeds", async () => {
    state.moments = [{ id: "moment-1", rawText: "I showed up consistently this week.", momentType: "mindset_shift", createdAt: new Date() }];
    await expect(compileWeeklyForAccount("acct-1")).resolves.toBe(true);
    expect(state.weeklySeeds).toHaveLength(5);
    expect(state.weeklySeeds[0]?.momentId).toBe("moment-1");
  });

  it("vercel weekly compile cron is Sunday 01:00 UTC", () => {
    const config = JSON.parse(readFileSync("vercel.json", "utf8")) as { crons: Array<{ path: string; schedule: string }> };
    expect(config.crons.find((cron) => cron.path === "/api/crons/weekly-compile")?.schedule).toBe("0 1 * * 0");
  });
});
