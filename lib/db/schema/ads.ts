import { relations, sql } from "drizzle-orm";
import {
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
import { contentDrafts } from "./content";

export const adEntries = pgTable(
  "ad_entries",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    accountId: uuid("account_id").notNull().references(() => accounts.id, { onDelete: "cascade" }),
    platform: text("platform").notNull(),
    contentDraftId: uuid("content_draft_id").references(() => contentDrafts.id, { onDelete: "set null" }),
    captionPreview: text("caption_preview"),
    postedAt: date("posted_at").notNull(),
    reach: integer("reach"),
    likes: integer("likes"),
    comments: integer("comments"),
    saves: integer("saves"),
    shares: integer("shares"),
    dmsReceived: integer("dms_received"),
    leadsGenerated: integer("leads_generated"),
    linkClicks: integer("link_clicks"),
    screenshotKey: text("screenshot_key"),
    ocrExtractedStats: text("ocr_extracted_stats"),
    ocrConfidence: text("ocr_confidence"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`now()`),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().default(sql`now()`),
  },
  (table) => ({
    accountIdx: index("idx_ad_entries_account").on(table.accountId),
    accountPostedIdx: index("idx_ad_entries_account_posted").on(table.accountId, table.postedAt),
    accountPlatformIdx: index("idx_ad_entries_account_platform").on(table.accountId, table.platform),
    accountDraftIdx: index("idx_ad_entries_account_draft").on(table.accountId, table.contentDraftId),
  })
);

export const adAnalyses = pgTable(
  "ad_analyses",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    accountId: uuid("account_id").notNull().unique().references(() => accounts.id, { onDelete: "cascade" }),
    analysisText: text("analysis_text").notNull(),
    entriesAnalysed: integer("entries_analysed").notNull(),
    analysedAt: timestamp("analysed_at", { withTimezone: true }).notNull(),
    promptTokens: integer("prompt_tokens"),
    completionTokens: integer("completion_tokens"),
  },
  (table) => ({
    accountIdx: uniqueIndex("idx_ad_analyses_account").on(table.accountId),
  })
);

export const adEntriesRelations = relations(adEntries, ({ one }) => ({
  account: one(accounts, { fields: [adEntries.accountId], references: [accounts.id] }),
  contentDraft: one(contentDrafts, { fields: [adEntries.contentDraftId], references: [contentDrafts.id] }),
}));

export const adAnalysesRelations = relations(adAnalyses, ({ one }) => ({
  account: one(accounts, { fields: [adAnalyses.accountId], references: [accounts.id] }),
}));

export type AdEntry = typeof adEntries.$inferSelect;
export type NewAdEntry = typeof adEntries.$inferInsert;
export type AdAnalysis = typeof adAnalyses.$inferSelect;
export type NewAdAnalysis = typeof adAnalyses.$inferInsert;
