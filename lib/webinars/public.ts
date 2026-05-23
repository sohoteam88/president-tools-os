/**
 * PUBLIC — no account scope. Accessible without authentication.
 * Checks is_active on both webinar and account_webinar rows.
 */

import { and, eq, gt, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db } from "@/lib/db";
import { accounts, webinars, accountWebinars, webinarRegistrations } from "@/lib/db/schema";

export type PublicWebinarData = {
  webinarId: string;
  accountWebinarId: string;
  accountId: string;
  accountName: string;
  accountSlug: string;
  whatsappNumber: string | null;
  title: string;
  description: string;
  thumbnailUrl: string | null;
  durationSeconds: number | null;
  customIntro: string | null;
};

export type ReplayData = {
  registrationId: string;
  accountWebinarId: string;
  accountId: string;
  accountName: string;
  accountSlug: string;
  webinarTitle: string;
  bunnyEmbedUrl: string;
  watchedAt: Date | null;
};

export async function getPublicWebinar(accountSlug: string): Promise<PublicWebinarData | null> {
  const [row] = await db
    .select({
      webinarId: webinars.id,
      accountWebinarId: accountWebinars.id,
      accountId: accounts.id,
      accountName: accounts.name,
      accountSlug: accounts.slug,
      title: webinars.title,
      description: webinars.description,
      thumbnailUrl: webinars.thumbnailUrl,
      durationSeconds: webinars.durationSeconds,
      customIntro: accountWebinars.customIntro,
      accountWebinarIsActive: accountWebinars.isActive,
      webinarIsActive: webinars.isActive,
    })
    .from(accounts)
    .innerJoin(accountWebinars, and(eq(accountWebinars.accountId, accounts.id), eq(accountWebinars.isActive, true)))
    .innerJoin(webinars, and(eq(webinars.id, accountWebinars.webinarId), eq(webinars.isActive, true)))
    .where(and(eq(accounts.slug, accountSlug), eq(accounts.isActive, true)))
    .limit(1);
  if (!row || !row.accountWebinarIsActive || !row.webinarIsActive) return null;
  return { ...row, accountSlug: row.accountSlug ?? accountSlug, whatsappNumber: null };
}

export async function registerForWebinar(data: {
  accountId: string;
  accountWebinarId: string;
  name: string;
  whatsappNumber: string;
  email?: string;
  pdpaConsent: boolean;
  consentText: string;
  ipAddress: string;
  userAgent: string;
}): Promise<{ watchToken: string; id: string } | null> {
  const watchToken = nanoid(32);
  const [row] = await db
    .insert(webinarRegistrations)
    .values({ ...data, watchToken, registeredAt: new Date() })
    .returning({ watchToken: webinarRegistrations.watchToken, id: webinarRegistrations.id });
  return row ? { watchToken: row.watchToken, id: row.id } : null;
}

export async function getReplayByToken(watchToken: string): Promise<ReplayData | null> {
  const [row] = await db
    .select({
      registrationId: webinarRegistrations.id,
      accountWebinarId: webinarRegistrations.accountWebinarId,
      accountId: webinarRegistrations.accountId,
      accountName: accounts.name,
      accountSlug: accounts.slug,
      webinarTitle: webinars.title,
      bunnyVideoId: webinars.bunnyVideoId,
      bunnyLibraryId: webinars.bunnyLibraryId,
      watchedAt: webinarRegistrations.watchedAt,
    })
    .from(webinarRegistrations)
    .innerJoin(accountWebinars, eq(accountWebinars.id, webinarRegistrations.accountWebinarId))
    .innerJoin(webinars, eq(webinars.id, accountWebinars.webinarId))
    .innerJoin(accounts, eq(accounts.id, webinarRegistrations.accountId))
    .where(eq(webinarRegistrations.watchToken, watchToken))
    .limit(1);
  if (!row) return null;
  return {
    registrationId: row.registrationId,
    accountWebinarId: row.accountWebinarId,
    accountId: row.accountId,
    accountName: row.accountName,
    accountSlug: row.accountSlug ?? "",
    webinarTitle: row.webinarTitle,
    bunnyEmbedUrl: `https://iframe.mediadelivery.net/embed/${row.bunnyLibraryId}/${row.bunnyVideoId}?autoplay=false&responsive=true&captions=false`,
    watchedAt: row.watchedAt,
  };
}

export async function countRegistrationsLastHourByIp(
  accountWebinarId: string,
  ip: string
): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`COUNT(*)::int` })
    .from(webinarRegistrations)
    .where(
      and(
        eq(webinarRegistrations.accountWebinarId, accountWebinarId),
        eq(webinarRegistrations.ipAddress, ip),
        gt(webinarRegistrations.registeredAt, sql`NOW() - INTERVAL '1 hour'`)
      )
    );
  return row?.count ?? 0;
}
