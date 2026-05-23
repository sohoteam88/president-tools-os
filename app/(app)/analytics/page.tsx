import { redirect } from "next/navigation";
import { getServerAccount } from "@/lib/auth/session";
import { scopedDb } from "@/lib/db/scoped";
import { AdInsightsClient } from "./ad-insights-client";

export const metadata = { title: "Ad Insights" };

export default async function AnalyticsPage() {
  const account = await getServerAccount();
  if (!account) redirect("/login");
  const userDb = scopedDb(account.id);
  const [entries, analysis] = await Promise.all([
    userDb.ads.list({ limit: 50 }),
    userDb.ads.getAnalysis(),
  ]);
  return <AdInsightsClient initialEntries={entries} initialAnalysis={analysis ?? null} />;
}
