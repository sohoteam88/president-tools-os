/**
 * scopedDb — Account-scoped database query helper.
 *
 * ALL application queries (except admin cross-account reads) MUST go through
 * this helper. It automatically injects the account_id WHERE clause so a
 * developer cannot accidentally leak data across tenant boundaries.
 *
 * Defense-in-depth strategy:
 * 1. This helper (application-level) — primary guard
 * 2. Postgres RLS policies (database-level) — secondary guard
 *
 * From ENGINEERING_RULES.md R1.1:
 *   ❌ db.select().from(leadsTable)
 *   ✅ scopedDb(accountId).leads.list()
 */

import { db } from "@/lib/db";
import {
  accounts,
  users,
  accountMemberships,
  inviteTokens,
  auditLogs,
  voiceCaptures,
  voiceProfiles,
  whyStorySessions,
  journeyMoments,
  weeklyDraftSeeds,
  contentDrafts,
  contentComplianceLogs,
  funnels,
  funnelLeads,
  leadMagnets,
  accountLeadMagnets,
  leadMagnetDownloads,
  webinars,
  accountWebinars,
  webinarRegistrations,
  contacts,
  contactActivities,
  dailyTasks,
  coachGenerations,
  adEntries,
  adAnalyses,
  objectionResponses,
  accountObjectionFavourites,
  accountObjectionResponses,
} from "@/lib/db/schema";
import {
  and,
  asc,
  count,
  eq,
  desc,
  gte,
  isNull,
  isNotNull,
  lte,
  max,
  or,
  sql,
} from "drizzle-orm";
import type {
  Account,
  NewAuditLog,
  InviteToken,
} from "@/lib/db/schema/accounts";
import type {
  NewVoiceCapture,
  NewVoiceProfile,
  VoiceCapture,
  VoiceProfile,
  NewWhyStorySession,
  WhyStorySession,
  NewJourneyMoment,
  JourneyMoment,
  NewWeeklyDraftSeed,
  WeeklyDraftSeed,
} from "@/lib/db/schema/voice";
import type {
  ContentDraft,
  NewContentDraft,
  NewContentComplianceLog,
} from "@/lib/db/schema/content";
import type {
  Funnel,
  NewFunnel,
  FunnelLead,
  NewFunnelLead,
} from "@/lib/db/schema/funnels";
import type {
  LeadMagnet,
  NewLeadMagnet,
  AccountLeadMagnet,
  LeadMagnetDownload,
  NewLeadMagnetDownload,
} from "@/lib/db/schema/magnets";
import type {
  Webinar,
  NewWebinar,
  AccountWebinar,
  WebinarRegistration,
} from "@/lib/db/schema/webinars";
import type {
  Contact,
  NewContact,
  ContactActivity,
  NewContactActivity,
} from "@/lib/db/schema/crm";
import { emptyStageCounts, type PipelineStage } from "@/lib/crm/types";
import type { DailyTask, NewDailyTask } from "@/lib/db/schema/coach";
import type { TaskStatus } from "@/lib/coach/types";
import { getMytDateString } from "@/lib/coach/date";
import type { AdEntry, NewAdEntry, AdAnalysis } from "@/lib/db/schema/ads";
import { deleteObject } from "@/lib/storage/r2";
import type {
  AccountObjectionResponse,
  NewAccountObjectionResponse,
  ObjectionResponse,
  NewObjectionResponse,
} from "@/lib/db/schema/objections";
import type { ObjectionCategory } from "@/lib/objections/types";
import type { ContentDraftSeed, MomentType } from "@/lib/voice/types";

// ─── Guard ────────────────────────────────────────────────────────────────────

function assertAccountId(accountId: string): void {
  if (!accountId || typeof accountId !== "string" || accountId.trim() === "") {
    throw new Error(
      "[scopedDb] accountId is required and must be a non-empty string. " +
        "Did you forget to call getAccountFromSession() first?"
    );
  }
}

// ─── Scoped DB Factory ────────────────────────────────────────────────────────

export function scopedDb(accountId: string) {
  assertAccountId(accountId);

  return {
    // ── Accounts ─────────────────────────────────────────────────────────────

    accounts: {
      /** Get the current account's details */
      get: async (): Promise<Account | undefined> => {
        const [account] = await db
          .select()
          .from(accounts)
          .where(and(eq(accounts.id, accountId), eq(accounts.isActive, true)));
        return account;
      },

      /** Update the current account */
      update: async (data: Partial<typeof accounts.$inferInsert>) => {
        const [updated] = await db
          .update(accounts)
          .set({ ...data, updatedAt: new Date() })
          .where(eq(accounts.id, accountId))
          .returning();
        return updated;
      },

      setSlug: async (slug: string): Promise<void> => {
        const [published] = await db
          .select({ id: funnels.id })
          .from(funnels)
          .where(
            and(
              eq(funnels.accountId, accountId),
              eq(funnels.status, "published")
            )
          )
          .limit(1);
        if (published) {
          throw new Error("Cannot change slug after publishing");
        }
        await db
          .update(accounts)
          .set({ slug, updatedAt: new Date() })
          .where(eq(accounts.id, accountId));
      },

      /** Mark setup wizard as complete */
      markSetupComplete: async () => {
        return db
          .update(accounts)
          .set({
            setupWizardCompletedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(accounts.id, accountId));
      },

      /** Mark voice capture as complete */
      markVoiceCaptureComplete: async () => {
        return db
          .update(accounts)
          .set({
            voiceCaptureCompletedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(accounts.id, accountId));
      },

      /** Accept Terms of Use */
      acceptTerms: async (version: string) => {
        return db
          .update(accounts)
          .set({
            termsAcceptedAt: new Date(),
            termsVersion: version,
            updatedAt: new Date(),
          })
          .where(eq(accounts.id, accountId));
      },
    },

    // ── Memberships ───────────────────────────────────────────────────────────

    memberships: {
      /** Get all members of this account */
      list: async () => {
        return db
          .select({
            userId: accountMemberships.userId,
            role: accountMemberships.role,
            createdAt: accountMemberships.createdAt,
            user: {
              email: users.email,
              name: users.name,
              avatarUrl: users.avatarUrl,
            },
          })
          .from(accountMemberships)
          .innerJoin(users, eq(accountMemberships.userId, users.id))
          .where(eq(accountMemberships.accountId, accountId));
      },
    },

    // ── Invite Tokens ─────────────────────────────────────────────────────────

    invites: {
      /** List pending (not yet accepted, not expired) invites */
      listPending: async (): Promise<InviteToken[]> => {
        return db
          .select()
          .from(inviteTokens)
          .where(
            and(
              eq(inviteTokens.accountId, accountId),
              isNull(inviteTokens.acceptedAt)
            )
          )
          .orderBy(desc(inviteTokens.createdAt));
      },
    },

    // ── Audit Logs ────────────────────────────────────────────────────────────

    audit: {
      /**
       * Write an audit log entry for this account.
       * Use for all user-facing write operations involving personal data.
       */
      log: async (
        entry: Omit<NewAuditLog, "accountId" | "id" | "createdAt">
      ): Promise<void> => {
        await db.insert(auditLogs).values({
          ...entry,
          accountId,
        });
      },

      /** List recent audit events for this account */
      list: async (limit = 50) => {
        return db
          .select()
          .from(auditLogs)
          .where(eq(auditLogs.accountId, accountId))
          .orderBy(desc(auditLogs.createdAt))
          .limit(limit);
      },
    },

    // ── Voice Capture ───────────────────────────────────────────────────────

    voice: {
      createCapture: async (
        data: Omit<NewVoiceCapture, "accountId" | "id" | "createdAt" | "updatedAt">
      ): Promise<VoiceCapture | undefined> => {
        const [capture] = await db
          .insert(voiceCaptures)
          .values({ ...data, accountId })
          .returning();
        return capture;
      },

      getCapture: async (id: string): Promise<VoiceCapture | undefined> => {
        const [capture] = await db
          .select()
          .from(voiceCaptures)
          .where(and(eq(voiceCaptures.id, id), eq(voiceCaptures.accountId, accountId)))
          .limit(1);
        return capture;
      },

      updateCapture: async (
        id: string,
        data: Partial<Omit<NewVoiceCapture, "id" | "accountId" | "createdAt">>
      ): Promise<VoiceCapture | undefined> => {
        const [capture] = await db
          .update(voiceCaptures)
          .set({ ...data, updatedAt: new Date() })
          .where(and(eq(voiceCaptures.id, id), eq(voiceCaptures.accountId, accountId)))
          .returning();
        return capture;
      },

      deleteWhyStory: async (): Promise<void> => {
        await db
          .delete(voiceCaptures)
          .where(
            and(
              eq(voiceCaptures.accountId, accountId),
              eq(voiceCaptures.type, "why_story")
            )
          );
      },

      listCaptures: async (
        type?: VoiceCapture["type"],
        limit = 20
      ): Promise<VoiceCapture[]> => {
        const filters = [eq(voiceCaptures.accountId, accountId)];
        if (type) filters.push(eq(voiceCaptures.type, type));

        return db
          .select()
          .from(voiceCaptures)
          .where(and(...filters))
          .orderBy(desc(voiceCaptures.recordedAt))
          .limit(limit);
      },

      countTodayDailyJourneys: async (): Promise<number> => {
        const [{ value } = { value: 0 }] = await db
          .select({ value: count() })
          .from(voiceCaptures)
          .where(
            and(
              eq(voiceCaptures.accountId, accountId),
              eq(voiceCaptures.type, "daily_journey"),
              sql`DATE(${voiceCaptures.recordedAt} AT TIME ZONE 'Asia/Kuala_Lumpur') = DATE(now() AT TIME ZONE 'Asia/Kuala_Lumpur')`
            )
          );
        return Number(value);
      },

      getWhyStory: async (): Promise<VoiceCapture | undefined> => {
        const [capture] = await db
          .select()
          .from(voiceCaptures)
          .where(
            and(
              eq(voiceCaptures.accountId, accountId),
              eq(voiceCaptures.type, "why_story"),
              eq(voiceCaptures.status, "accepted")
            )
          )
          .orderBy(desc(voiceCaptures.recordedAt))
          .limit(1);
        return capture;
      },

      getLatestWeeklyCompile: async (): Promise<VoiceCapture | undefined> => {
        const [capture] = await db
          .select()
          .from(voiceCaptures)
          .where(
            and(
              eq(voiceCaptures.accountId, accountId),
              eq(voiceCaptures.type, "weekly_compile"),
              eq(voiceCaptures.status, "accepted")
            )
          )
          .orderBy(desc(voiceCaptures.weekStartDate))
          .limit(1);
        return capture;
      },

      listAcceptedTranscripts: async (limit = 30): Promise<VoiceCapture[]> => {
        return db
          .select()
          .from(voiceCaptures)
          .where(
            and(
              eq(voiceCaptures.accountId, accountId),
              eq(voiceCaptures.status, "accepted"),
              sql`${voiceCaptures.type} IN ('why_story', 'daily_journey')`
            )
          )
          .orderBy(desc(voiceCaptures.recordedAt))
          .limit(limit);
      },

      listDailyJourneysSince: async (since: Date): Promise<VoiceCapture[]> => {
        return db
          .select()
          .from(voiceCaptures)
          .where(
            and(
              eq(voiceCaptures.accountId, accountId),
              eq(voiceCaptures.type, "daily_journey"),
              eq(voiceCaptures.status, "accepted"),
              gte(voiceCaptures.recordedAt, since)
            )
          )
          .orderBy(desc(voiceCaptures.recordedAt));
      },

      getLatestProfile: async (): Promise<VoiceProfile | undefined> => {
        const [profile] = await db
          .select()
          .from(voiceProfiles)
          .where(eq(voiceProfiles.accountId, accountId))
          .orderBy(desc(voiceProfiles.version))
          .limit(1);
        return profile;
      },

      createProfile: async (
        data: Omit<NewVoiceProfile, "accountId" | "id" | "createdAt" | "builtAt">
      ): Promise<VoiceProfile | undefined> => {
        const [profile] = await db
          .insert(voiceProfiles)
          .values({ ...data, accountId })
          .returning();
        return profile;
      },

      getNextVersion: async (): Promise<number> => {
        const [{ current } = { current: null }] = await db
          .select({ current: max(voiceProfiles.version) })
          .from(voiceProfiles)
          .where(eq(voiceProfiles.accountId, accountId));
        return Number(current ?? 0) + 1;
      },

      abandonRecordingWhyStorySessions: async (): Promise<void> => {
        await db
          .update(whyStorySessions)
          .set({ status: "abandoned" })
          .where(and(eq(whyStorySessions.accountId, accountId), eq(whyStorySessions.status, "recording")));
      },

      createWhyStorySession: async (
        data?: Partial<Omit<NewWhyStorySession, "id" | "accountId" | "createdAt">>
      ): Promise<WhyStorySession | undefined> => {
        const [session] = await db
          .insert(whyStorySessions)
          .values({ ...data, accountId, status: data?.status ?? "recording" })
          .returning();
        return session;
      },

      getWhyStorySession: async (sessionId: string): Promise<WhyStorySession | undefined> => {
        const [session] = await db
          .select()
          .from(whyStorySessions)
          .where(and(eq(whyStorySessions.id, sessionId), eq(whyStorySessions.accountId, accountId)))
          .limit(1);
        return session;
      },

      updateWhyStorySession: async (
        sessionId: string,
        data: Partial<Omit<NewWhyStorySession, "id" | "accountId" | "createdAt">>
      ): Promise<WhyStorySession | undefined> => {
        const [session] = await db
          .update(whyStorySessions)
          .set(data)
          .where(and(eq(whyStorySessions.id, sessionId), eq(whyStorySessions.accountId, accountId)))
          .returning();
        return session;
      },

      createJourneyMoments: async (
        data: Array<Omit<NewJourneyMoment, "id" | "accountId" | "createdAt">>
      ): Promise<JourneyMoment[]> => {
        if (data.length === 0) return [];
        return db
          .insert(journeyMoments)
          .values(data.map((moment) => ({ ...moment, accountId })))
          .returning();
      },

      createJourneyMoment: async (
        data: Omit<NewJourneyMoment, "id" | "accountId" | "createdAt">
      ): Promise<JourneyMoment | undefined> => {
        const [moment] = await db
          .insert(journeyMoments)
          .values({ ...data, accountId })
          .returning();
        return moment;
      },

      listConfirmedMoments: async (limit = 50): Promise<JourneyMoment[]> => {
        return db
          .select()
          .from(journeyMoments)
          .where(and(eq(journeyMoments.accountId, accountId), isNotNull(journeyMoments.confirmedAt)))
          .orderBy(desc(journeyMoments.createdAt))
          .limit(limit);
      },

      listRecentConfirmedMoments: async (since: Date, limit = 20): Promise<JourneyMoment[]> => {
        return db
          .select()
          .from(journeyMoments)
          .where(
            and(
              eq(journeyMoments.accountId, accountId),
              isNotNull(journeyMoments.confirmedAt),
              gte(journeyMoments.createdAt, since)
            )
          )
          .orderBy(desc(journeyMoments.createdAt))
          .limit(limit);
      },

      countConfirmedMoments: async (): Promise<number> => {
        const [{ value } = { value: 0 }] = await db
          .select({ value: count() })
          .from(journeyMoments)
          .where(and(eq(journeyMoments.accountId, accountId), isNotNull(journeyMoments.confirmedAt)));
        return Number(value);
      },

      upsertWeeklySeeds: async (weekStart: string, seeds: ContentDraftSeed[]): Promise<void> => {
        await db
          .insert(weeklyDraftSeeds)
          .values({ accountId, weekStart, seeds })
          .onConflictDoUpdate({
            target: [weeklyDraftSeeds.accountId, weeklyDraftSeeds.weekStart],
            set: { seeds, generatedAt: new Date() },
          });
      },

      getWeeklySeeds: async (weekStart: string): Promise<WeeklyDraftSeed | undefined> => {
        const [row] = await db
          .select()
          .from(weeklyDraftSeeds)
          .where(and(eq(weeklyDraftSeeds.accountId, accountId), eq(weeklyDraftSeeds.weekStart, weekStart)))
          .limit(1);
        return row;
      },
    },

    // ── Content Studio ──────────────────────────────────────────────────────

    content: {
      createDraft: async (
        data: Omit<NewContentDraft, "accountId" | "id" | "createdAt" | "updatedAt">
      ): Promise<ContentDraft | undefined> => {
        const [draft] = await db
          .insert(contentDrafts)
          .values({ ...data, accountId })
          .returning();
        return draft;
      },

      getDraft: async (id: string): Promise<ContentDraft | undefined> => {
        const [draft] = await db
          .select()
          .from(contentDrafts)
          .where(and(eq(contentDrafts.id, id), eq(contentDrafts.accountId, accountId)))
          .limit(1);
        return draft;
      },

      updateDraft: async (
        id: string,
        data: Partial<Omit<NewContentDraft, "id" | "accountId" | "createdAt">>
      ): Promise<ContentDraft | undefined> => {
        const [draft] = await db
          .update(contentDrafts)
          .set({ ...data, updatedAt: new Date() })
          .where(and(eq(contentDrafts.id, id), eq(contentDrafts.accountId, accountId)))
          .returning();
        return draft;
      },

      listDrafts: async (limit = 20): Promise<ContentDraft[]> => {
        return db
          .select()
          .from(contentDrafts)
          .where(eq(contentDrafts.accountId, accountId))
          .orderBy(desc(contentDrafts.createdAt))
          .limit(limit);
      },

      countExports: async (): Promise<number> => {
        const [{ value } = { value: 0 }] = await db
          .select({ value: count() })
          .from(contentDrafts)
          .where(
            and(
              eq(contentDrafts.accountId, accountId),
              eq(contentDrafts.complianceStatus, "passed"),
              isNotNull(contentDrafts.exportedAt)
            )
          );
        return Number(value);
      },

      logCompliance: async (
        entry: Omit<NewContentComplianceLog, "id" | "checkedAt" | "accountId">
      ): Promise<void> => {
        await db.insert(contentComplianceLogs).values({
          ...entry,
          accountId,
        });
      },

      deleteDraft: async (id: string): Promise<void> => {
        await db
          .delete(contentDrafts)
          .where(and(eq(contentDrafts.id, id), eq(contentDrafts.accountId, accountId)));
      },
    },

    funnels: {
      create: async (
        data: Omit<NewFunnel, "accountId" | "id" | "createdAt" | "updatedAt">
      ): Promise<Funnel | undefined> => {
        const [funnel] = await db.insert(funnels).values({ ...data, accountId }).returning();
        return funnel;
      },

      get: async (id: string): Promise<Funnel | undefined> => {
        const [funnel] = await db
          .select()
          .from(funnels)
          .where(and(eq(funnels.id, id), eq(funnels.accountId, accountId)))
          .limit(1);
        return funnel;
      },

      getByPathSlug: async (pathSlug: string): Promise<Funnel | undefined> => {
        const [funnel] = await db
          .select()
          .from(funnels)
          .where(and(eq(funnels.pathSlug, pathSlug), eq(funnels.accountId, accountId)))
          .limit(1);
        return funnel;
      },

      update: async (
        id: string,
        data: Partial<Omit<NewFunnel, "id" | "accountId" | "createdAt">>
      ): Promise<Funnel | undefined> => {
        const [funnel] = await db
          .update(funnels)
          .set({ ...data, updatedAt: new Date() })
          .where(and(eq(funnels.id, id), eq(funnels.accountId, accountId)))
          .returning();
        return funnel;
      },

      delete: async (id: string): Promise<void> => {
        const funnel = await scopedDb(accountId).funnels.get(id);
        if (funnel?.status === "published") {
          throw new Error("Unpublish the funnel before deleting.");
        }
        await db.delete(funnels).where(and(eq(funnels.id, id), eq(funnels.accountId, accountId)));
      },

      list: async (): Promise<Funnel[]> => {
        return db
          .select()
          .from(funnels)
          .where(eq(funnels.accountId, accountId))
          .orderBy(desc(funnels.createdAt));
      },

      publish: async (id: string): Promise<Funnel | undefined> => {
        const [funnel] = await db
          .update(funnels)
          .set({
            status: "published",
            publishedAt: sql`COALESCE(${funnels.publishedAt}, now())`,
            updatedAt: new Date(),
          })
          .where(and(eq(funnels.id, id), eq(funnels.accountId, accountId)))
          .returning();
        return funnel;
      },

      unpublish: async (id: string): Promise<Funnel | undefined> => {
        const [funnel] = await db
          .update(funnels)
          .set({ status: "draft", updatedAt: new Date() })
          .where(and(eq(funnels.id, id), eq(funnels.accountId, accountId)))
          .returning();
        return funnel;
      },

      createLead: async (
        data: Omit<NewFunnelLead, "accountId" | "id" | "submittedAt">
      ): Promise<FunnelLead | undefined> => {
        const [lead] = await db.insert(funnelLeads).values({ ...data, accountId }).returning();
        return lead;
      },

      listLeads: async (funnelId: string, limit = 50): Promise<FunnelLead[]> => {
        return db
          .select()
          .from(funnelLeads)
          .where(and(eq(funnelLeads.funnelId, funnelId), eq(funnelLeads.accountId, accountId)))
          .orderBy(desc(funnelLeads.submittedAt))
          .limit(limit);
      },

      updateLeadNotes: async (
        leadId: string,
        notes: string,
        contactedAt?: Date
      ): Promise<void> => {
        await db
          .update(funnelLeads)
          .set({ notes, contactedAt })
          .where(and(eq(funnelLeads.id, leadId), eq(funnelLeads.accountId, accountId)));
      },

      countLeadsToday: async (funnelId: string): Promise<number> => {
        const [{ value } = { value: 0 }] = await db
          .select({ value: count() })
          .from(funnelLeads)
          .where(
            and(
              eq(funnelLeads.funnelId, funnelId),
              eq(funnelLeads.accountId, accountId),
              sql`DATE(${funnelLeads.submittedAt}) = CURRENT_DATE`
            )
          );
        return Number(value);
      },

      countPublished: async (): Promise<number> => {
        const [{ value } = { value: 0 }] = await db
          .select({ value: count() })
          .from(funnels)
          .where(and(eq(funnels.accountId, accountId), eq(funnels.status, "published")));
        return Number(value);
      },

      countLeadsLastHourByIp: async (funnelId: string, ipAddress: string): Promise<number> => {
        const [{ value } = { value: 0 }] = await db
          .select({ value: count() })
          .from(funnelLeads)
          .where(
            and(
              eq(funnelLeads.funnelId, funnelId),
              eq(funnelLeads.ipAddress, ipAddress),
              sql`${funnelLeads.submittedAt} > now() - interval '1 hour'`
            )
          );
        return Number(value);
      },
    },

    magnets: {
      getActivation: async (): Promise<AccountLeadMagnet | undefined> => {
        const [activation] = await db
          .select()
          .from(accountLeadMagnets)
          .where(eq(accountLeadMagnets.accountId, accountId))
          .limit(1);
        return activation;
      },

      activate: async (leadMagnetId: string): Promise<AccountLeadMagnet> => {
        const [activation] = await db
          .insert(accountLeadMagnets)
          .values({ accountId, leadMagnetId, isActive: true })
          .onConflictDoUpdate({
            target: accountLeadMagnets.accountId,
            set: { leadMagnetId, isActive: true, updatedAt: new Date() },
          })
          .returning();
        if (!activation) throw new Error("Failed to activate lead magnet");
        return activation;
      },

      deactivate: async (): Promise<void> => {
        await db
          .update(accountLeadMagnets)
          .set({ isActive: false, updatedAt: new Date() })
          .where(eq(accountLeadMagnets.accountId, accountId));
      },

      markPersonalised: async (pdfKey: string, masterVersion: number): Promise<void> => {
        await db
          .update(accountLeadMagnets)
          .set({
            personalisedPdfKey: pdfKey,
            personalisedAt: new Date(),
            masterVersionAtPersonalisation: masterVersion,
            updatedAt: new Date(),
          })
          .where(eq(accountLeadMagnets.accountId, accountId));
      },

      listDownloads: async (limit = 50): Promise<LeadMagnetDownload[]> => {
        return db
          .select()
          .from(leadMagnetDownloads)
          .where(eq(leadMagnetDownloads.accountId, accountId))
          .orderBy(desc(leadMagnetDownloads.downloadedAt))
          .limit(limit);
      },

      countDownloadsLastHourByIp: async (ip: string): Promise<number> => {
        const [{ value } = { value: 0 }] = await db
          .select({ value: count() })
          .from(leadMagnetDownloads)
          .where(
            and(
              eq(leadMagnetDownloads.accountId, accountId),
              eq(leadMagnetDownloads.ipAddress, ip),
              sql`${leadMagnetDownloads.downloadedAt} > now() - interval '1 hour'`
            )
          );
        return Number(value);
      },

      countDownloadsToday: async (): Promise<number> => {
        const [{ value } = { value: 0 }] = await db
          .select({ value: count() })
          .from(leadMagnetDownloads)
          .where(
            and(
              eq(leadMagnetDownloads.accountId, accountId),
              sql`DATE(${leadMagnetDownloads.downloadedAt}) = CURRENT_DATE`
            )
          );
        return Number(value);
      },
    },

    webinars: {
      getActivation: async (): Promise<AccountWebinar | undefined> => {
        const [activation] = await db
          .select()
          .from(accountWebinars)
          .where(eq(accountWebinars.accountId, accountId))
          .limit(1);
        return activation;
      },

      activate: async (webinarId: string, customIntro?: string): Promise<AccountWebinar> => {
        const [activation] = await db
          .insert(accountWebinars)
          .values({ accountId, webinarId, customIntro, isActive: true })
          .onConflictDoUpdate({
            target: accountWebinars.accountId,
            set: { webinarId, customIntro, isActive: true, updatedAt: new Date() },
          })
          .returning();
        if (!activation) throw new Error("Failed to activate webinar");
        return activation;
      },

      updateCustomIntro: async (customIntro: string): Promise<void> => {
        await db
          .update(accountWebinars)
          .set({ customIntro, updatedAt: new Date() })
          .where(eq(accountWebinars.accountId, accountId));
      },

      deactivate: async (): Promise<void> => {
        await db
          .update(accountWebinars)
          .set({ isActive: false, updatedAt: new Date() })
          .where(eq(accountWebinars.accountId, accountId));
      },

      listRegistrations: async (limit = 50): Promise<WebinarRegistration[]> => {
        return db
          .select()
          .from(webinarRegistrations)
          .where(eq(webinarRegistrations.accountId, accountId))
          .orderBy(desc(webinarRegistrations.registeredAt))
          .limit(limit);
      },

      markWatched: async (registrationId: string): Promise<void> => {
        await db
          .update(webinarRegistrations)
          .set({ watchedAt: new Date() })
          .where(
            and(
              eq(webinarRegistrations.id, registrationId),
              eq(webinarRegistrations.accountId, accountId),
              isNull(webinarRegistrations.watchedAt)
            )
          );
      },

      countRegistrationsLastHourByIp: async (accountWebinarId: string, ip: string): Promise<number> => {
        const [{ value } = { value: 0 }] = await db
          .select({ value: count() })
          .from(webinarRegistrations)
          .where(
            and(
              eq(webinarRegistrations.accountWebinarId, accountWebinarId),
              eq(webinarRegistrations.ipAddress, ip),
              sql`${webinarRegistrations.registeredAt} > now() - interval '1 hour'`
            )
          );
        return Number(value);
      },

      countRegistrationsToday: async (): Promise<number> => {
        const [{ value } = { value: 0 }] = await db
          .select({ value: count() })
          .from(webinarRegistrations)
          .where(
            and(
              eq(webinarRegistrations.accountId, accountId),
              sql`DATE(${webinarRegistrations.registeredAt}) = CURRENT_DATE`
            )
          );
        return Number(value);
      },
    },

    crm: {
      list: async (opts?: {
        stage?: PipelineStage;
        includeArchived?: boolean;
        limit?: number;
      }): Promise<Contact[]> => {
        const filters = [eq(contacts.accountId, accountId)];
        if (!opts?.includeArchived) filters.push(eq(contacts.isArchived, false));
        if (opts?.stage) filters.push(eq(contacts.stage, opts.stage));

        return db
          .select()
          .from(contacts)
          .where(and(...filters))
          .orderBy(sql`${contacts.lastContactedAt} ASC NULLS FIRST`, desc(contacts.createdAt))
          .limit(opts?.limit ?? 500);
      },

      get: async (contactId: string): Promise<Contact | undefined> => {
        const [contact] = await db
          .select()
          .from(contacts)
          .where(and(eq(contacts.id, contactId), eq(contacts.accountId, accountId)))
          .limit(1);
        return contact;
      },

      getByWhatsApp: async (whatsappNumber: string): Promise<Contact | undefined> => {
        const [contact] = await db
          .select()
          .from(contacts)
          .where(and(eq(contacts.whatsappNumber, whatsappNumber), eq(contacts.accountId, accountId)))
          .limit(1);
        return contact;
      },

      create: async (
        data: Omit<NewContact, "accountId" | "id" | "createdAt" | "updatedAt">
      ): Promise<Contact | undefined> => {
        const [contact] = await db
          .insert(contacts)
          .values({ ...data, accountId })
          .returning();
        if (contact) {
          await db.insert(auditLogs).values({
            accountId,
            actorUserId: null,
            action: "crm.contact.created",
            resourceType: "contact",
            resourceId: contact.id,
          });
        }
        return contact;
      },

      update: async (
        contactId: string,
        data: Partial<Pick<Contact,
          "name" | "whatsappNumber" | "email" | "stage" | "notes" | "lastContactedAt" | "isArchived"
        >>
      ): Promise<Contact | undefined> => {
        const [contact] = await db
          .update(contacts)
          .set({ ...data, updatedAt: new Date() })
          .where(and(eq(contacts.id, contactId), eq(contacts.accountId, accountId)))
          .returning();
        return contact;
      },

      moveStage: async (contactId: string, toStage: PipelineStage): Promise<Contact | undefined> => {
        const existing = await scopedDb(accountId).crm.get(contactId);
        if (!existing) return undefined;
        if (existing.stage === toStage) return existing;
        const [contact] = await db
          .update(contacts)
          .set({ stage: toStage, updatedAt: new Date() })
          .where(and(eq(contacts.id, contactId), eq(contacts.accountId, accountId)))
          .returning();
        if (contact) {
          await scopedDb(accountId).crm.logActivity({
            contactId,
            activityType: "stage_change",
            payload: JSON.stringify({ from: existing.stage, to: toStage }),
          });
          await db.insert(auditLogs).values({
            accountId,
            actorUserId: null,
            action: "crm.contact.stage_changed",
            resourceType: "contact",
            resourceId: contactId,
            metadata: JSON.stringify({ from: existing.stage, to: toStage }),
          });
        }
        return contact;
      },

      archive: async (contactId: string): Promise<void> => {
        await db
          .update(contacts)
          .set({ isArchived: true, updatedAt: new Date() })
          .where(and(eq(contacts.id, contactId), eq(contacts.accountId, accountId)));
        await db.insert(auditLogs).values({
          accountId,
          actorUserId: null,
          action: "crm.contact.archived",
          resourceType: "contact",
          resourceId: contactId,
        });
      },

      unarchive: async (contactId: string): Promise<void> => {
        await db
          .update(contacts)
          .set({ isArchived: false, updatedAt: new Date() })
          .where(and(eq(contacts.id, contactId), eq(contacts.accountId, accountId)));
      },

      countByStage: async (): Promise<Record<PipelineStage, number>> => {
        const rows = await db
          .select({ stage: contacts.stage, value: count() })
          .from(contacts)
          .where(and(eq(contacts.accountId, accountId), eq(contacts.isArchived, false)))
          .groupBy(contacts.stage);
        const counts = emptyStageCounts();
        for (const row of rows) counts[row.stage] = Number(row.value);
        return counts;
      },

      importFromSource: async (opts: {
        sourceId: string;
        source: "funnel" | "lead_magnet" | "webinar";
        name: string;
        whatsappNumber: string;
        email?: string;
      }): Promise<{ contact: Contact; created: boolean }> => {
        const [inserted] = await db
          .insert(contacts)
          .values({
            accountId,
            name: opts.name,
            whatsappNumber: opts.whatsappNumber,
            email: opts.email,
            stage: "new",
            source: opts.source,
            sourceId: opts.sourceId,
          })
          .onConflictDoNothing({ target: [contacts.accountId, contacts.whatsappNumber] })
          .returning();
        if (inserted) {
          await scopedDb(accountId).crm.logActivity({
            contactId: inserted.id,
            activityType: "manual_contact",
            payload: JSON.stringify({ note: `Contact created from ${opts.source}.` }),
          });
          return { contact: inserted, created: true };
        }
        const existing = await scopedDb(accountId).crm.getByWhatsApp(opts.whatsappNumber);
        if (!existing) throw new Error("Contact import failed");
        return { contact: existing, created: false };
      },

      logActivity: async (
        data: Omit<NewContactActivity, "accountId" | "id" | "createdAt">
      ): Promise<void> => {
        await db.insert(contactActivities).values({ ...data, accountId });
      },

      listActivities: async (contactId: string, limit = 20): Promise<ContactActivity[]> => {
        return db
          .select()
          .from(contactActivities)
          .where(and(eq(contactActivities.contactId, contactId), eq(contactActivities.accountId, accountId)))
          .orderBy(desc(contactActivities.createdAt))
          .limit(limit);
      },
    },

    coach: {
      listForDate: async (date: string): Promise<DailyTask[]> => {
        return db
          .select()
          .from(dailyTasks)
          .where(
            and(
              eq(dailyTasks.accountId, accountId),
              eq(dailyTasks.taskDate, date),
              or(eq(dailyTasks.status, "pending"), eq(dailyTasks.status, "done"))
            )
          )
          .orderBy(desc(dailyTasks.isAiGenerated), asc(dailyTasks.createdAt));
      },

      listSnoozed: async (): Promise<DailyTask[]> => {
        return db
          .select()
          .from(dailyTasks)
          .where(
            and(
              eq(dailyTasks.accountId, accountId),
              eq(dailyTasks.status, "snoozed"),
              lte(dailyTasks.snoozedTo, getMytDateString())
            )
          )
          .orderBy(asc(dailyTasks.createdAt));
      },

      createTask: async (
        data: Omit<NewDailyTask, "accountId" | "id" | "createdAt" | "updatedAt">
      ): Promise<DailyTask | undefined> => {
        const [task] = await db
          .insert(dailyTasks)
          .values({ ...data, accountId })
          .returning();
        return task;
      },

      updateStatus: async (
        taskId: string,
        status: TaskStatus,
        opts?: { snoozedTo?: string; completedAt?: Date }
      ): Promise<DailyTask | undefined> => {
        const [task] = await db
          .update(dailyTasks)
          .set({
            status,
            snoozedTo: status === "snoozed" ? opts?.snoozedTo ?? null : null,
            completedAt: status === "done" ? opts?.completedAt ?? new Date() : null,
            updatedAt: new Date(),
          })
          .where(and(eq(dailyTasks.id, taskId), eq(dailyTasks.accountId, accountId)))
          .returning();
        return task;
      },

      countPendingToday: async (date: string): Promise<number> => {
        const [{ value } = { value: 0 }] = await db
          .select({ value: count() })
          .from(dailyTasks)
          .where(
            and(
              eq(dailyTasks.accountId, accountId),
              eq(dailyTasks.taskDate, date),
              eq(dailyTasks.status, "pending")
            )
          );
        return Number(value);
      },

      hasGenerationForDate: async (date: string): Promise<boolean> => {
        const [generation] = await db
          .select({ id: coachGenerations.id })
          .from(coachGenerations)
          .where(
            and(
              eq(coachGenerations.accountId, accountId),
              eq(coachGenerations.generatedForDate, date)
            )
          )
          .limit(1);
        return !!generation;
      },

      recordGeneration: async (data: {
        generatedForDate: string;
        tasksSuggested: number;
        tasksInserted: number;
        promptTokens?: number;
        completionTokens?: number;
      }): Promise<void> => {
        await db
          .insert(coachGenerations)
          .values({ ...data, accountId })
          .onConflictDoNothing({
            target: [coachGenerations.accountId, coachGenerations.generatedForDate],
          });
      },
    },

    ads: {
      list: async (opts?: { platform?: string; limit?: number }): Promise<AdEntry[]> => {
        const filters = [eq(adEntries.accountId, accountId)];
        if (opts?.platform) filters.push(eq(adEntries.platform, opts.platform));
        return db
          .select()
          .from(adEntries)
          .where(and(...filters))
          .orderBy(desc(adEntries.postedAt), desc(adEntries.createdAt))
          .limit(opts?.limit ?? 100);
      },

      get: async (entryId: string): Promise<AdEntry | undefined> => {
        const [entry] = await db
          .select()
          .from(adEntries)
          .where(and(eq(adEntries.id, entryId), eq(adEntries.accountId, accountId)))
          .limit(1);
        return entry;
      },

      create: async (
        data: Omit<NewAdEntry, "accountId" | "id" | "createdAt" | "updatedAt">
      ): Promise<AdEntry | undefined> => {
        const [entry] = await db
          .insert(adEntries)
          .values({ ...data, accountId })
          .returning();
        return entry;
      },

      update: async (
        entryId: string,
        data: Partial<Omit<NewAdEntry, "accountId" | "id" | "createdAt">>
      ): Promise<AdEntry | undefined> => {
        const [entry] = await db
          .update(adEntries)
          .set({ ...data, updatedAt: new Date() })
          .where(and(eq(adEntries.id, entryId), eq(adEntries.accountId, accountId)))
          .returning();
        return entry;
      },

      delete: async (entryId: string): Promise<void> => {
        const entry = await scopedDb(accountId).ads.get(entryId);
        if (entry?.screenshotKey) await deleteObject(entry.screenshotKey);
        await db
          .delete(adEntries)
          .where(and(eq(adEntries.id, entryId), eq(adEntries.accountId, accountId)));
      },

      count: async (): Promise<number> => {
        const [{ value } = { value: 0 }] = await db
          .select({ value: count() })
          .from(adEntries)
          .where(eq(adEntries.accountId, accountId));
        return Number(value);
      },

      getAnalysis: async (): Promise<AdAnalysis | undefined> => {
        const [analysis] = await db
          .select()
          .from(adAnalyses)
          .where(eq(adAnalyses.accountId, accountId))
          .limit(1);
        return analysis;
      },

      upsertAnalysis: async (
        data: Omit<AdAnalysis, "id" | "accountId">
      ): Promise<void> => {
        await db
          .insert(adAnalyses)
          .values({ ...data, accountId })
          .onConflictDoUpdate({
            target: adAnalyses.accountId,
            set: data,
          });
      },
    },

    objections: {
      listFavouriteIds: async (): Promise<string[]> => {
        const rows = await db
          .select({ id: accountObjectionFavourites.objectionResponseId })
          .from(accountObjectionFavourites)
          .where(eq(accountObjectionFavourites.accountId, accountId));
        return rows.map((row) => row.id);
      },

      addFavourite: async (responseId: string): Promise<void> => {
        await db
          .insert(accountObjectionFavourites)
          .values({ accountId, objectionResponseId: responseId })
          .onConflictDoNothing({
            target: [
              accountObjectionFavourites.accountId,
              accountObjectionFavourites.objectionResponseId,
            ],
          });
      },

      removeFavourite: async (responseId: string): Promise<void> => {
        await db
          .delete(accountObjectionFavourites)
          .where(
            and(
              eq(accountObjectionFavourites.accountId, accountId),
              eq(accountObjectionFavourites.objectionResponseId, responseId)
            )
          );
      },

      listPersonal: async (category?: ObjectionCategory): Promise<AccountObjectionResponse[]> => {
        const filters = [eq(accountObjectionResponses.accountId, accountId)];
        if (category) filters.push(eq(accountObjectionResponses.category, category));
        return db
          .select()
          .from(accountObjectionResponses)
          .where(and(...filters))
          .orderBy(desc(accountObjectionResponses.createdAt));
      },

      createPersonal: async (
        data: Omit<NewAccountObjectionResponse, "accountId" | "id" | "createdAt" | "updatedAt">
      ): Promise<AccountObjectionResponse | undefined> => {
        const [response] = await db
          .insert(accountObjectionResponses)
          .values({ ...data, accountId })
          .returning();
        return response;
      },

      updatePersonal: async (
        id: string,
        data: Partial<NewAccountObjectionResponse>
      ): Promise<AccountObjectionResponse | undefined> => {
        const [response] = await db
          .update(accountObjectionResponses)
          .set({ ...data, updatedAt: new Date() })
          .where(and(eq(accountObjectionResponses.id, id), eq(accountObjectionResponses.accountId, accountId)))
          .returning();
        return response;
      },

      deletePersonal: async (id: string): Promise<void> => {
        await db
          .delete(accountObjectionResponses)
          .where(and(eq(accountObjectionResponses.id, id), eq(accountObjectionResponses.accountId, accountId)));
      },
    },
  };
}

// ─── Admin DB (cross-account, ADMIN ONLY) ─────────────────────────────────────

/**
 * adminDb — Cross-account queries for Steven (admin role only).
 *
 * Every call site MUST have a comment:
 *   // ADMIN: cross-account query intentional
 *
 * This is NOT exported from the main lib barrel — must be imported directly.
 */
export const adminDb = {
  accounts: {
    /** List all accounts */
    listAll: async () => {
      // ADMIN: cross-account query intentional
      return db
        .select()
        .from(accounts)
        .orderBy(desc(accounts.createdAt));
    },

    listActive: async (): Promise<Account[]> => {
      // ADMIN: cross-account query intentional
      return db
        .select()
        .from(accounts)
        .where(eq(accounts.isActive, true))
        .orderBy(desc(accounts.createdAt));
    },

    /** Get any account by ID */
    getById: async (id: string): Promise<Account | undefined> => {
      // ADMIN: cross-account query intentional
      const [account] = await db
        .select()
        .from(accounts)
        .where(eq(accounts.id, id));
      return account;
    },

    /** Create a new account (invite flow) */
    create: async (data: typeof accounts.$inferInsert) => {
      // ADMIN: cross-account query intentional
      const [account] = await db
        .insert(accounts)
        .values(data)
        .returning();
      return account;
    },

    update: async (id: string, data: Partial<typeof accounts.$inferInsert>) => {
      // ADMIN: cross-account query intentional
      const [account] = await db
        .update(accounts)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(accounts.id, id))
        .returning();
      return account;
    },

    getStats: async (accountId: string) => {
      // ADMIN: cross-account query intentional
      const [
        [voiceRow],
        [contentRow],
        [funnelRow],
        [contactRow],
        [downloadRow],
        [registrationRow],
        [adRow],
      ] = await Promise.all([
        db.select({ value: count() }).from(voiceCaptures).where(eq(voiceCaptures.accountId, accountId)),
        db.select({ value: count() }).from(contentDrafts).where(eq(contentDrafts.accountId, accountId)),
        db.select({ value: count() }).from(funnels).where(eq(funnels.accountId, accountId)),
        db.select({ value: count() }).from(contacts).where(eq(contacts.accountId, accountId)),
        db.select({ value: count() }).from(leadMagnetDownloads).where(eq(leadMagnetDownloads.accountId, accountId)),
        db.select({ value: count() }).from(webinarRegistrations).where(eq(webinarRegistrations.accountId, accountId)),
        db.select({ value: count() }).from(adEntries).where(eq(adEntries.accountId, accountId)),
      ]);
      return {
        voiceCaptures: Number(voiceRow?.value ?? 0),
        contentDrafts: Number(contentRow?.value ?? 0),
        funnels: Number(funnelRow?.value ?? 0),
        contacts: Number(contactRow?.value ?? 0),
        magnetDownloads: Number(downloadRow?.value ?? 0),
        webinarRegistrations: Number(registrationRow?.value ?? 0),
        adEntries: Number(adRow?.value ?? 0),
      };
    },
  },

  users: {
    getById: async (id: string) => {
      // ADMIN: cross-account query intentional
      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.id, id));
      return user;
    },

    getByEmail: async (email: string) => {
      // ADMIN: cross-account query intentional
      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.email, email));
      return user;
    },

    upsert: async (data: typeof users.$inferInsert) => {
      // ADMIN: cross-account query intentional
      const [user] = await db
        .insert(users)
        .values(data)
        .onConflictDoUpdate({
          target: users.id,
          set: {
            email: data.email,
            name: data.name,
            avatarUrl: data.avatarUrl,
            updatedAt: new Date(),
          },
        })
        .returning();
      return user;
    },
  },

  memberships: {
    /** Add a user to an account */
    create: async (data: typeof accountMemberships.$inferInsert) => {
      // ADMIN: cross-account query intentional
      const [membership] = await db
        .insert(accountMemberships)
        .values(data)
        .returning();
      return membership;
    },

    /** Check if user is member of account */
    get: async (userId: string, accId: string) => {
      // ADMIN: cross-account query intentional
      const [membership] = await db
        .select()
        .from(accountMemberships)
        .where(
          and(
            eq(accountMemberships.userId, userId),
            eq(accountMemberships.accountId, accId)
          )
        );
      return membership;
    },

    /** Get user's primary account */
    getPrimaryAccount: async (userId: string) => {
      // ADMIN: cross-account query intentional
      const [membership] = await db
        .select({
          account: accounts,
          role: accountMemberships.role,
        })
        .from(accountMemberships)
        .innerJoin(accounts, eq(accountMemberships.accountId, accounts.id))
        .where(
          and(
            eq(accountMemberships.userId, userId),
            eq(accounts.isActive, true)
          )
        )
        .limit(1);
      return membership;
    },
  },

  invites: {
    /** Create an invite token */
    create: async (data: typeof inviteTokens.$inferInsert) => {
      // ADMIN: cross-account query intentional
      const [token] = await db
        .insert(inviteTokens)
        .values(data)
        .returning();
      return token;
    },

    /** Find a token by its value */
    findByToken: async (token: string) => {
      // ADMIN: cross-account query intentional
      const [invite] = await db
        .select()
        .from(inviteTokens)
        .where(eq(inviteTokens.token, token));
      return invite;
    },

    listAllWithAccounts: async () => {
      // ADMIN: cross-account query intentional
      return db
        .select({
          id: inviteTokens.id,
          token: inviteTokens.token,
          email: inviteTokens.email,
          role: inviteTokens.role,
          expiresAt: inviteTokens.expiresAt,
          acceptedAt: inviteTokens.acceptedAt,
          createdAt: inviteTokens.createdAt,
          account: {
            id: accounts.id,
            name: accounts.name,
            slug: accounts.slug,
          },
        })
        .from(inviteTokens)
        .innerJoin(accounts, eq(inviteTokens.accountId, accounts.id))
        .orderBy(desc(inviteTokens.createdAt));
    },

    deleteByToken: async (token: string): Promise<void> => {
      // ADMIN: cross-account query intentional
      await db.delete(inviteTokens).where(eq(inviteTokens.token, token));
    },

    /** Mark token as accepted */
    markAccepted: async (id: string) => {
      // ADMIN: cross-account query intentional
      return db
        .update(inviteTokens)
        .set({ acceptedAt: new Date() })
        .where(eq(inviteTokens.id, id));
    },
  },

  audit: {
    /** Write a platform-level (non-account-scoped) audit log */
    log: async (
      entry: Omit<NewAuditLog, "id" | "createdAt">
    ): Promise<void> => {
      // ADMIN: cross-account query intentional
      await db.insert(auditLogs).values(entry);
    },

    listForAccount: async (accountId: string, limit = 20) => {
      // ADMIN: cross-account query intentional
      return db
        .select()
        .from(auditLogs)
        .where(eq(auditLogs.accountId, accountId))
        .orderBy(desc(auditLogs.createdAt))
        .limit(limit);
    },
  },

  usage: {
    getOverview: async () => {
      // ADMIN: cross-account query intentional
      const [
        [coachTokens],
        [adTokens],
        [accountsRow],
        [voiceAccounts],
        [contentAccounts],
        [funnelAccounts],
        [contactAccounts],
        [magnetAccounts],
        [webinarAccounts],
        [adAccounts],
        recentActivity,
      ] = await Promise.all([
        db
          .select({
            promptTokens: sql<number>`coalesce(sum(${coachGenerations.promptTokens}), 0)`,
            completionTokens: sql<number>`coalesce(sum(${coachGenerations.completionTokens}), 0)`,
          })
          .from(coachGenerations),
        db
          .select({
            promptTokens: sql<number>`coalesce(sum(${adAnalyses.promptTokens}), 0)`,
            completionTokens: sql<number>`coalesce(sum(${adAnalyses.completionTokens}), 0)`,
          })
          .from(adAnalyses),
        db.select({ value: count() }).from(accounts),
        db.select({ value: sql<number>`count(distinct ${voiceCaptures.accountId})` }).from(voiceCaptures),
        db.select({ value: sql<number>`count(distinct ${contentDrafts.accountId})` }).from(contentDrafts),
        db.select({ value: sql<number>`count(distinct ${funnels.accountId})` }).from(funnels),
        db.select({ value: sql<number>`count(distinct ${contacts.accountId})` }).from(contacts),
        db.select({ value: sql<number>`count(distinct ${leadMagnetDownloads.accountId})` }).from(leadMagnetDownloads),
        db.select({ value: sql<number>`count(distinct ${webinarRegistrations.accountId})` }).from(webinarRegistrations),
        db.select({ value: sql<number>`count(distinct ${adEntries.accountId})` }).from(adEntries),
        db.select().from(auditLogs).orderBy(desc(auditLogs.createdAt)).limit(25),
      ]);

      return {
        tokenUsage: {
          coach: {
            promptTokens: Number(coachTokens?.promptTokens ?? 0),
            completionTokens: Number(coachTokens?.completionTokens ?? 0),
          },
          adInsights: {
            promptTokens: Number(adTokens?.promptTokens ?? 0),
            completionTokens: Number(adTokens?.completionTokens ?? 0),
          },
          contentStudio: null,
          voiceCapture: null,
        },
        adoption: {
          totalAccounts: Number(accountsRow?.value ?? 0),
          voiceCapture: Number(voiceAccounts?.value ?? 0),
          contentStudio: Number(contentAccounts?.value ?? 0),
          funnels: Number(funnelAccounts?.value ?? 0),
          contacts: Number(contactAccounts?.value ?? 0),
          leadMagnets: Number(magnetAccounts?.value ?? 0),
          webinars: Number(webinarAccounts?.value ?? 0),
          adInsights: Number(adAccounts?.value ?? 0),
        },
        recentActivity,
      };
    },
  },

  magnets: {
    getActive: async (): Promise<LeadMagnet | undefined> => {
      // ADMIN: cross-account query intentional
      const [magnet] = await db
        .select()
        .from(leadMagnets)
        .where(eq(leadMagnets.isActive, true))
        .orderBy(desc(leadMagnets.updatedAt))
        .limit(1);
      return magnet;
    },

    create: async (
      data: Omit<NewLeadMagnet, "id" | "createdAt" | "updatedAt">
    ): Promise<LeadMagnet | undefined> => {
      // ADMIN: cross-account query intentional
      const [magnet] = await db.insert(leadMagnets).values(data).returning();
      return magnet;
    },

    update: async (
      id: string,
      data: Partial<NewLeadMagnet>
    ): Promise<LeadMagnet | undefined> => {
      // ADMIN: cross-account query intentional
      const [magnet] = await db
        .update(leadMagnets)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(leadMagnets.id, id))
        .returning();
      return magnet;
    },

    deactivateAll: async (): Promise<void> => {
      // ADMIN: cross-account query intentional
      await db
        .update(leadMagnets)
        .set({ isActive: false, updatedAt: new Date() })
        .where(eq(leadMagnets.isActive, true));
    },

    listAccountActivations: async (): Promise<AccountLeadMagnet[]> => {
      // ADMIN: cross-account query intentional
      return db.select().from(accountLeadMagnets);
    },

    invalidatePersonalisedPdfs: async (): Promise<void> => {
      // ADMIN: cross-account query intentional
      await db.update(accountLeadMagnets).set({
        personalisedAt: null,
        personalisedPdfKey: null,
        masterVersionAtPersonalisation: null,
        updatedAt: new Date(),
      });
    },
  },

  webinars: {
    getActive: async (): Promise<Webinar | undefined> => {
      // ADMIN: cross-account query intentional
      const [webinar] = await db
        .select()
        .from(webinars)
        .where(eq(webinars.isActive, true))
        .orderBy(desc(webinars.updatedAt))
        .limit(1);
      return webinar;
    },

    create: async (
      data: Omit<NewWebinar, "id" | "createdAt" | "updatedAt">
    ): Promise<Webinar | undefined> => {
      // ADMIN: cross-account query intentional
      const [webinar] = await db.insert(webinars).values(data).returning();
      return webinar;
    },

    update: async (id: string, data: Partial<NewWebinar>): Promise<Webinar | undefined> => {
      // ADMIN: cross-account query intentional
      const [webinar] = await db
        .update(webinars)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(webinars.id, id))
        .returning();
      return webinar;
    },

    deactivateAll: async (): Promise<void> => {
      // ADMIN: cross-account query intentional
      await db.update(webinars).set({ isActive: false, updatedAt: new Date() }).where(eq(webinars.isActive, true));
    },

    listAccountActivations: async (): Promise<AccountWebinar[]> => {
      // ADMIN: cross-account query intentional
      return db.select().from(accountWebinars);
    },
  },

  objections: {
    listAll: async (opts?: { category?: ObjectionCategory; status?: string }): Promise<ObjectionResponse[]> => {
      // ADMIN: cross-account query intentional
      const filters = [];
      if (opts?.category) filters.push(eq(objectionResponses.category, opts.category));
      if (opts?.status) filters.push(eq(objectionResponses.complianceStatus, opts.status));
      return db
        .select()
        .from(objectionResponses)
        .where(filters.length > 0 ? and(...filters) : undefined)
        .orderBy(asc(objectionResponses.category), asc(objectionResponses.sortOrder), desc(objectionResponses.createdAt));
    },

    get: async (id: string): Promise<ObjectionResponse | undefined> => {
      // ADMIN: cross-account query intentional
      const [response] = await db.select().from(objectionResponses).where(eq(objectionResponses.id, id)).limit(1);
      return response;
    },

    create: async (
      data: Omit<NewObjectionResponse, "id" | "createdAt" | "updatedAt">
    ): Promise<ObjectionResponse | undefined> => {
      // ADMIN: cross-account query intentional
      const [response] = await db.insert(objectionResponses).values(data).returning();
      return response;
    },

    update: async (id: string, data: Partial<ObjectionResponse>): Promise<ObjectionResponse | undefined> => {
      // ADMIN: cross-account query intentional
      const [response] = await db
        .update(objectionResponses)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(objectionResponses.id, id))
        .returning();
      return response;
    },

    delete: async (id: string): Promise<void> => {
      // ADMIN: cross-account query intentional
      await db.delete(objectionResponses).where(eq(objectionResponses.id, id));
    },

    publish: async (id: string): Promise<void> => {
      // ADMIN: cross-account query intentional
      const response = await adminDb.objections.get(id);
      if (response?.complianceStatus !== "passed") throw new Error("Cannot publish a response that has not passed compliance.");
      await db.update(objectionResponses).set({ isPublished: true, updatedAt: new Date() }).where(eq(objectionResponses.id, id));
    },

    unpublish: async (id: string): Promise<void> => {
      // ADMIN: cross-account query intentional
      await db.update(objectionResponses).set({ isPublished: false, updatedAt: new Date() }).where(eq(objectionResponses.id, id));
    },

    setComplianceResult: async (id: string, status: "passed" | "flagged", flags?: string[]): Promise<void> => {
      // ADMIN: cross-account query intentional
      await db
        .update(objectionResponses)
        .set({
          complianceStatus: status,
          complianceFlags: flags && flags.length > 0 ? JSON.stringify(flags) : null,
          updatedAt: new Date(),
        })
        .where(eq(objectionResponses.id, id));
    },
  },
};

// ─── Convenience audit log helper ────────────────────────────────────────────

/**
 * Standalone audit log helper. Works with or without accountId.
 * Prefer scopedDb(accountId).audit.log() for account-scoped actions.
 */
export async function auditLog(
  entry: Omit<NewAuditLog, "id" | "createdAt">
): Promise<void> {
  await db.insert(auditLogs).values(entry);
}
