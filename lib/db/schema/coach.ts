import { relations, sql } from "drizzle-orm";
import {
  boolean,
  date,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { accounts } from "./accounts";
import { contacts } from "./crm";
import { TASK_STATUS, TASK_TYPES } from "@/lib/coach/types";

export const dailyTasks = pgTable(
  "daily_tasks",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    accountId: uuid("account_id").notNull().references(() => accounts.id, { onDelete: "cascade" }),
    taskDate: date("task_date").notNull(),
    taskType: text("task_type", { enum: TASK_TYPES }).notNull(),
    title: text("title").notNull(),
    body: text("body"),
    contactId: uuid("contact_id").references(() => contacts.id, { onDelete: "set null" }),
    status: text("status", { enum: TASK_STATUS }).notNull().default("pending"),
    isAiGenerated: boolean("is_ai_generated").notNull().default(false),
    snoozedTo: date("snoozed_to"),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`now()`),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().default(sql`now()`),
  },
  (table) => ({
    accountDateIdx: index("idx_daily_tasks_account_date").on(table.accountId, table.taskDate),
    accountStatusIdx: index("idx_daily_tasks_account_status").on(table.accountId, table.status),
    accountContactIdx: index("idx_daily_tasks_account_contact").on(table.accountId, table.contactId),
    dateStatusIdx: index("idx_daily_tasks_date_status").on(table.taskDate, table.status),
  })
);

export const coachGenerations = pgTable(
  "coach_generations",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    accountId: uuid("account_id").notNull().references(() => accounts.id, { onDelete: "cascade" }),
    generatedForDate: date("generated_for_date").notNull(),
    tasksSuggested: integer("tasks_suggested").notNull().default(0),
    tasksInserted: integer("tasks_inserted").notNull().default(0),
    promptTokens: integer("prompt_tokens"),
    completionTokens: integer("completion_tokens"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`now()`),
  },
  (table) => ({
    accountDateIdx: uniqueIndex("idx_coach_generations_account_date").on(table.accountId, table.generatedForDate),
  })
);

export const dailyTasksRelations = relations(dailyTasks, ({ one }) => ({
  account: one(accounts, { fields: [dailyTasks.accountId], references: [accounts.id] }),
  contact: one(contacts, { fields: [dailyTasks.contactId], references: [contacts.id] }),
}));

export const coachGenerationsRelations = relations(coachGenerations, ({ one }) => ({
  account: one(accounts, { fields: [coachGenerations.accountId], references: [accounts.id] }),
}));

export type DailyTask = typeof dailyTasks.$inferSelect;
export type NewDailyTask = typeof dailyTasks.$inferInsert;
export type CoachGeneration = typeof coachGenerations.$inferSelect;
export type NewCoachGeneration = typeof coachGenerations.$inferInsert;
