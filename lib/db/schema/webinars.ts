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

export const webinars = pgTable(
  "webinars",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    title: text("title").notNull(),
    description: text("description").notNull(),
    bunnyVideoId: text("bunny_video_id").notNull(),
    bunnyLibraryId: text("bunny_library_id").notNull(),
    thumbnailUrl: text("thumbnail_url"),
    durationSeconds: integer("duration_seconds"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`now()`),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().default(sql`now()`),
  },
  (table) => ({
    activeIdx: index("idx_webinars_active").on(table.isActive),
  })
);

export const accountWebinars = pgTable(
  "account_webinars",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    accountId: uuid("account_id").notNull().unique().references(() => accounts.id, { onDelete: "cascade" }),
    webinarId: uuid("webinar_id").notNull().references(() => webinars.id),
    customIntro: text("custom_intro"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`now()`),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().default(sql`now()`),
  },
  (table) => ({
    accountIdx: uniqueIndex("idx_account_webinars_account").on(table.accountId),
    webinarIdx: index("idx_account_webinars_webinar").on(table.webinarId),
  })
);

export const webinarRegistrations = pgTable(
  "webinar_registrations",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    accountId: uuid("account_id").notNull().references(() => accounts.id, { onDelete: "cascade" }),
    accountWebinarId: uuid("account_webinar_id").notNull().references(() => accountWebinars.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    whatsappNumber: text("whatsapp_number").notNull(),
    email: text("email"),
    pdpaConsent: boolean("pdpa_consent").notNull().default(false),
    consentText: text("consent_text"),
    watchToken: text("watch_token").notNull().unique(),
    watchedAt: timestamp("watched_at", { withTimezone: true }),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    registeredAt: timestamp("registered_at", { withTimezone: true }).notNull().default(sql`now()`),
  },
  (table) => ({
    accountIdx: index("idx_webinar_registrations_account").on(table.accountId),
    activationIdx: index("idx_webinar_registrations_activation").on(table.accountWebinarId),
    activationRegisteredIdx: index("idx_webinar_registrations_activation_registered").on(table.accountWebinarId, table.registeredAt),
    tokenIdx: uniqueIndex("idx_webinar_registrations_token").on(table.watchToken),
    ipActivationRegisteredIdx: index("idx_webinar_registrations_ip_activation_registered").on(table.ipAddress, table.accountWebinarId, table.registeredAt),
  })
);

export const webinarsRelations = relations(webinars, ({ many }) => ({
  activations: many(accountWebinars),
}));

export type Webinar = typeof webinars.$inferSelect;
export type NewWebinar = typeof webinars.$inferInsert;
export type AccountWebinar = typeof accountWebinars.$inferSelect;
export type NewAccountWebinar = typeof accountWebinars.$inferInsert;
export type WebinarRegistration = typeof webinarRegistrations.$inferSelect;
export type NewWebinarRegistration = typeof webinarRegistrations.$inferInsert;
