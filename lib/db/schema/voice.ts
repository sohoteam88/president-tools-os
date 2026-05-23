/**
 * Voice Capture Schema
 * All tables carry account_id — required by ENGINEERING_RULES.md R1.
 */

import { relations, sql } from "drizzle-orm";
import {
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { accounts } from "./accounts";
import type { ContentDraftSeed, DraftMoment, MomentType } from "@/lib/voice/types";

export const voiceCaptureTypeEnum = pgEnum("voice_capture_type", [
  "why_story",
  "daily_journey",
  "weekly_compile",
]);

export const voiceCaptureStatusEnum = pgEnum("voice_capture_status", [
  "recording",
  "uploading",
  "transcribing",
  "accepted",
  "failed",
]);

export const voiceCaptures = pgTable(
  "voice_captures",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    type: voiceCaptureTypeEnum("type").notNull(),
    status: voiceCaptureStatusEnum("status").notNull(),
    r2Key: text("r2_key"),
    r2PublicUrl: text("r2_public_url"),
    durationSeconds: integer("duration_seconds"),
    transcript: text("transcript"),
    transcriptCleaned: text("transcript_cleaned"),
    weekStartDate: date("week_start_date"),
    jobId: text("job_id"),
    errorMessage: text("error_message"),
    recordedAt: timestamp("recorded_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
  },
  (table) => ({
    accountIdx: index("idx_voice_captures_account").on(table.accountId),
    accountTypeIdx: index("idx_voice_captures_account_type").on(
      table.accountId,
      table.type
    ),
    accountStatusIdx: index("idx_voice_captures_account_status").on(
      table.accountId,
      table.status
    ),
    accountRecordedIdx: index("idx_voice_captures_account_recorded").on(
      table.accountId,
      table.recordedAt
    ),
  })
);

export const voiceProfiles = pgTable(
  "voice_profiles",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    version: integer("version").notNull().default(1),
    profileJson: text("profile_json").notNull(),
    sourceCaptureCount: integer("source_capture_count"),
    builtAt: timestamp("built_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
  },
  (table) => ({
    accountVersionIdx: uniqueIndex("idx_voice_profiles_account_version").on(
      table.accountId,
      table.version
    ),
    accountBuiltIdx: index("idx_voice_profiles_account_built").on(
      table.accountId,
      table.builtAt
    ),
  })
);

export const voiceCapturesRelations = relations(voiceCaptures, ({ one }) => ({
  account: one(accounts, {
    fields: [voiceCaptures.accountId],
    references: [accounts.id],
  }),
}));

export const voiceProfilesRelations = relations(voiceProfiles, ({ one }) => ({
  account: one(accounts, {
    fields: [voiceProfiles.accountId],
    references: [accounts.id],
  }),
}));

export const whyStorySessions = pgTable(
  "why_story_sessions",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    accountId: uuid("account_id").notNull().references(() => accounts.id, { onDelete: "cascade" }),
    status: text("status", {
      enum: ["recording", "transcribing", "extracting", "confirming", "complete", "abandoned"],
    }).notNull().default("recording"),
    audioKeys: jsonb("audio_keys").$type<string[]>().notNull().default([]),
    transcripts: jsonb("transcripts").$type<string[]>().notNull().default([]),
    draftMoments: jsonb("draft_moments").$type<DraftMoment[]>().notNull().default([]),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`now()`),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (table) => ({
    accountStatusIdx: index("idx_why_story_sessions_account").on(table.accountId, table.status),
  })
);

export const journeyMoments = pgTable(
  "journey_moments",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    accountId: uuid("account_id").notNull().references(() => accounts.id, { onDelete: "cascade" }),
    source: text("source", { enum: ["why_story", "daily_capture"] }).notNull(),
    rawText: text("raw_text").notNull(),
    momentType: text("moment_type", {
      enum: ["success_story", "challenge_overcome", "lifestyle_glimpse", "product_experience", "mindset_shift"],
    }).$type<MomentType>().notNull(),
    questionIndex: integer("question_index"),
    whyStorySessionId: uuid("why_story_session_id").references(() => whyStorySessions.id, { onDelete: "set null" }),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`now()`),
  },
  (table) => ({
    accountConfirmedIdx: index("idx_journey_moments_account").on(table.accountId, table.confirmedAt),
    accountCreatedIdx: index("idx_journey_moments_account_created").on(table.accountId, table.createdAt),
  })
);

export const weeklyDraftSeeds = pgTable(
  "weekly_draft_seeds",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    accountId: uuid("account_id").notNull().references(() => accounts.id, { onDelete: "cascade" }),
    weekStart: date("week_start").notNull(),
    seeds: jsonb("seeds").$type<ContentDraftSeed[]>().notNull(),
    generatedAt: timestamp("generated_at", { withTimezone: true }).notNull().default(sql`now()`),
  },
  (table) => ({
    uniq: uniqueIndex("weekly_draft_seeds_account_week_uniq").on(table.accountId, table.weekStart),
    accountWeekIdx: index("idx_weekly_draft_seeds_account").on(table.accountId, table.weekStart),
  })
);

export type VoiceCapture = typeof voiceCaptures.$inferSelect;
export type NewVoiceCapture = typeof voiceCaptures.$inferInsert;
export type VoiceProfile = typeof voiceProfiles.$inferSelect;
export type NewVoiceProfile = typeof voiceProfiles.$inferInsert;
export type WhyStorySession = typeof whyStorySessions.$inferSelect;
export type NewWhyStorySession = typeof whyStorySessions.$inferInsert;
export type JourneyMoment = typeof journeyMoments.$inferSelect;
export type NewJourneyMoment = typeof journeyMoments.$inferInsert;
export type WeeklyDraftSeed = typeof weeklyDraftSeeds.$inferSelect;
export type NewWeeklyDraftSeed = typeof weeklyDraftSeeds.$inferInsert;
