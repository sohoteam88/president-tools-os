import Link from "next/link";
import { redirect } from "next/navigation";
import { getServerAccount } from "@/lib/auth/session";
import { scopedDb } from "@/lib/db/scoped";
import { ContentStudioClient } from "./_components/content-studio-client";
import { getServerTranslations } from "@/lib/locale-server";

export const metadata = { title: "Content Studio" };

export default async function ContentPage() {
  const account = await getServerAccount();
  if (!account) redirect("/login");

  const t = getServerTranslations();

  if (!account.voiceCaptureCompletedAt) {
    return (
      <div className="mx-auto max-w-3xl p-6">
        <div className="rounded-lg border-2 border-dashed border-border bg-muted/20 px-8 py-12 text-center">
          <span className="text-4xl">🔒</span>
          <p className="mt-4 text-sm font-medium">{t.voiceCaptureLocked}</p>
          <Link href="/voice" className="mt-4 inline-flex rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">
            {t.goToVoiceCapture} →
          </Link>
        </div>
      </div>
    );
  }

  const drafts = await scopedDb(account.id).content.listDrafts(10);

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">{t.contentStudio}</h1>
        <p className="text-sm text-muted-foreground">{t.contentStudioSubtitle}</p>
      </div>
      <ContentStudioClient initialDrafts={drafts} />
    </div>
  );
}
