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
import { accounts, users } from "./accounts";
import { OBJECTION_CATEGORIES } from "@/lib/objections/types";

export const objectionResponses = pgTable(
  "objection_responses",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    category: text("category", { enum: OBJECTION_CATEGORIES }).notNull(),
    title: text("title").notNull(),
    responseText: text("response_text").notNull(),
    tone: text("tone").notNull().default("empathetic"),
    complianceStatus: text("compliance_status").notNull().default("pending"),
    complianceFlags: text("compliance_flags"),
    isPublished: boolean("is_published").notNull().default(false),
    sortOrder: integer("sort_order").notNull().default(0),
    locale:    text("locale").notNull().default("en"),
    createdBy: uuid("created_by").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`now()`),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().default(sql`now()`),
  },
  (table) => ({
    categoryPublishedIdx: index("idx_objection_responses_category_published").on(table.category, table.isPublished),
    complianceIdx: index("idx_objection_responses_compliance").on(table.complianceStatus),
    categorySortIdx: index("idx_objection_responses_category_sort").on(table.category, table.sortOrder),
    categoryTitleIdx: uniqueIndex("idx_objection_responses_category_title_locale").on(table.category, table.title, table.locale),
  })
);

export const accountObjectionFavourites = pgTable(
  "account_objection_favourites",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    accountId: uuid("account_id").notNull().references(() => accounts.id, { onDelete: "cascade" }),
    objectionResponseId: uuid("objection_response_id").notNull().references(() => objectionResponses.id, { onDelete: "cascade" }),
    savedAt: timestamp("saved_at", { withTimezone: true }).notNull().default(sql`now()`),
  },
  (table) => ({
    accountIdx: index("idx_account_objection_favourites_account").on(table.accountId),
    uniqueAccountResponseIdx: uniqueIndex("idx_account_objection_favourites_unique").on(table.accountId, table.objectionResponseId),
  })
);

export const accountObjectionResponses = pgTable(
  "account_objection_responses",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    accountId: uuid("account_id").notNull().references(() => accounts.id, { onDelete: "cascade" }),
    category: text("category", { enum: OBJECTION_CATEGORIES }).notNull(),
    title: text("title").notNull(),
    responseText: text("response_text").notNull(),
    tone: text("tone").notNull().default("empathetic"),
    complianceStatus: text("compliance_status").notNull().default("pending"),
    complianceFlags: text("compliance_flags"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`now()`),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().default(sql`now()`),
  },
  (table) => ({
    accountCategoryIdx: index("idx_account_objection_responses_account_category").on(table.accountId, table.category),
    accountComplianceIdx: index("idx_account_objection_responses_account_compliance").on(table.accountId, table.complianceStatus),
  })
);

export const objectionResponsesRelations = relations(objectionResponses, ({ one, many }) => ({
  creator: one(users, { fields: [objectionResponses.createdBy], references: [users.id] }),
  favourites: many(accountObjectionFavourites),
}));

export const accountObjectionFavouritesRelations = relations(accountObjectionFavourites, ({ one }) => ({
  account: one(accounts, { fields: [accountObjectionFavourites.accountId], references: [accounts.id] }),
  response: one(objectionResponses, { fields: [accountObjectionFavourites.objectionResponseId], references: [objectionResponses.id] }),
}));

export const accountObjectionResponsesRelations = relations(accountObjectionResponses, ({ one }) => ({
  account: one(accounts, { fields: [accountObjectionResponses.accountId], references: [accounts.id] }),
}));

export type ObjectionResponse = typeof objectionResponses.$inferSelect;
export type NewObjectionResponse = typeof objectionResponses.$inferInsert;
export type AccountObjectionFavourite = typeof accountObjectionFavourites.$inferSelect;
export type NewAccountObjectionFavourite = typeof accountObjectionFavourites.$inferInsert;
export type AccountObjectionResponse = typeof accountObjectionResponses.$inferSelect;
export type NewAccountObjectionResponse = typeof accountObjectionResponses.$inferInsert;
