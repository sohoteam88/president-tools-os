import { and, asc, eq, gte, isNull, lt, or, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { contacts } from "@/lib/db/schema/crm";
import { voiceCaptures } from "@/lib/db/schema/voice";
import { contentDrafts } from "@/lib/db/schema/content";
import type { GeneratedTask, TaskType } from "@/lib/coach/types";

const MAX_TASKS_PER_DAY = 7;
const TASK_CAP_HOT = 3;

type UrgentContact = {
  id: string;
  name: string;
  stage: string;
  lastContactedAt: Date | null;
  createdAt: Date;
  source: string;
};

type ClaudeTask = {
  task_type?: unknown;
  contact_index?: unknown;
  title?: unknown;
  body?: unknown;
};

type ClaudeResponse = {
  content?: Array<{ type?: string; text?: string }>;
  usage?: { input_tokens?: number; output_tokens?: number };
};

export async function generateDailyTasks(accountId: string, targetDate: string): Promise<{
  tasks: GeneratedTask[];
  promptTokens: number;
  completionTokens: number;
}> {
  const urgentContacts = await loadUrgentContacts(accountId);
  const hasVoiceToday = await hasDailyVoiceToday(accountId, targetDate);
  const hasContentThisWeek = await hasRecentContent(accountId);
  const prompt = buildCoachPrompt(targetDate, urgentContacts, hasVoiceToday, hasContentThisWeek);

  if (!process.env.ANTHROPIC_API_KEY) {
    return {
      tasks: fallbackTasks(urgentContacts, hasVoiceToday, hasContentThisWeek),
      promptTokens: 0,
      completionTokens: 0,
    };
  }

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5",
      max_tokens: 512,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!response.ok) {
    return {
      tasks: fallbackTasks(urgentContacts, hasVoiceToday, hasContentThisWeek),
      promptTokens: 0,
      completionTokens: 0,
    };
  }

  const data = (await response.json()) as ClaudeResponse;
  const raw = data.content?.[0]?.type === "text" ? data.content[0].text?.trim() ?? "[]" : "[]";
  return {
    tasks: parseGeneratedTasks(raw, urgentContacts),
    promptTokens: data.usage?.input_tokens ?? 0,
    completionTokens: data.usage?.output_tokens ?? 0,
  };
}

export async function loadUrgentContacts(accountId: string): Promise<UrgentContact[]> {
  const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
  const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

  return db
    .select({
      id: contacts.id,
      name: contacts.name,
      stage: contacts.stage,
      lastContactedAt: contacts.lastContactedAt,
      createdAt: contacts.createdAt,
      source: contacts.source,
    })
    .from(contacts)
    .where(
      and(
        eq(contacts.accountId, accountId),
        eq(contacts.isArchived, false),
        or(
          and(
            or(eq(contacts.stage, "hot"), eq(contacts.stage, "warm")),
            or(isNull(contacts.lastContactedAt), lt(contacts.lastContactedAt, threeDaysAgo))
          ),
          and(eq(contacts.stage, "new"), gte(contacts.createdAt, oneDayAgo)),
          and(
            eq(contacts.stage, "customer"),
            or(isNull(contacts.lastContactedAt), lt(contacts.lastContactedAt, fourteenDaysAgo))
          )
        )
      )
    )
    .orderBy(
      sql`CASE ${contacts.stage} WHEN 'hot' THEN 1 WHEN 'warm' THEN 2 WHEN 'new' THEN 3 WHEN 'customer' THEN 4 ELSE 5 END`,
      asc(contacts.lastContactedAt)
    )
    .limit(10);
}

export function buildCoachPrompt(
  targetDate: string,
  urgentContacts: UrgentContact[],
  hasVoiceToday: boolean,
  hasContentThisWeek: boolean
): string {
  const contactLines = urgentContacts.map((contact, index) => {
    const lastContact = contact.lastContactedAt
      ? `last contacted ${Math.round((Date.now() - contact.lastContactedAt.getTime()) / 86_400_000)}d ago`
      : "never contacted";
    return `${index + 1}. ${contact.name} (stage: ${contact.stage}, source: ${contact.source}, ${lastContact})`;
  }).join("\n");

  return `You are a follow-up coach for a Herbalife Malaysia distributor.
Today is ${targetDate}. Generate a short daily to-do list (max ${MAX_TASKS_PER_DAY} tasks).

CONTACTS needing attention (prioritise hot/warm first):
${contactLines || "None - all contacts are up to date."}

CONTEXT:
- Recorded a daily journey voice note today: ${hasVoiceToday ? "YES" : "NO"}
- Created content this week: ${hasContentThisWeek ? "YES" : "NO"}

RULES:
- Only suggest follow_up_contact tasks for the top ${TASK_CAP_HOT} most urgent contacts
- If no voice recording today: add one record_voice task
- If no content this week: add one share_content task
- Do NOT suggest income claims or unrealistic expectations in task bodies
- Keep body text warm, practical, and brief (1-2 sentences max)

Output ONLY a JSON array, no markdown, no explanation:
[
  {
    "task_type": "follow_up_contact" | "share_content" | "record_voice" | "manual",
    "contact_index": <number 1-based from list above, or null if not a contact task>,
    "title": "<short action, max 60 chars>",
    "body": "<1-2 sentence context, max 200 chars>"
  }
]`;
}

function parseGeneratedTasks(raw: string, urgentContacts: UrgentContact[]): GeneratedTask[] {
  let parsed: unknown = [];
  try {
    parsed = JSON.parse(raw);
  } catch {
    parsed = [];
  }
  if (!Array.isArray(parsed)) return [];

  const tasks: GeneratedTask[] = [];
  for (const item of parsed.slice(0, MAX_TASKS_PER_DAY)) {
    if (!isClaudeTask(item)) continue;
    const taskType = typeof item.task_type === "string" && isTaskType(item.task_type) ? item.task_type : null;
    const title = typeof item.title === "string" ? item.title.slice(0, 100) : null;
    const body = typeof item.body === "string" ? item.body.slice(0, 300) : undefined;
    const contactIndex = typeof item.contact_index === "number" ? item.contact_index : null;
    if (!taskType || !title) continue;
    const contactId = contactIndex !== null ? urgentContacts[contactIndex - 1]?.id ?? null : null;
    tasks.push({ taskType, title, body, contactId });
  }
  return tasks.slice(0, MAX_TASKS_PER_DAY);
}

function fallbackTasks(
  urgentContacts: UrgentContact[],
  hasVoiceToday: boolean,
  hasContentThisWeek: boolean
): GeneratedTask[] {
  const followUps = urgentContacts.slice(0, TASK_CAP_HOT).map((contact) => ({
    taskType: "follow_up_contact" as const,
    contactId: contact.id,
    title: `Follow up with ${contact.name}`.slice(0, 100),
    body: `${contact.name} is in ${contact.stage} stage and is ready for a human check-in.`.slice(0, 300),
  }));
  const tasks: GeneratedTask[] = [...followUps];
  if (!hasVoiceToday) {
    tasks.push({
      taskType: "record_voice",
      contactId: null,
      title: "Record your daily journey",
      body: "Capture one real moment from today while it is still fresh.",
    });
  }
  if (!hasContentThisWeek) {
    tasks.push({
      taskType: "share_content",
      contactId: null,
      title: "Share a piece of content",
      body: "Turn one recent customer conversation or lesson into a practical post.",
    });
  }
  return tasks.slice(0, MAX_TASKS_PER_DAY);
}

async function hasDailyVoiceToday(accountId: string, targetDate: string): Promise<boolean> {
  const startOfToday = new Date(`${targetDate}T00:00:00.000+08:00`);
  const [{ value } = { value: 0 }] = await db
    .select({ value: sql<number>`COUNT(*)::int` })
    .from(voiceCaptures)
    .where(
      and(
        eq(voiceCaptures.accountId, accountId),
        eq(voiceCaptures.type, "daily_journey"),
        gte(voiceCaptures.createdAt, startOfToday)
      )
    );
  return Number(value) > 0;
}

async function hasRecentContent(accountId: string): Promise<boolean> {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const [{ value } = { value: 0 }] = await db
    .select({ value: sql<number>`COUNT(*)::int` })
    .from(contentDrafts)
    .where(and(eq(contentDrafts.accountId, accountId), gte(contentDrafts.createdAt, sevenDaysAgo)));
  return Number(value) > 0;
}

function isClaudeTask(value: unknown): value is ClaudeTask {
  return typeof value === "object" && value !== null;
}

function isTaskType(value: string): value is TaskType {
  return value === "follow_up_contact" || value === "share_content" || value === "record_voice" || value === "manual";
}
