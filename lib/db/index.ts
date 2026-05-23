/**
 * Drizzle ORM client singleton.
 *
 * Uses the Transaction Pooler connection string (port 6543) for serverless
 * compatibility with Vercel. The direct connection string (port 5432) is
 * only needed for Drizzle Kit migrations, configured in drizzle.config.ts.
 *
 * IMPORTANT: Never import and use this directly in route handlers.
 * Always use scopedDb(accountId) from lib/db/scoped.ts instead.
 */

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

// Prevent multiple connections in development (Next.js hot reload)
const globalForDb = globalThis as unknown as {
  connection: postgres.Sql | undefined;
};

const connection =
  globalForDb.connection ??
  postgres(process.env.DATABASE_URL_POOLED ?? process.env.DATABASE_URL!, {
    // Pooler mode: disable prepare statements (required for pgbouncer)
    prepare: false,
    // Max connections — Supabase free tier: 60 total, leave headroom
    max: 10,
  });

if (process.env.NODE_ENV !== "production") {
  globalForDb.connection = connection;
}

export const db = drizzle(connection, { schema });

export type DB = typeof db;
