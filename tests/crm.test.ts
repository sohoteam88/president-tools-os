import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { buildWaLink } from "@/lib/funnels/whatsapp";
import { PIPELINE_STAGES, emptyStageCounts, type PipelineStage } from "@/lib/crm/types";

type MockContact = {
  id: string;
  accountId: string;
  name: string;
  whatsappNumber: string;
  email: string | null;
  stage: PipelineStage;
  source: string;
  sourceId: string | null;
  notes: string | null;
  lastContactedAt: Date | null;
  isArchived: boolean;
  createdAt: Date;
  updatedAt: Date;
};

const state = vi.hoisted(() => ({
  contacts: [] as MockContact[],
  activities: [] as Array<{ contactId: string; activityType: string; payload: string | null }>,
  selectRows: [] as unknown[][],
  moveStageSpy: vi.fn(),
  updateSpy: vi.fn(),
  logActivitySpy: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({
  getAccountFromSession: vi.fn(() => ({ id: "acct-A", name: "A", slug: "acct-a", role: "owner" })),
}));

vi.mock("@/lib/db", () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => Promise.resolve(state.selectRows.shift() ?? [])),
      })),
    })),
  },
}));

vi.mock("@/lib/db/scoped", () => ({
  scopedDb: vi.fn((accountId: string) => {
    const crm = {
      list: vi.fn((opts?: { includeArchived?: boolean }) => Promise.resolve(
        state.contacts.filter((contact) => contact.accountId === accountId && (opts?.includeArchived || !contact.isArchived))
      )),
      get: vi.fn((contactId: string) => Promise.resolve(
        state.contacts.find((contact) => contact.accountId === accountId && contact.id === contactId)
      )),
      getByWhatsApp: vi.fn((whatsappNumber: string) => Promise.resolve(
        state.contacts.find((contact) => contact.accountId === accountId && contact.whatsappNumber === whatsappNumber)
      )),
      create: vi.fn((data: Partial<MockContact>) => {
        const contact = makeContact({ ...data, accountId });
        state.contacts.push(contact);
        return Promise.resolve(contact);
      }),
      update: state.updateSpy.mockImplementation((contactId: string, data: Partial<MockContact>) => {
        const contact = state.contacts.find((item) => item.accountId === accountId && item.id === contactId);
        if (!contact) return Promise.resolve(undefined);
        Object.assign(contact, data, { updatedAt: new Date() });
        return Promise.resolve(contact);
      }),
      moveStage: state.moveStageSpy.mockImplementation((contactId: string, toStage: PipelineStage) => {
        const contact = state.contacts.find((item) => item.accountId === accountId && item.id === contactId);
        if (!contact) return Promise.resolve(undefined);
        const from = contact.stage;
        contact.stage = toStage;
        state.activities.push({ contactId, activityType: "stage_change", payload: JSON.stringify({ from, to: toStage }) });
        return Promise.resolve(contact);
      }),
      archive: vi.fn((contactId: string) => {
        const contact = state.contacts.find((item) => item.accountId === accountId && item.id === contactId);
        if (contact) contact.isArchived = true;
        return Promise.resolve();
      }),
      unarchive: vi.fn((contactId: string) => {
        const contact = state.contacts.find((item) => item.accountId === accountId && item.id === contactId);
        if (contact) contact.isArchived = false;
        return Promise.resolve();
      }),
      countByStage: vi.fn(() => {
        const counts = emptyStageCounts();
        for (const contact of state.contacts.filter((item) => item.accountId === accountId && !item.isArchived)) {
          counts[contact.stage]++;
        }
        return Promise.resolve(counts);
      }),
      importFromSource: vi.fn((opts: { sourceId: string; source: string; name: string; whatsappNumber: string; email?: string }) => {
        const existing = state.contacts.find((contact) => contact.accountId === accountId && contact.whatsappNumber === opts.whatsappNumber);
        if (existing) return Promise.resolve({ contact: existing, created: false });
        const contact = makeContact({
          accountId,
          name: opts.name,
          whatsappNumber: opts.whatsappNumber,
          email: opts.email ?? null,
          source: opts.source,
          sourceId: opts.sourceId,
        });
        state.contacts.push(contact);
        return Promise.resolve({ contact, created: true });
      }),
      logActivity: state.logActivitySpy.mockImplementation((activity: { contactId: string; activityType: string; payload: string | null }) => {
        state.activities.push(activity);
        return Promise.resolve();
      }),
      listActivities: vi.fn((contactId: string) => Promise.resolve(
        state.activities.filter((activity) => activity.contactId === contactId)
      )),
    };
    return { crm };
  }),
}));

beforeEach(() => {
  state.contacts.length = 0;
  state.activities.length = 0;
  state.selectRows.length = 0;
  state.moveStageSpy.mockClear();
  state.updateSpy.mockClear();
  state.logActivitySpy.mockClear();
});

describe("CRM pipeline", () => {
  it("defines all 5 pipeline stages", () => {
    expect(PIPELINE_STAGES).toHaveLength(5);
    expect(PIPELINE_STAGES).toContain("team_member");
  });

  it("deduplicates source imports by WhatsApp number", async () => {
    const { scopedDb } = await import("@/lib/db/scoped");
    const first = await scopedDb("acct-A").crm.importFromSource(sourceImport("lead-1", "60123456789"));
    const second = await scopedDb("acct-A").crm.importFromSource(sourceImport("lead-2", "60123456789"));
    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(state.contacts).toHaveLength(1);
  });

  it("scopes contacts to account", async () => {
    state.contacts.push(makeContact({ accountId: "acct-B" }));
    const { scopedDb } = await import("@/lib/db/scoped");
    await expect(scopedDb("acct-A").crm.list()).resolves.toEqual([]);
  });

  it("logs activity when stage changes", async () => {
    const contact = makeContact({ accountId: "acct-A", stage: "new" });
    state.contacts.push(contact);
    const { scopedDb } = await import("@/lib/db/scoped");
    await scopedDb("acct-A").crm.moveStage(contact.id, "warm");
    expect(state.activities[0]?.activityType).toBe("stage_change");
  });

  it("returns 200 without DB move when stage is unchanged", async () => {
    const contact = makeContact({ accountId: "acct-A", stage: "warm" });
    state.contacts.push(contact);
    const { POST } = await import("@/app/api/crm/contacts/[contactId]/stage/route");
    const response = await POST(jsonRequest({ stage: "warm" }), { params: { contactId: contact.id } });
    expect(response.status).toBe(200);
    expect(state.moveStageSpy).not.toHaveBeenCalled();
  });

  it("logs a WhatsApp tap and updates last contacted", async () => {
    const contact = makeContact({ accountId: "acct-A" });
    state.contacts.push(contact);
    const { POST } = await import("@/app/api/crm/contacts/[contactId]/whatsapp-sent/route");
    const response = await POST(new Request("http://localhost/api/crm/contacts/c-1/whatsapp-sent", { method: "POST" }), { params: { contactId: contact.id } });
    expect(response.status).toBe(200);
    expect(contact.lastContactedAt).toBeInstanceOf(Date);
    expect(state.activities[0]?.activityType).toBe("whatsapp_sent");
  });

  it("hides archived contacts from the default list", async () => {
    const contact = makeContact({ accountId: "acct-A", isArchived: true });
    state.contacts.push(contact);
    const { scopedDb } = await import("@/lib/db/scoped");
    await expect(scopedDb("acct-A").crm.list()).resolves.toEqual([]);
  });

  it("shows archived contacts when requested", async () => {
    const contact = makeContact({ accountId: "acct-A", isArchived: true });
    state.contacts.push(contact);
    const { scopedDb } = await import("@/lib/db/scoped");
    await expect(scopedDb("acct-A").crm.list({ includeArchived: true })).resolves.toEqual([contact]);
  });

  it("rejects duplicate WhatsApp numbers on manual creation", async () => {
    state.contacts.push(makeContact({ accountId: "acct-A", whatsappNumber: "60123456789" }));
    const { POST } = await import("@/app/api/crm/contacts/route");
    const response = await POST(jsonRequest({ name: "Ali", whatsappNumber: "60123456789", stage: "new" }));
    expect(response.status).toBe(409);
  });

  it("imports funnel leads during sync", async () => {
    state.selectRows.push([
      { id: "lead-1", name: "A", whatsappNumber: "0123456789", email: null },
      { id: "lead-2", name: "B", whatsappNumber: "0123456790", email: null },
      { id: "lead-3", name: "C", whatsappNumber: "0123456791", email: null },
    ], [], []);
    const { syncContactsFromSources } = await import("@/lib/crm/sync");
    const result = await syncContactsFromSources("acct-A");
    expect(result.funnelLeads.imported).toBe(3);
  });

  it("sync is idempotent", async () => {
    state.selectRows.push([{ id: "lead-1", name: "A", whatsappNumber: "0123456789", email: null }], [], []);
    const { syncContactsFromSources } = await import("@/lib/crm/sync");
    await syncContactsFromSources("acct-A");
    state.selectRows.push([{ id: "lead-1", name: "A", whatsappNumber: "0123456789", email: null }], [], []);
    const result = await syncContactsFromSources("acct-A");
    expect(result.funnelLeads.imported).toBe(0);
    expect(result.funnelLeads.skipped).toBe(1);
  });

  it("returns countByStage with all stage keys", async () => {
    state.contacts.push(makeContact({ accountId: "acct-A", stage: "team_member" }));
    const { scopedDb } = await import("@/lib/db/scoped");
    await expect(scopedDb("acct-A").crm.countByStage()).resolves.toMatchObject({
      new: 0,
      warm: 0,
      hot: 0,
      customer: 0,
      team_member: 1,
    });
  });

  it("logs note activity when notes change", async () => {
    const contact = makeContact({ accountId: "acct-A", notes: "Old" });
    state.contacts.push(contact);
    const { PUT } = await import("@/app/api/crm/contacts/[contactId]/route");
    const response = await PUT(jsonRequest({ notes: "New" }), { params: { contactId: contact.id } });
    expect(response.status).toBe(200);
    expect(state.activities[0]?.activityType).toBe("note_added");
  });

  it("formats wa.me links with a pre-filled message", () => {
    expect(buildWaLink("60123456789", "Hi Ali, ")).toBe("https://wa.me/60123456789?text=Hi%20Ali%2C%20");
  });
});

function makeContact(overrides: Partial<MockContact> = {}): MockContact {
  return {
    id: overrides.id ?? `contact-${state.contacts.length + 1}`,
    accountId: overrides.accountId ?? "acct-A",
    name: overrides.name ?? "Ali",
    whatsappNumber: overrides.whatsappNumber ?? "60123456789",
    email: overrides.email ?? null,
    stage: overrides.stage ?? "new",
    source: overrides.source ?? "manual",
    sourceId: overrides.sourceId ?? null,
    notes: overrides.notes ?? null,
    lastContactedAt: overrides.lastContactedAt ?? null,
    isArchived: overrides.isArchived ?? false,
    createdAt: overrides.createdAt ?? new Date(),
    updatedAt: overrides.updatedAt ?? new Date(),
  };
}

function sourceImport(sourceId: string, whatsappNumber: string) {
  return {
    sourceId,
    source: "funnel" as const,
    name: "Ali",
    whatsappNumber,
    email: undefined,
  };
}

function jsonRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/crm", {
    method: "POST",
    body: JSON.stringify(body),
  });
}
