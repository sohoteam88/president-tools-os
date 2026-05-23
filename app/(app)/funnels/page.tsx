import Link from "next/link";
import { redirect } from "next/navigation";
import { getServerAccount } from "@/lib/auth/session";
import { scopedDb } from "@/lib/db/scoped";
import { getServerTranslations } from "@/lib/locale-server";
import { FunnelSlugSetup } from "./_components/funnel-slug-setup";
import { FunnelCard } from "./_components/funnel-card";
import { EmptyState } from "@/app/(app)/_components/empty-state";

export const metadata = { title: "Funnels" };

export default async function FunnelsPage() {
  const account = await getServerAccount();
  if (!account) redirect("/login");
  const t = getServerTranslations();
  const funnels = await scopedDb(account.id).funnels.list();
  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{t.funnels}</h1>
          {account.slug ? <p className="text-sm text-muted-foreground">{t.yourFunnelAddress} {account.slug}.yourteam.com</p> : null}
        </div>
        <Link href="/funnels/new" className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">{t.newFunnel}</Link>
      </div>
      {!account.slug ? <FunnelSlugSetup /> : null}
      <div className="space-y-3">
        {funnels.map((funnel) => <FunnelCard key={funnel.id} funnel={funnel} accountSlug={account.slug} editLabel={t.edit} leadsLabel={t.leads} previewLabel={t.preview} noSlugLabel={t.noSlugSet} />)}
        {funnels.length === 0 ? (
          <EmptyState title={t.noFunnelsYet} description={t.noFunnelsDesc} actionLabel={t.newFunnel} actionHref="/funnels/new" />
        ) : null}
      </div>
    </div>
  );
}
