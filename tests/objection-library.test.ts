import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { OBJECTION_CATEGORIES, type ObjectionCategory } from "@/lib/objections/types";
import { ResponseSchema } from "@/lib/validators/objections";
import { checkResponseCompliance } from "@/lib/objections/check";
import { parseDraftedResponses } from "@/lib/objections/draft";
import type { AccountObjectionResponse, ObjectionResponse } from "@/lib/db/schema/objections";
import type { ContentDraft } from "@/lib/db/schema/content";

const state = vi.hoisted(() => ({
  master: [] as ObjectionResponse[],
  personal: [] as AccountObjectionResponse[],
  favourites: new Set<string>(),
  drafts: [] as ContentDraft[],
  published: [] as string[],
}));

vi.mock("@/lib/auth/session", () => ({
  getAccountFromSession: vi.fn(() => ({
    id: "acct-A",
    name: "Sherry",
    userId: "user-1",
    userEmail: "s@example.com",
    role: "owner",
  })),
  requireAdmin: vi.fn(() => ({
    id: "acct-A",
    name: "Sherry",
    userId: "admin-user",
    userEmail: "admin@example.com",
    role: "admin",
  })),
}));

vi.mock("@/lib/objections/library", () => ({
  getPublishedResponses: vi.fn((category?: ObjectionCategory) => Promise.resolve(
    state.master.filter((response) => response.isPublished && (!category || response.category === category))
  )),
}));

vi.mock("@/lib/db/scoped", () => ({
  scopedDb: vi.fn((accountId: string) => ({
    objections: {
      listFavouriteIds: vi.fn(() => Promise.resolve([...state.favourites])),
      addFavourite: vi.fn((responseId: string) => {
        state.favourites.add(responseId);
        return Promise.resolve();
      }),
      removeFavourite: vi.fn((responseId: string) => {
        state.favourites.delete(responseId);
        return Promise.resolve();
      }),
      listPersonal: vi.fn((category?: ObjectionCategory) => Promise.resolve(
        state.personal.filter((response) => response.accountId === accountId && (!category || response.category === category))
      )),
      createPersonal: vi.fn((data: Partial<AccountObjectionResponse>) => {
        const response = personalResponse({ ...data, accountId });
        state.personal.push(response);
        return Promise.resolve(response);
      }),
      updatePersonal: vi.fn((id: string, data: Partial<AccountObjectionResponse>) => {
        const response = state.personal.find((item) => item.accountId === accountId && item.id === id);
        if (!response) return Promise.resolve(undefined);
        Object.assign(response, data);
        return Promise.resolve(response);
      }),
      deletePersonal: vi.fn((id: string) => {
        state.personal = state.personal.filter((item) => !(item.accountId === accountId && item.id === id));
        return Promise.resolve();
      }),
    },
    content: {
      createDraft: vi.fn((data: Partial<ContentDraft>) => {
        const draft = contentDraft({ ...data, accountId });
        state.drafts.push(draft);
        return Promise.resolve(draft);
      }),
    },
  })),
  adminDb: {
    objections: {
      get: vi.fn((id: string) => Promise.resolve(state.master.find((response) => response.id === id))),
      listAll: vi.fn(() => Promise.resolve(state.master)),
      create: vi.fn((data: Partial<ObjectionResponse>) => {
        const response = masterResponse(data);
        state.master.push(response);
        return Promise.resolve(response);
      }),
      update: vi.fn((id: string, data: Partial<ObjectionResponse>) => {
        const response = state.master.find((item) => item.id === id);
        if (!response) return Promise.resolve(undefined);
        Object.assign(response, data);
        return Promise.resolve(response);
      }),
      delete: vi.fn((id: string) => {
        state.master = state.master.filter((item) => item.id !== id);
        return Promise.resolve();
      }),
      publish: vi.fn((id: string) => {
        const response = state.master.find((item) => item.id === id);
        if (response) {
          response.isPublished = true;
          state.published.push(id);
        }
        return Promise.resolve();
      }),
      unpublish: vi.fn((id: string) => {
        const response = state.master.find((item) => item.id === id);
        if (response) response.isPublished = false;
        return Promise.resolve();
      }),
      setComplianceResult: vi.fn(() => Promise.resolve()),
    },
  },
}));

beforeEach(() => {
  state.master.length = 0;
  state.personal.length = 0;
  state.favourites.clear();
  state.drafts.length = 0;
  state.published.length = 0;
});

describe("Objection Library", () => {
  it("defines all 5 categories", () => {
    expect(OBJECTION_CATEGORIES).toHaveLength(5);
    expect(OBJECTION_CATEGORIES).toContain("mlm_concern");
  });

  it("accepts a valid response", () => {
    expect(ResponseSchema.safeParse({
      category: "price",
      title: "A calm answer",
      responseText: "I understand why you feel that way, and I would rather share my own experience calmly than pressure you into a decision.",
      tone: "empathetic",
    }).success).toBe(true);
  });

  it("rejects responses that are too short", () => {
    expect(ResponseSchema.safeParse({
      category: "price",
      title: "Short",
      responseText: "Short",
      tone: "logical",
    }).success).toBe(false);
  });

  it("rejects responses that are too long", () => {
    expect(ResponseSchema.safeParse({
      category: "price",
      title: "Too long",
      responseText: "x".repeat(501),
      tone: "story",
    }).success).toBe(false);
  });

  it("flags income claims during compliance check", async () => {
    const result = await checkResponseCompliance("You can earn extra income quickly if you join this business.", "Income answer");
    expect(result.passed).toBe(false);
  });

  it("passes clean personal-story responses", async () => {
    const result = await checkResponseCompliance(
      "I understand your concern. In my experience, it helped to ask questions calmly and decide at my own pace without pressure.",
      "Clean answer"
    );
    expect(result.passed).toBe(true);
  });

  it("blocks publish when compliance has not passed", async () => {
    state.master.push(masterResponse({ id: "response-1", complianceStatus: "pending" }));
    const { POST } = await import("@/app/api/admin/objections/[responseId]/publish/route");
    const response = await POST(new Request("http://localhost/api/admin/objections/response-1/publish", { method: "POST" }), { params: { responseId: "response-1" } });
    expect(response.status).toBe(422);
  });

  it("allows publish after compliance passes", async () => {
    state.master.push(masterResponse({ id: "response-1", complianceStatus: "passed" }));
    const { POST } = await import("@/app/api/admin/objections/[responseId]/publish/route");
    const response = await POST(new Request("http://localhost/api/admin/objections/response-1/publish", { method: "POST" }), { params: { responseId: "response-1" } });
    expect(response.status).toBe(200);
    expect(state.published).toContain("response-1");
  });

  it("adds favourites without duplicate errors", async () => {
    const { POST } = await import("@/app/api/objections/favourites/route");
    const request = jsonRequest({ responseId: "550e8400-e29b-41d4-a716-446655440000", action: "add" });
    const response = await POST(request);
    expect(response.status).toBe(200);
    expect(state.favourites.has("550e8400-e29b-41d4-a716-446655440000")).toBe(true);
  });

  it("removes favourites", async () => {
    state.favourites.add("550e8400-e29b-41d4-a716-446655440000");
    const { POST } = await import("@/app/api/objections/favourites/route");
    const response = await POST(jsonRequest({ responseId: "550e8400-e29b-41d4-a716-446655440000", action: "remove" }));
    expect(response.status).toBe(200);
    expect(state.favourites.size).toBe(0);
  });

  it("saves flagged personal responses privately", async () => {
    const { POST } = await import("@/app/api/objections/personal/route");
    const response = await POST(jsonRequest({
      category: "mlm_concern",
      title: "Flagged personal",
      responseText: "You can earn extra income quickly if you join this business and share it with your friends.",
      tone: "logical",
    }));
    const body = (await response.json()) as { response?: AccountObjectionResponse };
    expect(response.status).toBe(201);
    expect(body.response?.complianceStatus).toBe("flagged");
  });

  it("scopes personal responses to the current account", async () => {
    state.personal.push(personalResponse({ accountId: "acct-B" }));
    const { scopedDb } = await import("@/lib/db/scoped");
    await expect(scopedDb("acct-A").objections.listPersonal()).resolves.toEqual([]);
  });

  it("creates a content draft from an objection response", async () => {
    state.master.push(masterResponse({ id: "550e8400-e29b-41d4-a716-446655440001", complianceStatus: "passed", isPublished: true }));
    const { POST } = await import("@/app/api/objections/[responseId]/use-as-content/route");
    const response = await POST(jsonRequest({ responseType: "master" }), { params: { responseId: "550e8400-e29b-41d4-a716-446655440001" } });
    const body = (await response.json()) as { draftId?: string };
    expect(response.status).toBe(200);
    expect(body.draftId).toBeTruthy();
  });

  it("parses three AI draft options", () => {
    const drafts = parseDraftedResponses(JSON.stringify([
      { title: "A", responseText: "x".repeat(60), tone: "empathetic" },
      { title: "B", responseText: "y".repeat(60), tone: "logical" },
      { title: "C", responseText: "z".repeat(60), tone: "story" },
    ]));
    expect(drafts).toHaveLength(3);
  });

  it("filters published responses by category", async () => {
    state.master.push(
      masterResponse({ category: "price", isPublished: true }),
      masterResponse({ category: "time", isPublished: true })
    );
    const { getPublishedResponses } = await import("@/lib/objections/library");
    const responses = await getPublishedResponses("price");
    expect(responses.every((response) => response.category === "price")).toBe(true);
  });
});

function masterResponse(overrides: Partial<ObjectionResponse> = {}): ObjectionResponse {
  return {
    id: overrides.id ?? `master-${state.master.length + 1}`,
    category: overrides.category ?? "price",
    title: overrides.title ?? "A calm response",
    responseText: overrides.responseText ?? "I understand your concern, and I would rather share my own experience calmly than pressure you into any decision.",
    tone: overrides.tone ?? "empathetic",
    complianceStatus: overrides.complianceStatus ?? "passed",
    complianceFlags: overrides.complianceFlags ?? null,
    isPublished: overrides.isPublished ?? true,
    sortOrder: overrides.sortOrder ?? 0,
    createdBy: overrides.createdBy ?? null,
    createdAt: overrides.createdAt ?? new Date(),
    updatedAt: overrides.updatedAt ?? new Date(),
  };
}

function personalResponse(overrides: Partial<AccountObjectionResponse> = {}): AccountObjectionResponse {
  return {
    id: overrides.id ?? `personal-${state.personal.length + 1}`,
    accountId: overrides.accountId ?? "acct-A",
    category: overrides.category ?? "price",
    title: overrides.title ?? "My response",
    responseText: overrides.responseText ?? "I understand your concern, and I would rather share my own experience calmly than pressure you into any decision.",
    tone: overrides.tone ?? "empathetic",
    complianceStatus: overrides.complianceStatus ?? "passed",
    complianceFlags: overrides.complianceFlags ?? null,
    createdAt: overrides.createdAt ?? new Date(),
    updatedAt: overrides.updatedAt ?? new Date(),
  };
}

function contentDraft(overrides: Partial<ContentDraft> = {}): ContentDraft {
  return {
    id: overrides.id ?? `draft-${state.drafts.length + 1}`,
    accountId: overrides.accountId ?? "acct-A",
    platform: overrides.platform ?? "facebook",
    contentType: overrides.contentType ?? "objection_response",
    userTopic: overrides.userTopic ?? null,
    generatedDraft: overrides.generatedDraft ?? "Seed",
    userDraft: overrides.userDraft ?? null,
    complianceStatus: overrides.complianceStatus ?? "pending",
    complianceFlags: overrides.complianceFlags ?? null,
    modificationScore: overrides.modificationScore ?? null,
    voiceProfileVersion: overrides.voiceProfileVersion ?? null,
    exportedAt: overrides.exportedAt ?? null,
    createdAt: overrides.createdAt ?? new Date(),
    updatedAt: overrides.updatedAt ?? new Date(),
  };
}

function jsonRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/objections", {
    method: "POST",
    body: JSON.stringify(body),
  });
}
