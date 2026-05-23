/**
 * Supabase Server Client
 *
 * Use in Server Components, Route Handlers, and Server Actions.
 * Reads/writes cookies so the session stays fresh.
 * Uses the anon key — subject to RLS policies.
 *
 * For admin operations that must bypass RLS, use createAdminClient().
 */

import { createServerClient } from "@supabase/ssr";
import type { CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/db/database.types";

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // setAll called from Server Component — cookies can't be set.
            // This is fine if you have a middleware refreshing sessions.
          }
        },
      },
    }
  );
}

/**
 * Supabase Admin Client (Service Role)
 *
 * Bypasses RLS. Use ONLY for:
 * - Admin-initiated account creation
 * - PDPA data deletion flows
 * - Invite token management
 * - Cross-account admin queries
 *
 * Never expose this client to user-facing code paths.
 */
export function createAdminClient() {
  return createSupabaseClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  );
}
