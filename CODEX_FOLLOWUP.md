# Codex Task Brief — Follow-up Coach
# President Tools OS — Phase 8 (Week 9)
#
# HOW TO RUN:
#   codex --model o3 --approval-mode auto-edit "$(cat CODEX_FOLLOWUP.md)"
#
# PREREQUISITES:
#   - Phase 1 (Foundation) complete
#   - Phase 7 (Manual CRM) complete — Follow-up Coach reads from contacts + contact_activities
# IMPORTANT: Read every section before writing any code.

---

## 1. Mission

Build the **Follow-up Coach** — a daily to-do list that tells each distributor
exactly who to contact today, based on the state of their CRM pipeline.

The core idea: a distributor has 30–50 active contacts at any time. Without a
system, they forget to follow up. The Follow-up Coach surfaces a short, prioritised
list each morning: "These 5 people are ready for your attention today."

**What it does:**
- Shows a "Today's Tasks" list on the Dashboard (and on a dedicated `/coach` page)
- Tasks are AI-suggested (Claude Haiku, low-cost) once per day, based on who
  hasn't been contacted recently and what pipeline stage they're in
- Distributor can mark tasks done, snooze to tomorrow, or dismiss
- Distributor can also add manual tasks (not contact-related)
- Tasks reset each morning at 08:00 MYT (UTC+8)

**What it does NOT do:**
- No automated messaging — tasks are reminders to the distributor, not actions
- No push notification scheduling (Web Push is Phase 9 — this phase is just the task list)
- No AI that contacts anyone — AI only suggests which human to follow up with
- No recurring task automation — the distributor reviews and acts manually each day

---

## 2. Project Context

### Stack (do not change — already installed)
- Next.js 14 App Router + TypeScript strict + Tailwind + shadcn/ui
- Anthropic Claude Haiku — low-cost task suggestion (same SDK already installed)
- BullMQ + Redis — cron already set up for weekly-compile; reuse for daily coach generation
- Drizzle ORM + Supabase

### Already built — do not re-implement
```
lib/db/scoped.ts               scopedDb(accountId)
lib/auth/session.ts            getAccountFromSession()
lib/crm/types.ts               PIPELINE_STAGES, PipelineStage
lib/db/schema/crm.ts           contacts, contact_activities
lib/funnels/whatsapp.ts        buildWaLink()
jobs/workers/                  worker pattern already established
vercel.json                    cron already set up — add new cron entry here
```

### Anthropic SDK (already installed)
```typescript
import Anthropic from "@anthropic-ai/sdk";
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const msg = await client.messages.create({
  model: "claude-haiku-4-5",        // Haiku — cheap, fast, good enough for task lists
  max_tokens: 512,
  messages: [{ role: "user", content: prompt }],
});
const text = msg.content[0]?.type === "text" ? msg.content[0].text : "";
```

---

## 3. Task Types

```typescript
export const TASK_TYPES = [
  "follow_up_contact",   // AI-suggested: follow up with a specific contact
  "share_content",       // AI-suggested: post or share a piece of content today
  "record_voice",        // AI-suggested: record a daily journey entry
  "manual",              // Distributor-created: any custom task
] as const;
export type TaskType = typeof TASK_TYPES[number];

export const TASK_STATUS = [
  "pending",    // not yet acted on
  "done",       // marked complete by distributor
  "snoozed",   // pushed to tomorrow
  "dismissed", // skipped without action
] as const;
export type TaskStatus = typeof TASK_STATUS[number];
```

---

## 4. Database Schema

### 4a. Create `lib/db/schema/coach.ts`

**`daily_tasks`**
| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | gen_random_uuid() |
| account_id | UUID NOT NULL | FK → accounts.id ON DELETE CASCADE |
| task_date | DATE NOT NULL | The day this task belongs to (MYT date, stored as UTC date) |
| task_type | TEXT NOT NULL | One of TASK_TYPES |
| title | TEXT NOT NULL | Short action label. e.g. "Follow up with Ali Bin Ahmad" |
| body | TEXT | 1–2 sentence context. e.g. "Ali hasn't been contacted in 5 days. He's in Hot stage — good time to check in." Max 300 chars. |
| contact_id | UUID | FK → contacts.id ON DELETE SET NULL. Null for non-contact tasks. |
| status | TEXT NOT NULL DEFAULT 'pending' | One of TASK_STATUS |
| is_ai_generated | BOOLEAN NOT NULL DEFAULT false | true = suggested by Haiku; false = manual |
| snoozed_to | DATE | Set when status = 'snoozed'. Task re-appears on this date. |
| completed_at | TIMESTAMPTZ | Set when status = 'done' |
| created_at | TIMESTAMPTZ NOT NULL DEFAULT now() |
| updated_at | TIMESTAMPTZ NOT NULL DEFAULT now() |

Indexes:
- `(account_id, task_date)` — daily task list (primary query)
- `(account_id, status)` — filter pending
- `(account_id, contact_id)` — tasks linked to a contact
- `(task_date, status)` — cron cleanup query

**`coach_generations`** — Log of AI generation runs per account per day.
| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| account_id | UUID NOT NULL | FK → accounts.id ON DELETE CASCADE |
| generated_for_date | DATE NOT NULL | The day tasks were generated for |
| tasks_suggested | INTEGER NOT NULL DEFAULT 0 | How many tasks Haiku suggested |
| tasks_inserted | INTEGER NOT NULL DEFAULT 0 | How many were actually inserted (dedup) |
| prompt_tokens | INTEGER | For cost tracking |
| completion_tokens | INTEGER | For cost tracking |
| created_at | TIMESTAMPTZ NOT NULL DEFAULT now() |

Unique: `(account_id, generated_for_date)` — one generation run per account per day.

### 4b. Update `lib/db/schema/index.ts`
Add: `export * from "./coach";`

### 4c. Migration `drizzle/0009_coach.sql`
- Both tables, all columns and indexes
- RLS:
  - `daily_tasks`: SELECT/INSERT/UPDATE: own account OR admin. DELETE: own account OR admin.
  - `coach_generations`: SELECT: own account OR admin. INSERT/UPDATE: own account OR admin. DELETE: admin only.
- Updated-at trigger on `daily_tasks`

---

## 5. Extend `scopedDb` — Add to `lib/db/scoped.ts`

Add imports:
```typescript
import { dailyTasks, coachGenerations } from "@/lib/db/schema/coach";
import type { DailyTask, NewDailyTask } from "@/lib/db/schema/coach";
import type { TaskStatus } from "@/lib/coach/types";
```

Add `coach` namespace to `scopedDb()`:

```typescript
coach: {
  // ── Daily Tasks ───────────────────────────────────────────────────────
  listForDate: async (date: string) => Promise<DailyTask[]>
    // WHERE account_id = accountId AND task_date = date
    // AND (status = 'pending' OR status = 'done')  ← exclude dismissed/snoozed-past
    // ORDER BY is_ai_generated DESC, created_at ASC
    // Note: snoozed tasks appear on their snoozed_to date, not the original task_date

  listSnoozed: async () => Promise<DailyTask[]>
    // WHERE account_id = accountId AND status = 'snoozed'
    // AND snoozed_to <= today (MYT)
    // These are "due back" — include in today's list

  createTask: async (data: Omit<NewDailyTask, "accountId"|"id"|"createdAt"|"updatedAt">)
    => Promise<DailyTask | undefined>

  updateStatus: async (taskId: string, status: TaskStatus, opts?: {
    snoozedTo?: string;   // ISO date string (YYYY-MM-DD) for snooze
    completedAt?: Date;
  }) => Promise<DailyTask | undefined>
    // WHERE id = ? AND account_id = accountId

  countPendingToday: async (date: string) => Promise<number>
    // COUNT WHERE account_id = accountId AND task_date = date AND status = 'pending'

  hasGenerationForDate: async (date: string) => Promise<boolean>
    // SELECT 1 FROM coach_generations WHERE account_id = accountId AND generated_for_date = date

  recordGeneration: async (data: {
    generatedForDate: string;
    tasksSuggested: number;
    tasksInserted: number;
    promptTokens?: number;
    completionTokens?: number;
  }) => Promise<void>
}
```

---

## 6. AI Task Generation

Create `lib/coach/generate.ts`:

```typescript
/**
 * Generates today's follow-up task suggestions for one account using Claude Haiku.
 *
 * Logic:
 * 1. Load the account's contacts that need attention:
 *    - Stage "hot" or "warm" AND last_contacted_at IS NULL or > 3 days ago
 *    - Stage "new" AND created_at > 24 hours ago (fresh lead — reach out soon)
 *    - Stage "customer" AND last_contacted_at IS NULL or > 14 days ago (check-in)
 *    - Limit: top 10 contacts (sort by urgency: hot first, then warm, then by last_contacted_at ASC NULLS FIRST)
 * 2. Also check:
 *    - Voice capture: did they record a daily journey entry today? If not, suggest it.
 *    - Content: did they create content this week? If not, suggest sharing.
 * 3. Build a concise prompt → send to Claude Haiku
 * 4. Parse JSON response → create task rows
 * 5. Cap at 7 AI-suggested tasks total per day (avoid overwhelm)
 */

import Anthropic from "@anthropic-ai/sdk";
import { db } from "@/lib/db";
import { contacts } from "@/lib/db/schema/crm";
import { voiceCaptures } from "@/lib/db/schema/voice";
import { contentDrafts } from "@/lib/db/schema/content";
import { scopedDb } from "@/lib/db/scoped";
import { and, eq, lt, or, isNull, gte, desc, asc, sql } from "drizzle-orm";
import type { GeneratedTask } from "@/lib/coach/types";

const MAX_TASKS_PER_DAY = 7;
const TASK_CAP_HOT = 3;       // max follow_up_contact tasks for hot/warm contacts
const TASK_CAP_OTHER = 2;     // max for other types

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function generateDailyTasks(accountId: string, targetDate: string): Promise<{
  tasks: GeneratedTask[];
  promptTokens: number;
  completionTokens: number;
}> {
  const userDb = scopedDb(accountId);

  // ── 1. Contacts needing attention ──────────────────────────────────────
  const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
  const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const urgentContacts = await db
    .select({
      id: contacts.id,
      name: contacts.name,
      stage: contacts.stage,
      lastContactedAt: contacts.lastContactedAt,
      createdAt: contacts.createdAt,
      source: contacts.source,
    })
    .from(contacts)
    .where(and(
      eq(contacts.accountId, accountId),
      eq(contacts.isArchived, false),
      or(
        // Hot/warm → no contact in 3 days
        and(
          or(eq(contacts.stage, "hot"), eq(contacts.stage, "warm")),
          or(isNull(contacts.lastContactedAt), lt(contacts.lastContactedAt, threeDaysAgo))
        ),
        // New → arrived in last 24h (fresh lead)
        and(eq(contacts.stage, "new"), gte(contacts.createdAt, oneDayAgo)),
        // Customer → no check-in in 14 days
        and(
          eq(contacts.stage, "customer"),
          or(isNull(contacts.lastContactedAt), lt(contacts.lastContactedAt, fourteenDaysAgo))
        ),
      )
    ))
    .orderBy(
      sql`CASE stage WHEN 'hot' THEN 1 WHEN 'warm' THEN 2 WHEN 'new' THEN 3 WHEN 'customer' THEN 4 ELSE 5 END`,
      asc(contacts.lastContactedAt)
    )
    .limit(10);

  // ── 2. Voice capture today? ─────────────────────────────────────────────
  const startOfToday = new Date(targetDate + "T00:00:00.000Z");
  const [todayVoice] = await db
    .select({ count: sql<number>`COUNT(*)::int` })
    .from(voiceCaptures)
    .where(and(
      eq(voiceCaptures.accountId, accountId),
      eq(voiceCaptures.type, "daily_journey"),
      gte(voiceCaptures.createdAt, startOfToday),
    ));
  const hasVoiceToday = (todayVoice?.count ?? 0) > 0;

  // ── 3. Content this week? ───────────────────────────────────────────────
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const [recentContent] = await db
    .select({ count: sql<number>`COUNT(*)::int` })
    .from(contentDrafts)
    .where(and(
      eq(contentDrafts.accountId, accountId),
      gte(contentDrafts.createdAt, sevenDaysAgo),
    ));
  const hasContentThisWeek = (recentContent?.count ?? 0) > 0;

  // ── 4. Build prompt ─────────────────────────────────────────────────────
  const contactLines = urgentContacts.map((c, i) => {
    const lastContact = c.lastContactedAt
      ? `last contacted ${Math.round((Date.now() - c.lastContactedAt.getTime()) / 86400000)}d ago`
      : "never contacted";
    return `${i + 1}. ${c.name} (stage: ${c.stage}, source: ${c.source}, ${lastContact})`;
  }).join("\n");

  const prompt = `You are a follow-up coach for a Herbalife Malaysia distributor.
Today is ${targetDate}. Generate a short daily to-do list (max ${MAX_TASKS_PER_DAY} tasks).

CONTACTS needing attention (prioritise hot/warm first):
${contactLines || "None — all contacts are up to date."}

CONTEXT:
- Recorded a daily journey voice note today: ${hasVoiceToday ? "YES" : "NO"}
- Created content this week: ${hasContentThisWeek ? "YES" : "NO"}

RULES:
- Only suggest follow_up_contact tasks for the top ${TASK_CAP_HOT} most urgent contacts
- If no voice recording today: add one record_voice task
- If no content this week: add one share_content task
- Do NOT suggest income claims or unrealistic expectations in task bodies
- Keep body text warm, practical, and brief (1–2 sentences max)

Output ONLY a JSON array, no markdown, no explanation:
[
  {
    "task_type": "follow_up_contact" | "share_content" | "record_voice" | "manual",
    "contact_index": <number 1-based from list above, or null if not a contact task>,
    "title": "<short action, max 60 chars>",
    "body": "<1-2 sentence context, max 200 chars>"
  }
]`;

  // ── 5. Call Haiku ───────────────────────────────────────────────────────
  const msg = await client.messages.create({
    model: "claude-haiku-4-5",
    max_tokens: 512,
    messages: [{ role: "user", content: prompt }],
  });

  const raw = msg.content[0]?.type === "text" ? msg.content[0].text.trim() : "[]";
  const promptTokens = msg.usage.input_tokens;
  const completionTokens = msg.usage.output_tokens;

  // ── 6. Parse + map to GeneratedTask ────────────────────────────────────
  let parsed: unknown[] = [];
  try {
    parsed = JSON.parse(raw) as unknown[];
  } catch {
    parsed = [];
  }

  const tasks: GeneratedTask[] = [];
  for (const item of parsed.slice(0, MAX_TASKS_PER_DAY)) {
    if (typeof item !== "object" || item === null) continue;
    const t = item as Record<string, unknown>;
    const taskType = typeof t["task_type"] === "string" ? t["task_type"] : null;
    const title = typeof t["title"] === "string" ? t["title"].slice(0, 60) : null;
    const body = typeof t["body"] === "string" ? t["body"].slice(0, 300) : undefined;
    const contactIndex = typeof t["contact_index"] === "number" ? t["contact_index"] : null;

    if (!taskType || !title) continue;

    const contactId = contactIndex !== null
      ? (urgentContacts[contactIndex - 1]?.id ?? null)
      : null;

    tasks.push({ taskType, title, body, contactId });
  }

  return { tasks, promptTokens, completionTokens };
}

export type { GeneratedTask };
```

Create `lib/coach/types.ts`:

```typescript
export const TASK_TYPES = [
  "follow_up_contact",
  "share_content",
  "record_voice",
  "manual",
] as const;
export type TaskType = typeof TASK_TYPES[number];

export const TASK_STATUS = [
  "pending",
  "done",
  "snoozed",
  "dismissed",
] as const;
export type TaskStatus = typeof TASK_STATUS[number];

export type GeneratedTask = {
  taskType: string;
  title: string;
  body?: string;
  contactId: string | null;
};
```

---

## 7. Daily Cron Job

### Worker: `jobs/workers/coach.worker.ts`

```typescript
/**
 * Coach worker — generates daily tasks for all active accounts.
 * Run once per day at 08:00 MYT (00:00 UTC).
 *
 * For each active account:
 * 1. Check if tasks already generated for today → skip if yes
 * 2. Call generateDailyTasks()
 * 3. Insert task rows
 * 4. Record generation log
 *
 * Errors per account are caught and logged — never fail the whole batch.
 */
import { generateDailyTasks } from "@/lib/coach/generate";
import { scopedDb } from "@/lib/db/scoped";
import { adminDb } from "@/lib/db/scoped";
import { getMytDateString } from "@/lib/coach/date";

export async function runCoachWorker(): Promise<void> {
  const todayMyt = getMytDateString();

  // Get all active accounts
  const accounts = await adminDb.accounts.listActive(); // returns Account[]

  for (const account of accounts) {
    try {
      const userDb = scopedDb(account.id);

      // Skip if already generated today
      const already = await userDb.coach.hasGenerationForDate(todayMyt);
      if (already) continue;

      const { tasks, promptTokens, completionTokens } =
        await generateDailyTasks(account.id, todayMyt);

      let inserted = 0;
      for (const task of tasks) {
        await userDb.coach.createTask({
          taskDate: todayMyt,
          taskType: task.taskType,
          title: task.title,
          body: task.body,
          contactId: task.contactId,
          status: "pending",
          isAiGenerated: true,
        });
        inserted++;
      }

      await userDb.coach.recordGeneration({
        generatedForDate: todayMyt,
        tasksSuggested: tasks.length,
        tasksInserted: inserted,
        promptTokens,
        completionTokens,
      });
    } catch (err) {
      console.error(`[coach-worker] Failed for account ${account.id}:`, err);
      // Continue to next account
    }
  }
}
```

### Date helper: `lib/coach/date.ts`

```typescript
/**
 * Returns today's date in MYT (UTC+8) as a YYYY-MM-DD string.
 * Used for daily task bucketing.
 */
export function getMytDateString(date: Date = new Date()): string {
  // MYT = UTC+8. Add 8 hours then take the UTC date components.
  const myt = new Date(date.getTime() + 8 * 60 * 60 * 1000);
  const y = myt.getUTCFullYear();
  const m = String(myt.getUTCMonth() + 1).padStart(2, "0");
  const d = String(myt.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * Returns tomorrow's date in MYT as YYYY-MM-DD.
 */
export function getMytTomorrowString(): string {
  const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
  return getMytDateString(tomorrow);
}
```

### Cron API route: `app/api/crons/daily-coach/route.ts`

```typescript
/**
 * GET /api/crons/daily-coach
 * Called by Vercel Cron at 00:00 UTC daily (= 08:00 MYT).
 * Protected by CRON_SECRET.
 */
import { NextRequest, NextResponse } from "next/server";
import { runCoachWorker } from "@/jobs/workers/coach.worker";

export async function GET(request: NextRequest) {
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    await runCoachWorker();
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[daily-coach cron] Fatal error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
```

### Update `vercel.json` — Add cron entry

```json
{
  "crons": [
    {
      "path": "/api/crons/weekly-compile",
      "schedule": "0 0 * * 1"
    },
    {
      "path": "/api/crons/daily-coach",
      "schedule": "0 0 * * *"
    }
  ]
}
```

### Add to `adminDb` in `lib/db/scoped.ts`:

```typescript
// Add to existing adminDb:
accounts: {
  ...existing methods...,
  listActive: async () => Promise<Account[]>
    // SELECT WHERE is_active = true
    // (used by coach worker to iterate all accounts)
}
```

---

## 8. Validators

Create `lib/validators/coach.ts`:

```typescript
import { z } from "zod";
import { TASK_TYPES, TASK_STATUS } from "@/lib/coach/types";

export const CreateManualTaskSchema = z.object({
  title: z.string().min(1, "Title required").max(100),
  body: z.string().max(300).optional().or(z.literal("")),
  taskDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Must be YYYY-MM-DD").optional(),
  // if omitted → default to today MYT
});

export const UpdateTaskStatusSchema = z.object({
  status: z.enum(TASK_STATUS),
  snoozedTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  // required when status = 'snoozed', ignored otherwise
}).refine(data => {
  if (data.status === "snoozed" && !data.snoozedTo) return false;
  return true;
}, { message: "snoozedTo is required when status is 'snoozed'" });
```

---

## 9. API Routes

### GET `/api/coach/tasks`
**Auth:** `getAccountFromSession()`

Query: `date?: string` (YYYY-MM-DD, defaults to today MYT)

Logic:
1. Compute target date (today MYT if not provided)
2. If no tasks exist for today AND no generation record → trigger on-demand generation:
   ```typescript
   if (!hasTasks && !hasGeneration) {
     await generateAndInsertTasks(session.id, todayMyt);
   }
   ```
   This handles the case where the cron hasn't run yet (e.g. user opens app at 7:58 MYT).
3. `userDb.coach.listForDate(targetDate)` + `userDb.coach.listSnoozed()`
   Merge and deduplicate (a snoozed task re-appearing for today shouldn't appear twice).
4. Return: `{ tasks: DailyTask[], date: string, pendingCount: number }`

### POST `/api/coach/tasks`
**Auth:** `getAccountFromSession()`
Body: `CreateManualTaskSchema`

Creates a manual task. `isAiGenerated: false`, `taskType: "manual"`.
`taskDate` defaults to today MYT if not provided.
Return `{ task: DailyTask }` with 201.

### PATCH `/api/coach/tasks/[taskId]`
**Auth:** `getAccountFromSession()`
Body: `UpdateTaskStatusSchema`

Logic:
1. `userDb.coach.updateStatus(taskId, status, { snoozedTo, completedAt: status === "done" ? new Date() : undefined })`
2. Return `{ task: DailyTask }`

### POST `/api/coach/generate`
**Auth:** `getAccountFromSession()`

On-demand regeneration. Useful if distributor wants fresh suggestions mid-day.

Logic:
1. Check: has generation already happened today? If yes → return 200 with `{ alreadyGenerated: true, tasks }` (don't bill Haiku twice)
2. If not → run `generateDailyTasks()`, insert tasks, record generation
3. Return `{ tasks: DailyTask[], generated: true }`

---

## 10. Dashboard Integration

### Update `app/(app)/dashboard/page.tsx`

The dashboard already exists. Add a "Today's Tasks" section that calls
`GET /api/coach/tasks` on load and shows a compact task list.

```
┌─────────────────────────────────────────────┐
│ Today's Focus                  3 pending    │
├─────────────────────────────────────────────┤
│ ○  Follow up with Ali Bin Ahmad  [WhatsApp] │
│    Hot stage · 4 days since last contact    │
│                                             │
│ ○  Follow up with Siti Rahimah  [WhatsApp]  │
│    Warm stage · Never contacted             │
│                                             │
│ ○  Record your daily journey                │
│    You haven't recorded today yet           │
├─────────────────────────────────────────────┤
│ [View all tasks →]                          │
└─────────────────────────────────────────────┘
```

Show maximum 3 tasks on the dashboard widget. "View all tasks →" links to `/coach`.

For `follow_up_contact` tasks: show a [WhatsApp] button that opens wa.me link
AND calls `PATCH /api/coach/tasks/[id]` with `status: "done"` in one click.

### `app/(app)/dashboard/_components/task-widget.tsx`
Client component. Fetches tasks, shows compact list with action buttons.

---

## 11. Full Coach Page

### Page: `app/(app)/coach/page.tsx`
**Client Component.** Full daily task list with all actions.

```
Today's Focus — Wednesday, 21 May 2026
3 of 7 tasks remaining

──── Follow-up Tasks ────────────────────────────────

[ ] Follow up with Ali Bin Ahmad                    [WhatsApp ✓]
    Hot stage · Last contact: 4 days ago
    "Good time to check in — he showed strong interest last week."
    [Done] [Snooze to tomorrow] [Dismiss]

[ ] Follow up with Siti Rahimah                     [WhatsApp ✓]
    Warm stage · Never contacted
    "New lead from your funnel. Reach out while it's fresh."
    [Done] [Snooze to tomorrow] [Dismiss]

──── Other Tasks ────────────────────────────────────

[ ] Record your daily journey
    You haven't recorded a voice note today.
    [Go to Voice Capture] [Done] [Dismiss]

[ ] Share a piece of content this week
    You haven't published content in 7 days.
    [Go to Content Studio] [Done] [Dismiss]

──── Completed ──────────────────────────────────────
[✓] Follow up with Muthu Kumar               (done today)

──── Add a task ─────────────────────────────────────
[+ Add Custom Task]
```

**Task card actions:**
- **[Done]** → `PATCH status: "done"`, card moves to "Completed" section
- **[Snooze to tomorrow]** → `PATCH status: "snoozed", snoozedTo: tomorrow`
  Card disappears from today's list
- **[Dismiss]** → `PATCH status: "dismissed"`, card disappears (no Completed section)
- **[WhatsApp ✓]** on contact tasks: opens wa.me link + marks done in one tap
  `buildWaLink(contact.whatsappNumber, "Hi " + contact.name + ", ")`
- **[Go to Voice Capture]** / **[Go to Content Studio]** — nav link, no status change
  (distributor marks done manually after completing the action)

**Optimistic UI:** Update task status in local state immediately, then sync to API.
Revert on API error with a toast notification.

### Component: `app/(app)/coach/_components/task-card.tsx`
Props: `task: DailyTask & { contact?: Contact | null }`

### Component: `app/(app)/coach/_components/add-task-form.tsx`
Inline form (no modal): title field + [Add] button.
Calls `POST /api/coach/tasks`. Appends new task to list on success.

### Update sidebar: `app/(app)/_components/app-sidebar.tsx`
The sidebar does NOT have a dedicated Coach nav item yet. Add it after Dashboard:
```typescript
{ label: "Daily Coach", href: "/coach", icon: "✅", available: true },
```

---

## 12. Rules & Constraints

### R1: Account Isolation (absolute)
Every `daily_tasks` and `coach_generations` query MUST use `scopedDb(accountId)`.
The coach worker iterates accounts via `adminDb.accounts.listActive()` — each
account's tasks are then inserted via `scopedDb(account.id)`.

### R2: Max 7 AI tasks per day
Hard cap in `generateDailyTasks()` — slice to `MAX_TASKS_PER_DAY = 7`.
The cap exists to prevent Haiku from generating an overwhelming list.
Manual tasks are NOT counted toward this cap.

### R3: One generation per account per day
`coach_generations` has UNIQUE `(account_id, generated_for_date)`.
`hasGenerationForDate()` is checked before calling Haiku.
On-demand `POST /api/coach/generate` respects this — returns existing tasks
if already generated, does NOT call Haiku again.

### R4: No automated actions
The coach generates task *suggestions*. It does not send messages, post content,
or take any action on behalf of the distributor. Every task requires a manual tap.

### R5: Compliance in AI prompts
The Haiku prompt explicitly forbids income claims and unrealistic expectations
in generated task body text. No filtering layer is applied post-generation (Haiku
is used here to generate internal task descriptions, not user-facing content).

### R6: Snoozed tasks
A snoozed task has `status = "snoozed"` and `snoozed_to` set to tomorrow's date.
`listSnoozed()` returns tasks where `snoozed_to <= today` — these re-appear in
today's list. They are merged into the same list as today's tasks and deduplicated
by ID (a task won't appear twice even if its original `task_date` is also today).

### R7: TypeScript strict
No `any`. All types in `lib/coach/types.ts`. Validators in `lib/validators/coach.ts`.

### R8: MYT date handling
All task date bucketing uses MYT (UTC+8). Use `getMytDateString()` consistently.
Never use `new Date().toISOString().split("T")[0]` — that's UTC, not MYT.
Store dates as `DATE` in Postgres (no timezone — the app is Malaysia-only).

---

## 13. Tests Required

Create `tests/follow-up-coach.test.ts`:

1. **MYT date — UTC offset applied correctly**: `getMytDateString(new Date("2026-05-21T16:30:00Z"))` → `"2026-05-22"` (16:30 UTC = 00:30 MYT next day)
2. **MYT date — stays same day before midnight MYT**: `getMytDateString(new Date("2026-05-21T14:00:00Z"))` → `"2026-05-21"` (14:00 UTC = 22:00 MYT same day)
3. **Tomorrow helper**: `getMytTomorrowString()` returns a date 1 day ahead of today MYT
4. **Task generation — capped at 7**: mock Haiku returning 10 tasks → only 7 inserted
5. **Task generation — skipped if already generated**: `hasGenerationForDate` returns true → Haiku NOT called
6. **Snoozed task — reappears on snoozed_to date**: task with `snoozed_to = today` returned by `listSnoozed()`
7. **Snoozed task — not in list before snoozed_to date**: `snoozed_to = tomorrow` → NOT in today's list
8. **Manual task creation — uses today MYT if no date provided**: `POST /api/coach/tasks` without `taskDate` → task has today's MYT date
9. **Status update — done sets completedAt**: `PATCH status: "done"` → `completed_at` is not null
10. **Status update — snooze requires snoozedTo**: `PATCH status: "snoozed"` without `snoozedTo` → 400
11. **Account isolation — tasks scoped to account**: `listForDate` via `scopedDb("acct-A")` excludes `acct-B` tasks
12. **On-demand generation — returns existing if already generated**: `POST /api/coach/generate` when generation exists → returns `alreadyGenerated: true`, no Haiku call
13. **Haiku prompt — contact urgency ordering**: hot contacts appear before warm in prompt contact list
14. **Dashboard widget — shows max 3 tasks**: component renders at most 3 task items even if API returns 7

Target: 14 new tests. Total: 92 + 14 = **106 tests**.

---

## 14. File Checklist

```
lib/
  db/
    schema/
      coach.ts                ← NEW (daily_tasks, coach_generations)
      index.ts                ← UPDATE (add coach export)
    scoped.ts                 ← UPDATE (add coach namespace + adminDb.accounts.listActive)
  coach/
    types.ts                  ← NEW (TASK_TYPES, TASK_STATUS, GeneratedTask)
    generate.ts               ← NEW (generateDailyTasks — Haiku integration)
    date.ts                   ← NEW (getMytDateString, getMytTomorrowString)
  validators/
    coach.ts                  ← NEW (CreateManualTaskSchema, UpdateTaskStatusSchema)

drizzle/
  0009_coach.sql              ← NEW

jobs/
  workers/
    coach.worker.ts           ← NEW (runCoachWorker — iterates all accounts)

app/
  api/
    crons/
      daily-coach/route.ts    ← NEW (GET — Vercel cron, 00:00 UTC)
    coach/
      tasks/
        route.ts              ← NEW (GET list, POST create manual)
        [taskId]/route.ts     ← NEW (PATCH update status)
      generate/route.ts       ← NEW (POST on-demand generation)

  (app)/
    dashboard/
      page.tsx                ← UPDATE (add task-widget component)
      _components/
        task-widget.tsx       ← NEW (compact 3-task preview)
    coach/
      page.tsx                ← NEW (full coach page — client component)
      _components/
        task-card.tsx         ← NEW
        add-task-form.tsx     ← NEW
    _components/
      app-sidebar.tsx         ← UPDATE (add "Daily Coach" nav item, available: true)

vercel.json                   ← UPDATE (add daily-coach cron entry)

tests/
  follow-up-coach.test.ts     ← NEW
```

---

## 15. Definition of Done

- [ ] `npx tsc --noEmit` → 0 errors
- [ ] `npx vitest run` → 106 tests pass (92 existing + 14 new)
- [ ] `npx drizzle-kit generate` → generates 0009 without errors
- [ ] `npx next build` → build succeeds
- [ ] Dashboard shows "Today's Focus" widget with up to 3 tasks
- [ ] `/coach` page shows full task list grouped by type
- [ ] AI tasks generated at most once per account per day (Haiku not called twice)
- [ ] On-demand `POST /api/coach/generate` respects the one-per-day guard
- [ ] Snooze pushes task to tomorrow and removes it from today's list
- [ ] Done tasks move to Completed section (not deleted)
- [ ] WhatsApp button on contact task opens wa.me + marks done
- [ ] MYT date used consistently (never raw UTC date for task bucketing)
- [ ] `vercel.json` has `0 0 * * *` cron for `/api/crons/daily-coach`
- [ ] `adminDb.accounts.listActive()` added (used by coach worker)
- [ ] Daily Coach nav item added to sidebar, `available: true`
- [ ] Max 7 AI tasks per day cap enforced in `generateDailyTasks()`

---

## 16. Start Order (Recommended Sequence)

1. `lib/coach/types.ts` (constants first)
2. `lib/coach/date.ts` (pure functions, no deps)
3. `lib/db/schema/coach.ts`
4. `lib/db/schema/index.ts` (add export)
5. `drizzle/0009_coach.sql`
6. `lib/db/scoped.ts` (add coach namespace + adminDb.accounts.listActive)
7. `lib/validators/coach.ts`
8. `lib/coach/generate.ts` (Haiku integration — depends on scoped + schema)
9. `jobs/workers/coach.worker.ts`
10. `app/api/crons/daily-coach/route.ts`
11. `vercel.json` (add cron entry)
12. API routes: `GET /api/coach/tasks` → `POST tasks` → `PATCH tasks/[id]` → `POST generate`
13. `app/(app)/dashboard/_components/task-widget.tsx`
14. `app/(app)/dashboard/page.tsx` (add widget)
15. `app/(app)/coach/page.tsx`
16. `app/(app)/coach/_components/task-card.tsx` + `add-task-form.tsx`
17. Update sidebar (`app-sidebar.tsx`)
18. `tests/follow-up-coach.test.ts`
19. Final: `tsc --noEmit` + `vitest run` + `next build`
