/**
 * Root Layout
 *
 * Wraps every page. Minimal — no auth logic here.
 * Auth state is handled per route group layout.
 *
 * Font: Inter (system-ui fallback for Malaysia locale support)
 * Metadata: set sensible defaults; each page can override.
 */

import * as Sentry from "@sentry/nextjs";
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { Toaster } from "sonner";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
});

const baseMetadata: Metadata = {
  title: {
    default: "President Tools",
    template: "%s | President Tools",
  },
  description: "Internal tool for President Team Malaysia",
  robots: {
    index: false,   // Private internal tool — no indexing
    follow: false,
  },
};

export function generateMetadata(): Metadata {
  return {
    ...baseMetadata,
    other: {
      ...Sentry.getTraceData(),
    },
  };
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="min-h-screen bg-background font-sans antialiased">
        {children}
        <Toaster position="top-right" richColors closeButton />
      </body>
    </html>
  );
}
