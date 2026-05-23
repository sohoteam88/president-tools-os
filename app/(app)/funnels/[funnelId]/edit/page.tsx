import { notFound, redirect } from "next/navigation";
import { getServerAccount } from "@/lib/auth/session";
import { scopedDb } from "@/lib/db/scoped";
import { FunnelEditorForm } from "../../_components/funnel-editor-form";

export default async function EditFunnelPage({ params }: { params: { funnelId: string } }) {
  const account = await getServerAccount();
  if (!account) redirect("/login");
  const funnel = await scopedDb(account.id).funnels.get(params.funnelId);
  if (!funnel) notFound();
  return (
    <div className="mx-auto max-w-6xl space-y-4 p-6">
      {funnel.funnelType === "free_resource" ? (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
          This funnel links to your Lead Magnet page: /magnet/{account.slug ?? "your-slug"}.
          Activate your Lead Magnet first at /magnets before publishing.
        </div>
      ) : null}
      {funnel.funnelType === "event_rsvp" ? (
        <div className="rounded-lg border border-sky-200 bg-sky-50 p-4 text-sm text-sky-800">
          This funnel will send prospects to your Webinar registration page: /webinar/{account.slug ?? "your-slug"}.
          Activate your Webinar first at /webinars before publishing.
        </div>
      ) : null}
      <FunnelEditorForm funnel={funnel} />
    </div>
  );
}
