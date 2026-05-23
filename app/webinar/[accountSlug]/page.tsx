import { notFound } from "next/navigation";
import { getPublicWebinar } from "@/lib/webinars/public";
import { WebinarRegisterPage } from "../_components/webinar-register-page";

export default async function WebinarPage({ params }: { params: { accountSlug: string } }) {
  const data = await getPublicWebinar(params.accountSlug);
  if (!data) notFound();
  return <WebinarRegisterPage webinar={data} />;
}
