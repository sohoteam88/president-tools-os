import { notFound } from "next/navigation";
import { getPublicMagnet } from "@/lib/magnets/public";
import { MagnetGatePage } from "../_components/magnet-gate-page";

export default async function MagnetPage({ params }: { params: { accountSlug: string } }) {
  const data = await getPublicMagnet(params.accountSlug);
  if (!data) notFound();
  return <MagnetGatePage magnet={data} />;
}
