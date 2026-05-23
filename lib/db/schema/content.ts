/**
 * Content Studio Schema
 * All tables carry account_id — required by ENGINEERING_RULES.md R1.
 */

import { relations, sql } from "drizzle-orm";
import {
  index,
  integer,
  pgTable,
  real,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { accounts } from "./accounts";

export const contentDrafts = pgTable(
  "content_drafts",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    platform: text("platform").notNull(),
    contentType: text("content_type").notNull(),
    userTopic: text("user_topic"),
    generatedDraft: text("generated_draft").notNull(),
    userDraft: text("user_draft"),
    complianceStatus: text("compliance_status").notNull().default("pending"),
    complianceFlags: text("compliance_flags"),
    modificationScore: real("modification_score"),
    voiceProfileVersion: integer("voice_profile_version"),
    exportedAt: timestamp("exported_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
  },
  (table) => ({
    accountIdx: index("idx_content_drafts_account").on(table.accountId),
    accountCreatedIdx: index("idx_content_drafts_account_created").on(
      table.accountId,
      table.createdAt
    ),
    accountComplianceIdx: index("idx_content_drafts_account_compliance").on(
      table.accountId,
      table.complianceStatus
    ),
  })
);

export const contentComplianceLogs = pgTable(
  "content_compliance_logs",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    draftId: uuid("draft_id")
      .notNull()
      .references(() => contentDrafts.id, { onDelete: "cascade" }),
    layer: integer("layer").notNull(),
    result: text("result").notNull(),
    flagCodes: text("flag_codes"),
    details: text("details"),
    checkedAt: timestamp("checked_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
  },
  (table) => ({
    draftIdx: index("idx_content_compliance_logs_draft").on(table.draftId),
    accountCheckedIdx: index("idx_content_compliance_logs_account_checked").on(
      table.accountId,
      table.checkedAt
    ),
  })
);

export const contentDraftsRelations = relations(contentDrafts, ({ one, many }) => ({
  account: one(accounts, {
    fields: [contentDrafts.accountId],
    references: [accounts.id],
  }),
  complianceLogs: many(contentComplianceLogs),
}));

export const contentComplianceLogsRelations = relations(
  contentComplianceLogs,
  ({ one }) => ({
    account: one(accounts, {
      fields: [contentComplianceLogs.accountId],
      references: [accounts.id],
    }),
    draft: one(contentDrafts, {
      fields: [contentComplianceLogs.draftId],
      references: [contentDrafts.id],
    }),
  })
);

export type ContentDraft = typeof contentDrafts.$inferSelect;
export type NewContentDraft = typeof contentDrafts.$inferInsert;
export type ContentComplianceLog = typeof contentComplianceLogs.$inferSelect;
export type NewContentComplianceLog = typeof contentComplianceLogs.$inferInsert;
