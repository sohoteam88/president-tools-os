"use client";

import { LanguageProvider } from "@/lib/i18n";

export function ClientShell({ children }: { children: React.ReactNode }) {
  return <LanguageProvider>{children}</LanguageProvider>;
}
