/**
 * Core multi-tenant foundation tables.
 *
 * Design rules (from ENGINEERING_RULES.md R1, R3):
 * - Every business table gets account_id FK + index
 * - UUID primary keys everywhere
 * - Soft-delete via deleted_at (not hard DELETE)
 * - audit_logs is append-only
 */

import {
  pgTable,
  uuid,
  text,
  timestamp,
  boolean,
  primaryKey,
  pgEnum,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { sql } from "drizzle-orm";

// ─── Enums ────────────────────────────────────────────────────────────────────

export const distributorSeniorityEnum = pgEnum("distributor_seniority", [
  "new",        // < 3 months
  "mid",        // 3–12 months
  "experienced",// 1–3 years
  "senior",     // 3+ years
]);

export const onboardingPathEnum = pgEnum("onboarding_path", [
  "newbie_full",        // Full 8-step wizard + Voice Capture
  "experienced_partial",// Abbreviated — Voice Capture optional
  "self_serve",         // Import past posts, skip daily capture
]);

export const memberRoleEnum = pgEnum("member_role", [
  "owner", // Downline — full access to own account only
  "admin", // Steven — cross-account access
]);

// ─── Accounts ─────────────────────────────────────────────────────────────────

/**
 * One account = one downline member's workspace.
 * The Master Distributor (Steven) has an account too — he's the first user.
 */
export const accounts = pgTable(
  "accounts",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    name: text("name").notNull(),
    slug: text("slug").unique(),
    herbalifeId: text("herbalife_id"),
    distributorSeniority: distributorSeniorityEnum("distributor_seniority")
      .notNull()
      .default("new"),
    onboardingPath: onboardingPathEnum("onboarding_path")
      .notNull()
      .default("newbie_full"),

    // Voice Capture progress tracking
    voiceCaptureCompletedAt: timestamp("voice_capture_completed_at", {
      withTimezone: true,
    }),
    setupWizardCompletedAt: timestamp("setup_wizard_completed_at", {
      withTimezone: true,
    }),

    // Terms of Use acceptance (required before dashboard access)
    termsAcceptedAt: timestamp("terms_accepted_at", { withTimezone: true }),
    termsVersion: text("terms_version"), // e.g., "2026-05-20"

    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
  },
  (table) => ({
    activeIdx: index("idx_accounts_active").on(table.isActive),
    slugIdx: uniqueIndex("idx_accounts_slug").on(table.slug),
  })
);

// ─── Users ─────────────────────────────────────────────────────────────────────

/**
 * Mirrors Supabase auth.users. We keep a copy here so Drizzle can JOIN.
 * Do not store passwords here — that's Supabase Auth's job.
 * Rows are created automatically via a Supabase trigger when auth.users is inserted.
 */
export const users = pgTable("users", {
  id: uuid("id").primaryKey(), // Same UUID as auth.users.id
  email: text("email").notNull().unique(),
  name: text("name"),
  avatarUrl: text("avatar_url"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .default(sql`now()`),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .default(sql`now()`),
});

// ─── Account Memberships ───────────────────────────────────────────────────────

/**
 * Links users to accounts with a role.
 * In MVP: each downline user belongs to exactly one account (as 'owner').
 * Steven's user belongs to his own account with role 'owner', and also has
 * 'admin' access cross-account via a separate mechanism (service role key).
 */
export const accountMemberships = pgTable(
  "account_memberships",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    role: memberRoleEnum("role").notNull().default("owner"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.userId, table.accountId] }),
    userIdx: index("idx_memberships_user").on(table.userId),
    accountIdx: index("idx_memberships_account").on(table.accountId),
  })
);

// ─── Invite Tokens ─────────────────────────────────────────────────────────────

/**
 * Invite-only access. Admin creates a token; downline uses the magic link.
 * Tokens expire after 48 hours. Single-use.
 */
export const inviteTokens = pgTable(
  "invite_tokens",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    token: text("token").notNull().unique(), // Signed JWT or nanoid
    email: text("email").notNull(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    role: memberRoleEnum("role").notNull().default("owner"),
    createdByUserId: uuid("created_by_user_id")
      .notNull()
      .references(() => users.id),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
  },
  (table) => ({
    tokenIdx: uniqueIndex("idx_invite_tokens_token").on(table.token),
    emailIdx: index("idx_invite_tokens_email").on(table.email),
    accountIdx: index("idx_invite_tokens_account").on(table.accountId),
  })
);

// ─── Audit Logs ────────────────────────────────────────────────────────────────

/**
 * Append-only audit trail. Required for PDPA compliance.
 * NEVER delete rows from this table.
 * account_id can be null for platform-level admin actions.
 */
export const auditLogs = pgTable(
  "audit_logs",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    accountId: uuid("account_id"), // null = platform-level action
    actorUserId: uuid("actor_user_id"), // null = system/cron
    action: text("action").notNull(), // e.g., 'lead.deleted', 'invite.sent'
    resourceType: text("resource_type"), // e.g., 'lead', 'voice_note'
    resourceId: text("resource_id"), // UUID as string (flexible)
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    metadata: text("metadata"), // JSON string for extra context
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
  },
  (table) => ({
    accountIdx: index("idx_audit_logs_account").on(table.accountId),
    actorIdx: index("idx_audit_logs_actor").on(table.actorUserId),
    actionIdx: index("idx_audit_logs_action").on(table.action),
    createdIdx: index("idx_audit_logs_created").on(table.createdAt),
  })
);

// ─── Relations ────────────────────────────────────────────────────────────────

export const accountsRelations = relations(accounts, ({ many }) => ({
  memberships: many(accountMemberships),
  inviteTokens: many(inviteTokens),
  auditLogs: many(auditLogs),
}));

export const usersRelations = relations(users, ({ many }) => ({
  memberships: many(accountMemberships),
  createdInvites: many(inviteTokens),
}));

export const accountMembershipsRelations = relations(
  accountMemberships,
  ({ one }) => ({
    user: one(users, {
      fields: [accountMemberships.userId],
      references: [users.id],
    }),
    account: one(accounts, {
      fields: [accountMemberships.accountId],
      references: [accounts.id],
    }),
  })
);

// ─── Type Exports ─────────────────────────────────────────────────────────────

export type Account = typeof accounts.$inferSelect;
export type NewAccount = typeof accounts.$inferInsert;
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type AccountMembership = typeof accountMemberships.$inferSelect;
export type InviteToken = typeof inviteTokens.$inferSelect;
export type NewInviteToken = typeof inviteTokens.$inferInsert;
export type AuditLog = typeof auditLogs.$inferSelect;
export type NewAuditLog = typeof auditLogs.$inferInsert;
