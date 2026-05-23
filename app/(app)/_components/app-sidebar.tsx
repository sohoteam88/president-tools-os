/**
 * App Sidebar
 *
 * Primary navigation for authenticated users.
 * Shows modules available based on onboarding completion.
 */

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { SessionAccount } from "@/lib/auth/session";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/lib/i18n";
import { LanguageSelector } from "./language-selector";

interface NavItem {
  labelKey: keyof ReturnType<typeof useLanguage>["t"];
  href: string;
  icon: string;
  available: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { labelKey: "dashboard",     href: "/dashboard",  icon: "⚡", available: true },
  { labelKey: "dailyCoach",    href: "/coach",      icon: "✅", available: true },
  { labelKey: "objections",    href: "/objections", icon: "💬", available: true },
  { labelKey: "voiceCapture",  href: "/voice",      icon: "🎙️", available: true },
  { labelKey: "contentStudio", href: "/content",    icon: "✍️", available: true },
  { labelKey: "funnels",       href: "/funnels",    icon: "📣", available: true },
  { labelKey: "leadMagnets",   href: "/magnets",    icon: "📥", available: true },
  { labelKey: "webinars",      href: "/webinars",   icon: "🎥", available: true },
  { labelKey: "contacts",      href: "/contacts",   icon: "👥", available: true },
  { labelKey: "analytics",     href: "/analytics",  icon: "📊", available: true },
];

interface Props {
  account: SessionAccount;
}

export function AppSidebar({ account }: Props) {
  const pathname = usePathname();
  const { t } = useLanguage();

  return (
    <aside className="w-56 border-r border-border bg-card flex flex-col">
      {/* Brand */}
      <div className="px-4 py-5 border-b border-border">
        <p className="text-sm font-semibold text-foreground">President Tools</p>
        <p className="text-xs text-muted-foreground mt-0.5 truncate">
          {account.name}
        </p>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-2 py-3 space-y-0.5">
        {NAV_ITEMS.map((item) => {
          const isActive = pathname.startsWith(item.href);
          const label = t[item.labelKey];
          if (!item.available) {
            return (
              <div
                key={item.href}
                className="flex items-center gap-2 px-2 py-1.5 rounded-md text-sm text-muted-foreground/50 cursor-not-allowed"
                title="Coming soon"
              >
                <span className="text-base opacity-40">{item.icon}</span>
                <span>{label}</span>
                <span className="ml-auto text-[10px] text-muted-foreground/40">soon</span>
              </div>
            );
          }
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-2 px-2 py-1.5 rounded-md text-sm transition-colors",
                isActive
                  ? "bg-primary text-primary-foreground"
                  : "text-foreground hover:bg-accent hover:text-accent-foreground"
              )}
            >
              <span className="text-base">{item.icon}</span>
              <span>{label}</span>
            </Link>
          );
        })}
      </nav>

      {/* User footer */}
      <div className="px-4 py-4 border-t border-border space-y-2">
        {/* Language selector */}
        <LanguageSelector />

        {account.role === "admin" && (
          <Link
            href="/admin"
            className="block text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            {t.adminPanel}
          </Link>
        )}
        <div className="text-xs text-muted-foreground truncate">
          {account.userEmail}
        </div>
        <form action="/api/auth/signout" method="POST">
          <button
            type="submit"
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            {t.signOut}
          </button>
        </form>
      </div>
    </aside>
  );
}
