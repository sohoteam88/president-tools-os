/**
 * Authenticated App Shell Layout
 *
 * Wraps all routes under (app)/* — e.g. /dashboard, /voice, /content, etc.
 *
 * Responsibilities:
 * 1. Verify session — redirect to /login if unauthenticated
 * 2. Onboarding gate — redirect to /setup if not completed
 * 3. Render app chrome: sidebar nav + main content area
 *
 * The middleware already handles unauthenticated redirects, but we do a
 * server-side check here too for a typed SessionAccount object.
 */

import { redirect } from "next/navigation";
import { getServerAccount, getOnboardingRedirect } from "@/lib/auth/session";
import { AppSidebar } from "./_components/app-sidebar";
import { ClientShell } from "./_components/client-shell";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const account = await getServerAccount();

  // Should not happen (middleware catches it), but defensive check
  if (!account) {
    redirect("/login");
  }

  // Check if onboarding is complete
  const onboardingRedirect = getOnboardingRedirect(account);
  if (onboardingRedirect) {
    redirect(onboardingRedirect);
  }

  return (
    <ClientShell>
      <div className="flex h-screen bg-background">
        {/* Sidebar navigation */}
        <AppSidebar account={account} />

        {/* Main content */}
        <main className="flex-1 overflow-auto">
          <div className="h-full">{children}</div>
        </main>
      </div>
    </ClientShell>
  );
}
