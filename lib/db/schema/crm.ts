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
import { PIPELINE_STAGES } from "@/lib/crm/types";

export const contacts = pgTable(
  "contacts",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    accountId: uuid("account_id").notNull().references(() => accounts.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    whatsappNumber: text("whatsapp_number").notNull(),
    email: text("email"),
    stage: text("stage", { enum: PIPELINE_STAGES }).notNull().default("new"),
    source: text("source").notNull().default("manual"),
    sourceId: text("source_id"),
    notes: text("notes"),
    lastContactedAt: timestamp("last_contacted_at", { withTimezone: true }),
    isArchived: boolean("is_archived").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`now()`),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().default(sql`now()`),
  },
  (table) => ({
    accountIdx: index("idx_contacts_account").on(table.accountId),
    accountStageIdx: index("idx_contacts_account_stage").on(table.accountId, table.stage),
    accountArchivedIdx: index("idx_contacts_account_archived").on(table.accountId, table.isArchived),
    accountSourceIdx: index("idx_contacts_account_source").on(table.accountId, table.source, table.sourceId),
    accountWhatsappIdx: uniqueIndex("idx_contacts_account_whatsapp").on(table.accountId, table.whatsappNumber),
    whatsappAccountIdx: index("idx_contacts_whatsapp_account").on(table.whatsappNumber, table.accountId),
  })
);

export const contactActivities = pgTable(
  "contact_activities",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    accountId: uuid("account_id").notNull().references(() => accounts.id, { onDelete: "cascade" }),
    contactId: uuid("contact_id").notNull().references(() => contacts.id, { onDelete: "cascade" }),
    activityType: text("activity_type").notNull(),
    payload: text("payload"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`now()`),
  },
  (table) => ({
    contactIdx: index("idx_contact_activities_contact").on(table.contactId),
    accountContactIdx: index("idx_contact_activities_account_contact").on(table.accountId, table.contactId),
    accountCreatedIdx: index("idx_contact_activities_account_created").on(table.accountId, table.createdAt),
  })
);

export const contactsRelations = relations(contacts, ({ one, many }) => ({
  account: one(accounts, { fields: [contacts.accountId], references: [accounts.id] }),
  activities: many(contactActivities),
}));

export const contactActivitiesRelations = relations(contactActivities, ({ one }) => ({
  account: one(accounts, { fields: [contactActivities.accountId], references: [accounts.id] }),
  contact: one(contacts, { fields: [contactActivities.contactId], references: [contacts.id] }),
}));

export type Contact = typeof contacts.$inferSelect;
export type NewContact = typeof contacts.$inferInsert;
export type ContactActivity = typeof contactActivities.$inferSelect;
export type NewContactActivity = typeof contactActivities.$inferInsert;
