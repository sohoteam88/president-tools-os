import Link from "next/link";
import { redirect } from "next/navigation";
import { getServerAccount } from "@/lib/auth/session";
import { scopedDb, adminDb } from "@/lib/db/scoped";
import { getServerTranslations } from "@/lib/locale-server";

export const metadata = { title: "Lead Magnets" };

export default async function MagnetsPage() {
  const account = await getServerAccount();
  if (!account) redirect("/login");
  const t = getServerTranslations();
  const master = await adminDb.magnets.getActive();
  const activation = await scopedDb(account.id).magnets.getActivation();
  const downloads = await scopedDb(account.id).magnets.listDownloads(200);
  const isStale = !!activation && !!master && activation.masterVersionAtPersonalisation !== master.version;

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      <h1 className="text-2xl font-semibold">{t.myLeadMagnet}</h1>
      {!account.slug ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          {t.setFunnelFirst} <Link href="/funnels" className="font-medium underline">{t.goToFunnels}</Link>
        </div>
      ) : null}
      {!master ? (
        <p className="rounded-lg border p-4 text-sm text-muted-foreground">{t.noMagnetTemplate}</p>
      ) : (
        <div className="rounded-lg border border-border p-5">
          <div className="flex gap-4">
            {master.thumbnailUrl ? <img src={master.thumbnailUrl} alt="" className="h-24 w-24 rounded-md object-cover" /> : null}
            <div className="min-w-0 flex-1">
              <h2 className="font-semibold">{master.title}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{master.description}</p>
              <p className="mt-3 text-sm">{t.statusLabel}: {activation?.isActive ? `● ${t.activeStatus}` : `○ ${t.inactiveStatus}`}</p>
              <p className="text-sm text-muted-foreground">{t.totalDownloads} {downloads.length}</p>
            </div>
          </div>
          {isStale ? <p className="mt-4 rounded-md bg-amber-50 p-3 text-sm text-amber-800">{t.outdatedPdf}</p> : null}
          <div className="mt-4 flex flex-wrap gap-2">
            {!activation?.isActive
              ? <ActionButton endpoint="/api/magnets/activate" label={t.activateLeadMagnet} disabled={!account.slug} />
              : <ActionButton endpoint="/api/magnets/deactivate" label={t.deactivate} />}
            <ActionButton endpoint="/api/magnets/regenerate" label={t.regeneratePdf} disabled={!activation?.isActive} />
            {account.slug ? <Link className="rounded-md border px-3 py-2 text-sm" href={`/magnet/${account.slug}`}>{t.preview}</Link> : null}
            <Link className="rounded-md border px-3 py-2 text-sm" href="/magnets/downloads">{t.downloads}</Link>
          </div>
          {account.slug ? <p className="mt-4 text-sm text-muted-foreground">{t.publicLink} /magnet/{account.slug}</p> : null}
        </div>
      )}
    </div>
  );
}

function ActionButton({ endpoint, label, disabled }: { endpoint: string; label: string; disabled?: boolean }) {
  return (
    <form action={endpoint} method="POST">
      <button disabled={disabled} className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50">
        {label}
      </button>
    </form>
  );
}
