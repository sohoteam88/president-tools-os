import { relations, sql } from "drizzle-orm";
import {
  boolean,
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { accounts } from "./accounts";

export const funnels = pgTable(
  "funnels",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    accountId: uuid("account_id").notNull().references(() => accounts.id, { onDelete: "cascade" }),
    pathSlug: text("path_slug").notNull(),
    title: text("title").notNull(),
    funnelType: text("funnel_type").notNull(),
    status: text("status").notNull().default("draft"),
    contentJson: text("content_json").notNull(),
    ctaType: text("cta_type").notNull().default("thank_you"),
    ctaValue: text("cta_value"),
    whatsappPreFill: text("whatsapp_pre_fill"),
    complianceStatus: text("compliance_status").default("unchecked"),
    complianceCheckedAt: timestamp("compliance_checked_at", { withTimezone: true }),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`now()`),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().default(sql`now()`),
  },
  (table) => ({
    accountIdx: index("idx_funnels_account").on(table.accountId),
    accountStatusIdx: index("idx_funnels_account_status").on(table.accountId, table.status),
    accountPathIdx: uniqueIndex("idx_funnels_account_path").on(table.accountId, table.pathSlug),
  })
);

export const funnelLeads = pgTable(
  "funnel_leads",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    accountId: uuid("account_id").notNull().references(() => accounts.id, { onDelete: "cascade" }),
    funnelId: uuid("funnel_id").notNull().references(() => funnels.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    whatsappNumber: text("whatsapp_number").notNull(),
    email: text("email"),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    pdpaConsent: boolean("pdpa_consent").notNull().default(false),
    consentText: text("consent_text"),
    notes: text("notes"),
    contactedAt: timestamp("contacted_at", { withTimezone: true }),
    submittedAt: timestamp("submitted_at", { withTimezone: true }).notNull().default(sql`now()`),
  },
  (table) => ({
    accountIdx: index("idx_funnel_leads_account").on(table.accountId),
    funnelIdx: index("idx_funnel_leads_funnel").on(table.funnelId),
    funnelSubmittedIdx: index("idx_funnel_leads_funnel_submitted").on(table.funnelId, table.submittedAt),
    ipFunnelSubmittedIdx: index("idx_funnel_leads_ip_funnel_submitted").on(
      table.ipAddress,
      table.funnelId,
      table.submittedAt
    ),
  })
);

export const funnelsRelations = relations(funnels, ({ one, many }) => ({
  account: one(accounts, { fields: [funnels.accountId], references: [accounts.id] }),
  leads: many(funnelLeads),
}));

export const funnelLeadsRelations = relations(funnelLeads, ({ one }) => ({
  account: one(accounts, { fields: [funnelLeads.accountId], references: [accounts.id] }),
  funnel: one(funnels, { fields: [funnelLeads.funnelId], references: [funnels.id] }),
}));

export type Funnel = typeof funnels.$inferSelect;
export type NewFunnel = typeof funnels.$inferInsert;
export type FunnelLead = typeof funnelLeads.$inferSelect;
export type NewFunnelLead = typeof funnelLeads.$inferInsert;
