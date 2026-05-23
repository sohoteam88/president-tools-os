import Link from "next/link";
import { redirect } from "next/navigation";
import { getServerAccount } from "@/lib/auth/session";
import { scopedDb, adminDb } from "@/lib/db/scoped";
import { getServerTranslations } from "@/lib/locale-server";
import { formatDuration } from "@/app/webinar/_components/webinar-register-page";

export const metadata = { title: "Webinars" };

export default async function WebinarsPage() {
  const account = await getServerAccount();
  if (!account) redirect("/login");
  const t = getServerTranslations();
  const master = await adminDb.webinars.getActive();
  const userDb = scopedDb(account.id);
  const [activation, registrations] = await Promise.all([
    userDb.webinars.getActivation(),
    userDb.webinars.listRegistrations(200),
  ]);

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      <h1 className="text-2xl font-semibold">{t.myWebinarReplay}</h1>
      {!account.slug ? <p className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">{t.setFunnelFirstWebinar}</p> : null}
      {!master ? (
        <p className="rounded-lg border p-4 text-sm text-muted-foreground">{t.noWebinarAvailable}</p>
      ) : (
        <div className="rounded-lg border p-5">
          <div className="flex gap-4">
            {master.thumbnailUrl ? <img src={master.thumbnailUrl} alt="" className="h-24 w-24 rounded-md object-cover" /> : null}
            <div>
              <h2 className="font-semibold">{master.title}</h2>
              <p className="text-sm text-muted-foreground">{formatDuration(master.durationSeconds)}</p>
              <p className="mt-2 text-sm">{t.statusLabel}: {activation?.isActive ? `● ${t.activeStatus}` : `○ ${t.inactiveStatus}`}</p>
              <p className="text-sm text-muted-foreground">{t.totalRegistrations} {registrations.length}</p>
              <p className="text-sm text-muted-foreground">{t.watched} {registrations.filter((r) => r.watchedAt).length}</p>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {!activation?.isActive
              ? <ActionButton endpoint="/api/webinars/activate" label={t.activateWebinarPage} disabled={!account.slug} />
              : <ActionButton endpoint="/api/webinars/deactivate" label={t.deactivate} />}
            <Link href="/webinars/registrations" className="rounded-md border px-3 py-2 text-sm">{t.registrations}</Link>
            {account.slug ? <Link href={`/webinar/${account.slug}`} className="rounded-md border px-3 py-2 text-sm">{t.preview}</Link> : null}
          </div>
          {account.slug ? <p className="mt-4 text-sm text-muted-foreground">{t.publicLink} /webinar/{account.slug}</p> : null}
        </div>
      )}
      {activation ? (
        <form action="/api/webinars/intro" method="POST" className="space-y-3 rounded-lg border p-5">
          <h2 className="font-semibold">{t.customIntro}</h2>
          <textarea name="customIntro" maxLength={300} defaultValue={activation.customIntro ?? ""} className="min-h-24 w-full rounded-md border px-3 py-2 text-sm" />
          <button className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">{t.saveIntro}</button>
        </form>
      ) : null}
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
