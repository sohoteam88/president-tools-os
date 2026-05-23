import { notFound } from "next/navigation";
import { getReplayByToken } from "@/lib/webinars/public";
import { WebinarReplayPage } from "../../../_components/webinar-replay-page";

export default async function WebinarWatchPage({ params }: { params: { watchToken: string } }) {
  const replay = await getReplayByToken(params.watchToken);
  if (!replay) notFound();
  return <WebinarReplayPage replay={replay} watchToken={params.watchToken} />;
}
