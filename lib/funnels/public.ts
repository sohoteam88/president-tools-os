/**
 * PUBLIC — no account scope. Accessible without authentication.
 * All queries explicitly filter by status = 'published' or use explicit IDs.
 */

import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { accounts, funnels, funnelLeads } from "@/lib/db/schema";
import type { Funnel } from "@/lib/db/schema/funnels";

export type PublicFunnelData = {
  funnel: Funnel;
  accountName: string;
  accountSlug: string;
};

export async function getPublicFunnel(
  accountSlug: string,
  pathSlug = ""
): Promise<PublicFunnelData | null> {
  const [account] = await db
    .select({ id: accounts.id, name: accounts.name, isActive: accounts.isActive, slug: accounts.slug })
    .from(accounts)
    .where(and(eq(accounts.slug, accountSlug), eq(accounts.isActive, true)))
    .limit(1);
  if (!account) return null;

  const [funnel] = await db
    .select()
    .from(funnels)
    .where(
      and(
        eq(funnels.accountId, account.id),
        eq(funnels.pathSlug, pathSlug),
        eq(funnels.status, "published")
      )
    )
    .limit(1);
  if (!funnel) return null;
  if (funnel.status !== "published") return null;

  return { funnel, accountName: account.name, accountSlug: account.slug ?? accountSlug };
}

export async function submitPublicLead(data: {
  funnelId: string;
  accountId: string;
  name: string;
  whatsappNumber: string;
  email?: string;
  pdpaConsent: boolean;
  consentText: string;
  ipAddress: string;
  userAgent: string;
}): Promise<{ id: string } | null> {
  const [lead] = await db
    .insert(funnelLeads)
    .values({ ...data, submittedAt: new Date() })
    .returning({ id: funnelLeads.id });
  return lead ?? null;
}
