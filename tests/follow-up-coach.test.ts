import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { getMytDateString, getMytTomorrowString } from "@/lib/coach/date";
import { limitDashboardTasks } from "@/app/(app)/dashboard/_components/task-widget";
import type { CoachTaskWithContact, TaskStatus, TaskType } from "@/lib/coach/types";

type MockTask = CoachTaskWithContact;

const state = vi.hoisted(() => ({
  tasks: [] as MockTask[],
  generatedDates: new Set<string>(),
  generateCalls: 0,
}));

vi.mock("@/lib/auth/session", () => ({
  getAccountFromSession: vi.fn(() => ({ id: "acct-A", name: "A", slug: "acct-a", role: "owner" })),
}));

vi.mock("@/lib/db/scoped", () => ({
  scopedDb: vi.fn((accountId: string) => ({
    coach: {
      listForDate: vi.fn((date: string) => Promise.resolve(
        state.tasks.filter((task) => task.accountId === accountId && task.taskDate === date && (task.status === "pending" || task.status === "done"))
      )),
      listSnoozed: vi.fn(() => Promise.resolve(
        state.tasks.filter((task) => task.accountId === accountId && task.status === "snoozed" && !!task.snoozedTo && task.snoozedTo <= getMytDateString())
      )),
      createTask: vi.fn((data: Partial<MockTask>) => {
        const task = makeTask({ ...data, accountId });
        state.tasks.push(task);
        return Promise.resolve(task);
      }),
      updateStatus: vi.fn((taskId: string, status: TaskStatus, opts?: { snoozedTo?: string; completedAt?: Date }) => {
        const task = state.tasks.find((item) => item.accountId === accountId && item.id === taskId);
        if (!task) return Promise.resolve(undefined);
        task.status = status;
        task.snoozedTo = status === "snoozed" ? opts?.snoozedTo ?? null : null;
        task.completedAt = status === "done" ? opts?.completedAt ?? new Date() : null;
        return Promise.resolve(task);
      }),
      countPendingToday: vi.fn((date: string) => Promise.resolve(
        state.tasks.filter((task) => task.accountId === accountId && task.taskDate === date && task.status === "pending").length
      )),
      hasGenerationForDate: vi.fn((date: string) => Promise.resolve(state.generatedDates.has(`${accountId}:${date}`))),
      recordGeneration: vi.fn((data: { generatedForDate: string }) => {
        state.generatedDates.add(`${accountId}:${data.generatedForDate}`);
        return Promise.resolve();
      }),
    },
    crm: {
      get: vi.fn((contactId: string) => Promise.resolve(
        state.tasks.find((task) => task.contact?.id === contactId)?.contact ?? null
      )),
    },
  })),
  adminDb: {
    accounts: { listActive: vi.fn(() => Promise.resolve([{ id: "acct-A" }])) },
  },
}));

vi.mock("@/lib/coach/generate", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/coach/generate")>();
  return {
    ...actual,
    generateDailyTasks: vi.fn(() => {
      state.generateCalls++;
      return Promise.resolve({
        tasks: Array.from({ length: 10 }, (_, index) => ({
          taskType: "manual" as const,
          title: `Generated ${index + 1}`,
          body: "Generated task",
          contactId: null,
        })),
        promptTokens: 10,
        completionTokens: 20,
      });
    }),
  };
});

beforeEach(() => {
  state.tasks.length = 0;
  state.generatedDates.clear();
  state.generateCalls = 0;
});

describe("Follow-up Coach", () => {
  it("applies MYT offset into the next day", () => {
    expect(getMytDateString(new Date("2026-05-21T16:30:00Z"))).toBe("2026-05-22");
  });

  it("keeps the same MYT date before midnight", () => {
    expect(getMytDateString(new Date("2026-05-21T14:00:00Z"))).toBe("2026-05-21");
  });

  it("returns tomorrow one MYT day ahead", () => {
    const today = getMytDateString();
    const tomorrow = getMytTomorrowString();
    expect(new Date(`${tomorrow}T00:00:00Z`).getTime() - new Date(`${today}T00:00:00Z`).getTime()).toBe(86_400_000);
  });

  it("caps generated inserts at 7 tasks", async () => {
    const { generateAndInsertTasks } = await import("@/lib/coach/tasks");
    const result = await generateAndInsertTasks("acct-A", "2026-05-21");
    expect(result.tasks).toHaveLength(7);
    expect(state.tasks).toHaveLength(7);
  });

  it("skips generation when already generated", async () => {
    state.generatedDates.add("acct-A:2026-05-21");
    const { generateAndInsertTasks } = await import("@/lib/coach/tasks");
    const result = await generateAndInsertTasks("acct-A", "2026-05-21");
    expect(result.alreadyGenerated).toBe(true);
    expect(state.generateCalls).toBe(0);
  });

  it("returns snoozed tasks due today", async () => {
    const task = makeTask({ status: "snoozed", snoozedTo: getMytDateString() });
    state.tasks.push(task);
    const { scopedDb } = await import("@/lib/db/scoped");
    await expect(scopedDb("acct-A").coach.listSnoozed()).resolves.toEqual([task]);
  });

  it("does not return snoozed tasks before their date", async () => {
    state.tasks.push(makeTask({ status: "snoozed", snoozedTo: getMytTomorrowString() }));
    const { scopedDb } = await import("@/lib/db/scoped");
    await expect(scopedDb("acct-A").coach.listSnoozed()).resolves.toEqual([]);
  });

  it("uses today's MYT date for manual tasks without a date", async () => {
    const { POST } = await import("@/app/api/coach/tasks/route");
    const response = await POST(jsonRequest({ title: "Call Siti" }));
    const body = (await response.json()) as { task: MockTask };
    expect(response.status).toBe(201);
    expect(body.task.taskDate).toBe(getMytDateString());
  });

  it("sets completedAt when marking a task done", async () => {
    const task = makeTask();
    state.tasks.push(task);
    const { PATCH } = await import("@/app/api/coach/tasks/[taskId]/route");
    const response = await PATCH(jsonRequest({ status: "done" }), { params: { taskId: task.id } });
    expect(response.status).toBe(200);
    expect(task.completedAt).toBeInstanceOf(Date);
  });

  it("requires snoozedTo when snoozing a task", async () => {
    const task = makeTask();
    state.tasks.push(task);
    const { PATCH } = await import("@/app/api/coach/tasks/[taskId]/route");
    const response = await PATCH(jsonRequest({ status: "snoozed" }), { params: { taskId: task.id } });
    expect(response.status).toBe(400);
  });

  it("scopes tasks by account", async () => {
    state.tasks.push(makeTask({ accountId: "acct-B" }));
    const { scopedDb } = await import("@/lib/db/scoped");
    await expect(scopedDb("acct-A").coach.listForDate(getMytDateString())).resolves.toEqual([]);
  });

  it("returns existing tasks for on-demand generation after the daily run", async () => {
    state.generatedDates.add(`acct-A:${getMytDateString()}`);
    const { POST } = await import("@/app/api/coach/generate/route");
    const response = await POST();
    const body = (await response.json()) as { alreadyGenerated?: boolean };
    expect(body.alreadyGenerated).toBe(true);
    expect(state.generateCalls).toBe(0);
  });

  it("places hot contacts before warm contacts in the prompt list", async () => {
    const { buildCoachPrompt } = await import("@/lib/coach/generate");
    const prompt = buildCoachPrompt("2026-05-21", [
      contactLine("Hot Ali", "hot"),
      contactLine("Warm Siti", "warm"),
    ], true, true);
    expect(prompt.indexOf("Hot Ali")).toBeLessThan(prompt.indexOf("Warm Siti"));
  });

  it("limits dashboard widget tasks to 3 items", () => {
    const tasks = Array.from({ length: 7 }, (_, index) => makeTask({ id: `task-${index}`, title: `Task ${index}` }));
    expect(limitDashboardTasks(tasks)).toHaveLength(3);
  });
});

function makeTask(overrides: Partial<MockTask> = {}): MockTask {
  return {
    id: overrides.id ?? `task-${state.tasks.length + 1}`,
    accountId: overrides.accountId ?? "acct-A",
    taskDate: overrides.taskDate ?? getMytDateString(),
    taskType: overrides.taskType ?? "manual",
    title: overrides.title ?? "Follow up",
    body: overrides.body ?? null,
    contactId: overrides.contactId ?? null,
    status: overrides.status ?? "pending",
    isAiGenerated: overrides.isAiGenerated ?? false,
    snoozedTo: overrides.snoozedTo ?? null,
    completedAt: overrides.completedAt ?? null,
    createdAt: overrides.createdAt ?? new Date(),
    updatedAt: overrides.updatedAt ?? new Date(),
    contact: overrides.contact,
  };
}

function contactLine(name: string, stage: string) {
  return {
    id: name,
    name,
    stage,
    source: "manual",
    lastContactedAt: null,
    createdAt: new Date(),
  };
}

function jsonRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/coach", {
    method: "POST",
    body: JSON.stringify(body),
  });
}
