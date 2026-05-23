/**
 * Next.js Middleware
 *
 * Runs on every request before it reaches a page or route handler.
 * Responsibilities:
 * 1. Refresh Supabase session cookies (keeps users logged in)
 * 2. Subdomain routing — resolve account from subdomain for funnel pages
 * 3. Auth guard — redirect unauthenticated users to /login
 * 4. Admin guard — protect /admin/* routes
 *
 * Architecture reference: master-archive.md Section 5 (Decision 4)
 *
 * Subdomain pattern:
 *   app.yourteam.com         → /app/* (authenticated, standard)
 *   admin.yourteam.com       → /admin/* (admin only)
 *   {slug}.yourteam.com      → /funnel/{slug} (public funnel pages)
 *   www.yourteam.com         → redirect to app.yourteam.com
 */

import { NextResponse, type NextRequest } from "next/server";
import { createMiddlewareClient } from "@/lib/supabase/middleware";

// Subdomains that are reserved (not treated as account slugs)
const RESERVED_SUBDOMAINS = new Set(["www", "app", "admin", "api", "mail"]);

// Public paths that never require authentication
const PUBLIC_PATHS = new Set([
  "/login",
  "/auth/callback",
  "/invite",
  "/privacy",
]);

// Paths that start with these prefixes are public
const PUBLIC_PREFIXES = ["/invite/", "/funnel/", "/magnet/", "/webinar/", "/_next/", "/api/auth/", "/api/public/"];

export async function middleware(request: NextRequest) {
  const response = NextResponse.next({
    request: { headers: request.headers },
  });

  // ── Step 1: Refresh Supabase session ──────────────────────────────────────
  const supabase = createMiddlewareClient(request, response);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // ── Step 2: Subdomain routing ─────────────────────────────────────────────
  const hostname = request.headers.get("host") ?? "";
  const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "localhost:3000";

  // In development, no subdomain routing needed
  const isProduction = process.env.NODE_ENV === "production";

  if (isProduction) {
    // Extract subdomain: "sherry.yourteam.com" → "sherry"
    const subdomain = hostname.replace(`.${rootDomain}`, "");

    if (subdomain && subdomain !== hostname && !RESERVED_SUBDOMAINS.has(subdomain)) {
      // This is an account subdomain → rewrite to /funnel/{slug} route
      const url = request.nextUrl.clone();
      url.pathname = `/funnel/${subdomain}${request.nextUrl.pathname}`;
      return NextResponse.rewrite(url, { headers: response.headers });
    }

    // www → redirect to app
    if (subdomain === "www") {
      return NextResponse.redirect(
        `https://app.${rootDomain}${request.nextUrl.pathname}`,
        { headers: response.headers }
      );
    }
  }

  // ── Step 3: Auth guard ────────────────────────────────────────────────────
  const path = request.nextUrl.pathname;

  const isPublicPath =
    PUBLIC_PATHS.has(path) ||
    PUBLIC_PREFIXES.some((prefix) => path.startsWith(prefix));

  if (isPublicPath) {
    // If user is already logged in and visits /login, redirect to /dashboard
    if (user && path === "/login") {
      return NextResponse.redirect(
        new URL("/dashboard", request.url),
        { headers: response.headers }
      );
    }
    return response;
  }

  // Unauthenticated user hitting a protected route → redirect to login
  if (!user) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("redirectTo", path);
    return NextResponse.redirect(loginUrl, { headers: response.headers });
  }

  // ── Step 4: Admin guard ───────────────────────────────────────────────────
  if (path.startsWith("/admin")) {
    // Check admin role via a lightweight query
    const { data: membership } = await supabase
      .from("account_memberships")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "admin")
      .maybeSingle();

    if (!membership) {
      // Non-admin trying to access admin routes → redirect to dashboard
      return NextResponse.redirect(
        new URL("/dashboard", request.url),
        { headers: response.headers }
      );
    }
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths EXCEPT:
     * - _next/static (static files)
     * - _next/image (image optimization)
     * - favicon.ico, sitemap.xml, robots.txt
     */
    "/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt).*)",
  ],
};
