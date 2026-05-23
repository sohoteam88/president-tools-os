import { relations, sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { accounts } from "./accounts";

export const leadMagnets = pgTable(
  "lead_magnets",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    title: text("title").notNull(),
    description: text("description").notNull(),
    thumbnailUrl: text("thumbnail_url"),
    masterPdfKey: text("master_pdf_key").notNull(),
    version: integer("version").notNull().default(1),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`now()`),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().default(sql`now()`),
  },
  (table) => ({
    activeIdx: index("idx_lead_magnets_active").on(table.isActive),
  })
);

export const accountLeadMagnets = pgTable(
  "account_lead_magnets",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    accountId: uuid("account_id").notNull().unique().references(() => accounts.id, { onDelete: "cascade" }),
    leadMagnetId: uuid("lead_magnet_id").notNull().references(() => leadMagnets.id),
    personalisedPdfKey: text("personalised_pdf_key"),
    personalisedAt: timestamp("personalised_at", { withTimezone: true }),
    masterVersionAtPersonalisation: integer("master_version_at_personalisation"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`now()`),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().default(sql`now()`),
  },
  (table) => ({
    accountIdx: uniqueIndex("idx_account_lead_magnets_account").on(table.accountId),
    magnetIdx: index("idx_account_lead_magnets_magnet").on(table.leadMagnetId),
  })
);

export const leadMagnetDownloads = pgTable(
  "lead_magnet_downloads",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    accountId: uuid("account_id").notNull().references(() => accounts.id, { onDelete: "cascade" }),
    accountLeadMagnetId: uuid("account_lead_magnet_id").notNull().references(() => accountLeadMagnets.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    whatsappNumber: text("whatsapp_number").notNull(),
    email: text("email"),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    pdpaConsent: boolean("pdpa_consent").notNull().default(false),
    consentText: text("consent_text"),
    downloadedAt: timestamp("downloaded_at", { withTimezone: true }).notNull().default(sql`now()`),
  },
  (table) => ({
    accountIdx: index("idx_lead_magnet_downloads_account").on(table.accountId),
    activationIdx: index("idx_lead_magnet_downloads_activation").on(table.accountLeadMagnetId),
    activationDownloadedIdx: index("idx_lead_magnet_downloads_activation_downloaded").on(table.accountLeadMagnetId, table.downloadedAt),
    ipActivationDownloadedIdx: index("idx_lead_magnet_downloads_ip_activation_downloaded").on(table.ipAddress, table.accountLeadMagnetId, table.downloadedAt),
  })
);

export const leadMagnetsRelations = relations(leadMagnets, ({ many }) => ({
  activations: many(accountLeadMagnets),
}));

export const accountLeadMagnetsRelations = relations(accountLeadMagnets, ({ one, many }) => ({
  account: one(accounts, { fields: [accountLeadMagnets.accountId], references: [accounts.id] }),
  magnet: one(leadMagnets, { fields: [accountLeadMagnets.leadMagnetId], references: [leadMagnets.id] }),
  downloads: many(leadMagnetDownloads),
}));

export type LeadMagnet = typeof leadMagnets.$inferSelect;
export type NewLeadMagnet = typeof leadMagnets.$inferInsert;
export type AccountLeadMagnet = typeof accountLeadMagnets.$inferSelect;
export type NewAccountLeadMagnet = typeof accountLeadMagnets.$inferInsert;
export type LeadMagnetDownload = typeof leadMagnetDownloads.$inferSelect;
export type NewLeadMagnetDownload = typeof leadMagnetDownloads.$inferInsert;
