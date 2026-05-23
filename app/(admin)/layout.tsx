/**
 * Admin Shell Layout
 *
 * Wraps all routes under (admin)/* — e.g. /admin/accounts, /admin/invites.
 *
 * Double-guards admin access:
 * 1. Middleware already blocks non-admin users from /admin/* routes
 * 2. requireAdmin() here provides a typed SessionAccount for the layout
 *
 * Admin = Steven. This area is for:
 * - Creating and managing downline accounts
 * - Sending invites
 * - Viewing audit logs
 * - Platform-level settings
 */

import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth/session";
import Link from "next/link";

const ADMIN_NAV = [
  { label: "Dashboard",  href: "/admin" },
  { label: "Accounts",   href: "/admin/accounts" },
  { label: "Invites",    href: "/admin/invites" },
  { label: "Lead Magnet", href: "/admin/magnets" },
  { label: "Webinar",    href: "/admin/webinars" },
  { label: "Objections", href: "/admin/objections" },
  { label: "Usage",      href: "/admin/usage" },
  { label: "PDPA",       href: "/admin/pdpa" },
];

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const admin = await requireAdmin();

  // Middleware handles the redirect, but be defensive
  if (!admin) {
    redirect("/dashboard");
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Admin topbar */}
      <header className="border-b border-border bg-card">
        <div className="max-w-6xl mx-auto px-4 flex items-center justify-between h-12">
          <div className="flex items-center gap-6">
            <span className="text-sm font-semibold text-foreground">
              Admin Panel
            </span>
            <nav className="flex items-center gap-1">
              {ADMIN_NAV.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground rounded-md hover:bg-accent transition-colors"
                >
                  {item.label}
                </Link>
              ))}
            </nav>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/dashboard"
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              ← Back to App
            </Link>
            <span className="text-xs text-muted-foreground">{admin.userEmail}</span>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-6xl mx-auto px-4 py-6">{children}</main>
    </div>
  );
}
