/**
 * Supabase Browser Client
 *
 * Use in Client Components only. Creates a singleton per browser tab.
 * Uses the anon key — subject to RLS policies.
 */

import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/lib/db/database.types";

export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
