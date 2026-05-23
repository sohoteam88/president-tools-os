/**
 * Vitest Global Test Setup
 *
 * Runs before each test file.
 *
 * Responsibilities:
 * 1. Set required environment variables for tests
 * 2. Validate environment is a test environment
 * 3. Provide test helpers (imported from this file)
 *
 * NOTE: These tests do NOT connect to a real database.
 * Account isolation is tested via unit tests of scopedDb's guard logic.
 * Integration tests (hitting a real test DB) are a Phase 2 concern.
 *
 * When Phase 2 integration tests are added:
 * - Spin up a local Supabase instance (supabase start)
 * - Set TEST_DATABASE_URL
 * - Add a beforeAll() here to run migrations
 * - Add afterAll() to clean up test data
 */

import { beforeAll, afterAll, vi } from "vitest";

// ── Environment guard ─────────────────────────────────────────────────────────

beforeAll(() => {
  // Prevent tests from accidentally running against production
  if (process.env.NODE_ENV === "production") {
    throw new Error("Tests must not run in production environment");
  }

  // Set up test environment variables (NODE_ENV is read-only; vitest sets it to "test" automatically)
  process.env.NEXT_PUBLIC_SUPABASE_URL = "http://localhost:54321";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-anon-key";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key";
  process.env.DATABASE_URL = "postgresql://postgres:postgres@localhost:54322/postgres";
  process.env.DATABASE_URL_POOLED = "postgresql://postgres:postgres@localhost:54322/postgres";
  process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";
  process.env.NEXT_PUBLIC_ROOT_DOMAIN = "localhost:3000";
});

afterAll(() => {
  vi.restoreAllMocks();
});
