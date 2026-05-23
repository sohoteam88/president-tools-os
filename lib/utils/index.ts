/**
 * Shared utility functions.
 * cn() is required by all shadcn/ui components.
 */

import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Merge Tailwind classes without conflicts.
 * Required by every shadcn/ui component.
 *
 * Usage:
 *   className={cn("base-class", isActive && "active-class", props.className)}
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/**
 * Format a date to a human-readable string.
 * Locale: en-MY (Malaysia).
 */
export function formatDate(date: Date | string | null | undefined): string {
  if (!date) return "—";
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleDateString("en-MY", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/**
 * Truncate a string to a max length with ellipsis.
 */
export function truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str;
  return str.slice(0, maxLength - 3) + "...";
}

/**
 * Assert a value is not null/undefined (throws in prod, for use in guaranteed paths).
 */
export function assertDefined<T>(
  value: T | null | undefined,
  message?: string
): T {
  if (value === null || value === undefined) {
    throw new Error(message ?? "Expected defined value but got null/undefined");
  }
  return value;
}
