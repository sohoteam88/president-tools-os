import { notFound } from "next/navigation";
import { getPublicFunnel } from "@/lib/funnels/public";
import { PublicFunnelView } from "../../_components/public-funnel-view";

export default async function PathFunnelPage({ params }: { params: { accountSlug: string; pathSlug: string } }) {
  const data = await getPublicFunnel(params.accountSlug, params.pathSlug);
  if (!data) notFound();
  return <PublicFunnelView funnel={data.funnel} accountName={data.accountName} accountSlug={data.accountSlug} />;
}
