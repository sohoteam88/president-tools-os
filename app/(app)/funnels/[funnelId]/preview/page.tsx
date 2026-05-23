import { notFound, redirect } from "next/navigation";
import { getServerAccount } from "@/lib/auth/session";
import { scopedDb } from "@/lib/db/scoped";
import { PublicFunnelView } from "@/app/funnel/_components/public-funnel-view";

export default async function PreviewFunnelPage({ params }: { params: { funnelId: string } }) {
  const account = await getServerAccount();
  if (!account) redirect("/login");
  const funnel = await scopedDb(account.id).funnels.get(params.funnelId);
  if (!funnel) notFound();
  return <PublicFunnelView funnel={funnel} accountName={account.name} accountSlug={account.slug ?? "preview"} />;
}
