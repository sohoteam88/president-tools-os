import type { Contact } from "@/lib/db/schema/crm";
import type { DailyTask } from "@/lib/db/schema/coach";

export const TASK_TYPES = [
  "follow_up_contact",
  "share_content",
  "record_voice",
  "manual",
] as const;

export type TaskType = (typeof TASK_TYPES)[number];

export const TASK_STATUS = [
  "pending",
  "done",
  "snoozed",
  "dismissed",
] as const;

export type TaskStatus = (typeof TASK_STATUS)[number];

export type GeneratedTask = {
  taskType: TaskType;
  title: string;
  body?: string;
  contactId: string | null;
};

export type CoachTaskWithContact = DailyTask & {
  contact?: Contact | null;
};
