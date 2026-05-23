/**
 * PUBLIC — no account scope. Accessible without authentication.
 * All queries check is_active explicitly.
 */

import { and, eq, gt, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { accounts, accountLeadMagnets, leadMagnets, leadMagnetDownloads } from "@/lib/db/schema";

export type PublicMagnetData = {
  magnetId: string;
  accountLeadMagnetId: string;
  accountId: string;
  accountName: string;
  accountSlug: string;
  title: string;
  description: string;
  thumbnailUrl: string | null;
};

export async function getPublicMagnet(accountSlug: string): Promise<PublicMagnetData | null> {
  const [row] = await db
    .select({
      magnetId: leadMagnets.id,
      accountLeadMagnetId: accountLeadMagnets.id,
      accountId: accounts.id,
      accountName: accounts.name,
      accountSlug: accounts.slug,
      title: leadMagnets.title,
      description: leadMagnets.description,
      thumbnailUrl: leadMagnets.thumbnailUrl,
    })
    .from(accounts)
    .innerJoin(
      accountLeadMagnets,
      and(
        eq(accountLeadMagnets.accountId, accounts.id),
        eq(accountLeadMagnets.isActive, true)
      )
    )
    .innerJoin(
      leadMagnets,
      and(eq(leadMagnets.id, accountLeadMagnets.leadMagnetId), eq(leadMagnets.isActive, true))
    )
    .where(and(eq(accounts.slug, accountSlug), eq(accounts.isActive, true)))
    .limit(1);

  if (!row) return null;
  return { ...row, accountSlug: row.accountSlug ?? accountSlug };
}

export async function countDownloadsLastHourByIp(
  accountLeadMagnetId: string,
  ip: string
): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`COUNT(*)::int` })
    .from(leadMagnetDownloads)
    .where(
      and(
        eq(leadMagnetDownloads.accountLeadMagnetId, accountLeadMagnetId),
        eq(leadMagnetDownloads.ipAddress, ip),
        gt(leadMagnetDownloads.downloadedAt, sql`NOW() - INTERVAL '1 hour'`)
      )
    );
  return row?.count ?? 0;
}

export async function recordDownload(data: {
  accountId: string;
  accountLeadMagnetId: string;
  name: string;
  whatsappNumber: string;
  email?: string;
  pdpaConsent: boolean;
  consentText: string;
  ipAddress: string;
  userAgent: string;
}): Promise<{ id: string } | null> {
  const [row] = await db
    .insert(leadMagnetDownloads)
    .values({ ...data, downloadedAt: new Date() })
    .returning({ id: leadMagnetDownloads.id });
  return row ?? null;
}
