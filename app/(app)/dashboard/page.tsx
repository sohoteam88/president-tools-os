import { getServerAccount } from "@/lib/auth/session";
import { redirect } from "next/navigation";
import Link from "next/link";
import { TaskWidget } from "./_components/task-widget";
import { scopedDb } from "@/lib/db/scoped";
import { getMytDateString } from "@/lib/coach/date";
import { getLastMondayDate } from "@/lib/voice/weekly-compile";
import { getServerTranslations, getServerLocale, getLocaleDateString } from "@/lib/locale-server";

export const metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const account = await getServerAccount();
  if (!account) redirect("/login");

  const t = getServerTranslations();
  const locale = getServerLocale();

  const voiceCaptureComplete = !!account.voiceCaptureCompletedAt;
  const accountDb = scopedDb(account.id);
  const [stageCounts, pendingTasksToday, publishedFunnels, magnetDownloads, weeklySeeds] = await Promise.all([
    accountDb.crm.countByStage(),
    accountDb.coach.countPendingToday(getMytDateString()),
    accountDb.funnels.countPublished(),
    accountDb.magnets.countDownloadsToday(),
    accountDb.voice.getWeeklySeeds(getLastMondayDate()),
  ]);
  const contactsTotal = Object.values(stageCounts).reduce((sum, value) => sum + value, 0);

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-8">
      {/* Welcome */}
      <div className="space-y-1">
        <h1 className="text-xl font-semibold text-foreground">
          {t.welcomeBack}, {account.name}
        </h1>
        <p className="text-sm text-muted-foreground">
          {getLocaleDateString(locale)}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <QuickStat label={t.contacts} value={contactsTotal} />
        <QuickStat label={t.tasksToday} value={pendingTasksToday} />
        <QuickStat label={t.publishedFunnels} value={publishedFunnels} />
        <QuickStat label={t.magnetDownloads} value={magnetDownloads} />
      </div>

      {/* Voice Capture CTA */}
      {!voiceCaptureComplete && (
        <div className="rounded-lg border-2 border-primary/20 bg-primary/5 px-6 py-5 space-y-3">
          <div className="flex items-center gap-2">
            <span className="text-2xl">🎙️</span>
            <h2 className="text-base font-semibold text-foreground">
              {t.startWithYourVoice}
            </h2>
          </div>
          <p className="text-sm text-muted-foreground">{t.voiceCaptureCtaDesc}</p>
          <Link
            href="/voice"
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            {t.startVoiceCapture} →
          </Link>
        </div>
      )}

      <TaskWidget />

      {weeklySeeds?.seeds.length ? (
        <section className="rounded-md border border-border bg-card p-4">
          <div className="mb-3">
            <h2 className="text-sm font-semibold">{t.weeklyInspiration}</h2>
            <p className="text-xs text-muted-foreground">{t.weeklyInspirationDesc}</p>
          </div>
          <div className="grid gap-2 md:grid-cols-5">
            {weeklySeeds.seeds.map((seed, index) => (
              <Link
                key={`${seed.momentId}-${index}`}
                href="/voice"
                className="rounded-md border border-border p-3 text-xs hover:border-primary/40"
              >
                <span className="font-medium text-foreground">{seed.topic}</span>
                <span className="mt-1 line-clamp-2 block text-muted-foreground">{seed.seedText}</span>
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      {/* Module grid */}
      <div>
        <h2 className="text-sm font-medium text-foreground mb-3">{t.modules}</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <ModuleCard icon="🎙️" label={t.voiceCapture} description={t.voiceCaptureDesc} href="/voice" available complete={voiceCaptureComplete} doneLabel={t.done} lockedLabel={t.locked} soonLabel={t.soon} />
          <ModuleCard icon="✅" label={t.dailyCoach} description={t.dailyCoachDesc} href="/coach" available doneLabel={t.done} lockedLabel={t.locked} soonLabel={t.soon} />
          <ModuleCard icon="✍️" label={t.contentStudio} description={t.contentStudioDesc} href="/content" available locked={!voiceCaptureComplete} doneLabel={t.done} lockedLabel={t.locked} soonLabel={t.soon} />
          <ModuleCard icon="📣" label={t.funnels} description={t.funnelsDesc} href="/funnels" available doneLabel={t.done} lockedLabel={t.locked} soonLabel={t.soon} />
          <ModuleCard icon="🎥" label={t.webinars} description={t.webinarsDesc} href="/webinars" available doneLabel={t.done} lockedLabel={t.locked} soonLabel={t.soon} />
          <ModuleCard icon="👥" label={t.contacts} description={t.contactsDesc} href="/contacts" available doneLabel={t.done} lockedLabel={t.locked} soonLabel={t.soon} />
          <ModuleCard icon="📊" label={t.analytics} description={t.analyticsDesc} href="/analytics" available={false} doneLabel={t.done} lockedLabel={t.locked} soonLabel={t.soon} />
        </div>
      </div>
    </div>
  );
}

function QuickStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-border bg-card px-4 py-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-xl font-semibold">{value}</p>
    </div>
  );
}

interface ModuleCardProps {
  icon: string;
  label: string;
  description: string;
  href: string;
  available: boolean;
  complete?: boolean;
  locked?: boolean;
  doneLabel: string;
  lockedLabel: string;
  soonLabel: string;
}

function ModuleCard({ icon, label, description, href, available, complete, locked, doneLabel, lockedLabel, soonLabel }: ModuleCardProps) {
  const content = (
    <div className={`rounded-lg border border-border bg-card px-4 py-4 space-y-1.5 ${available ? "hover:border-primary/40 transition-colors cursor-pointer" : "opacity-50"}`}>
      <div className="flex items-center justify-between">
        <span className="text-xl">{icon}</span>
        {complete && (
          <span className="text-[10px] text-green-600 font-medium bg-green-50 px-1.5 py-0.5 rounded-full border border-green-200">{doneLabel}</span>
        )}
        {locked && (
          <span className="text-[10px] text-amber-600 font-medium bg-amber-50 px-1.5 py-0.5 rounded-full border border-amber-200">{lockedLabel}</span>
        )}
        {!available && !locked && (
          <span className="text-[10px] text-muted-foreground/60">{soonLabel}</span>
        )}
      </div>
      <p className="text-sm font-medium text-foreground">{label}</p>
      <p className="text-xs text-muted-foreground leading-snug">{description}</p>
    </div>
  );

  if (!available) return content;
  return <Link href={href}>{content}</Link>;
}
