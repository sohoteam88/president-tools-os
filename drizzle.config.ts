import type { Config } from "drizzle-kit";

export default {
  schema: "./lib/db/schema/index.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
  // Verbose output so we can see what's being generated
  verbose: true,
  strict: true,
} satisfies Config;
