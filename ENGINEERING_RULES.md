# ENGINEERING_RULES.md — Hard Rules for All Development
# Herbalife Internal Team Tool v4.1.3

> These rules are **non-negotiable**. They exist because violations have catastrophic consequences:
> account data leaks (PDPA), Herbalife compliance risk, or new-distributor attrition from a broken
> Voice Capture system. Claude Code agents and human reviewers must enforce them equally.

---

## Rule Category Index

- [R1 — Account Isolation](#r1--account-isolation)
- [R2 — TypeScript Configuration](#r2--typescript-configuration)
- [R3 — Database Rules](#r3--database-rules)
- [R4 — Authentication & Authorization](#r4--authentication--authorization)
- [R5 — Voice Capture System Rules](#r5--voice-capture-system-rules)
- [R6 — Compliance Filter Rules](#r6--compliance-filter-rules)
- [R7 — Content Generation Rules](#r7--content-generation-rules)
- [R8 — PII & Data Handling Rules](#r8--pii--data-handling-rules)
- [R9 — Async Job Rules](#r9--async-job-rules)
- [R10 — API Design Rules](#r10--api-design-rules)
- [R11 — Storage Rules](#r11--storage-rules)
- [R12 — Testing Rules](#r12--testing-rules)
- [R13 — Logging & Observability](#r13--logging--observability)
- [R14 — Forbidden Patterns](#r14--forbidden-patterns)
- [R15 — Environment & Secrets](#r15--environment--secrets)

---

## R1 — Account Isolation

**Risk if violated:** Cross-account data leak → PDPA RM 500,000 fine + criminal liability.

### R1.1 — The scopedDb Pattern Is Mandatory

All database queries in application code MUST use the `scopedDb(accountId)` helper from
`lib/db/scoped.ts`. Direct Drizzle queries without an `account_id` WHERE clause are forbidden.

```typescript
// ❌ FORBIDDEN
const leads = await db.select().from(leadsTable);
const leads = await db.select().from(leadsTable).where(eq(leadsTable.stage, 'Hot'));

// ✅ REQUIRED
const leads = await scopedDb(accountId).leads.list({ stage: 'Hot' });
```

### R1.2 — scopedDb Must Throw on Missing accountId

The `scopedDb` helper must throw synchronously if called without an `accountId`:

```typescript
export function scopedDb(accountId: string) {
  if (!accountId || typeof accountId !== 'string') {
    throw new Error('[scopedDb] accountId is required and must be a string');
  }
  // ...
}
```

### R1.3 — Route Handler First Line

Every route handler that touches user data must resolve the account as its absolute first
operation, before reading any request body:

```typescript
export async function GET(req: Request) {
  const account = await getAccountFromSession(req);
  if (!account) return new Response('Unauthorized', { status: 401 });

  const userDb = scopedDb(account.id);
  // ... rest of handler
}
```

### R1.4 — Cross-Account Test Is Mandatory for Every Table

Every table that holds per-account data must have a corresponding isolation test:

```typescript
// tests/account-isolation.test.ts
test('Account A cannot read Account B [table_name]', async () => {
  const a = await createTestAccount();
  const b = await createTestAccount();
  await scopedDb(b.id).[table].create(testData);
  const result = await scopedDb(a.id).[table].list();
  expect(result).toHaveLength(0);
});
```

### R1.5 — Admin Routes Are Not Exempt

Admin routes that display data across all accounts must use explicit, intentional queries
marked with a `// ADMIN: cross-account query intentional` comment. These are the only
permitted cross-account reads.

### R1.6 — S3/R2 File Paths Must Include account_id

All file uploads to Cloudflare R2 must follow this path structure:

```
accounts/{account_id}/{module}/{filename}
```

Examples:
```
accounts/a1b2c3/voice-notes/2026-05-20-q1.webm
accounts/a1b2c3/lead-magnets/sherry-ig-guide.pdf
accounts/a1b2c3/webinars/master-1.mp4
accounts/a1b2c3/content-images/img-001.png
```

Never store files at paths that do not include the `account_id` segment.

---

## R2 — TypeScript Configuration

### R2.1 — Strict Mode Is Non-Negotiable

`tsconfig.json` must include:

```json
{
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true
  }
}
```

### R2.2 — No `any` Types

`any` is banned. Use `unknown` with type guards, or define a proper interface. The linter
must enforce this. Exception: third-party library interop only, must be justified with a comment.

### R2.3 — All API Request/Response Bodies Must Be Typed

Use Zod for runtime validation of all external inputs:

```typescript
import { z } from 'zod';

const CaptureRequestSchema = z.object({
  voice_note_id: z.string().uuid(),
});

export async function POST(req: Request) {
  const account = await getAccountFromSession(req);
  if (!account) return new Response('Unauthorized', { status: 401 });

  const body = CaptureRequestSchema.safeParse(await req.json());
  if (!body.success) {
    return Response.json({ error: 'validation_error', details: body.error.issues }, { status: 400 });
  }
  // ...
}
```

### R2.4 — Drizzle Schema Types Are Canonical

Do not redefine types that can be inferred from the Drizzle schema. Use `typeof table.$inferSelect`
and `typeof table.$inferInsert`.

---

## R3 — Database Rules

### R3.1 — All Business Tables Require account_id

Every table that holds per-distributor data must have:

```sql
account_id UUID NOT NULL REFERENCES accounts(id)
```

And a corresponding index:

```sql
CREATE INDEX idx_{table_name}_account ON {table_name}(account_id);
```

Exceptions: `accounts`, `users`, `account_memberships`, `compliance_rules` (shared platform data).

### R3.2 — Never Delete Records, Soft-Delete Instead

Add `deleted_at TIMESTAMP NULL` to tables that require deletion. The `scopedDb` helper must
filter `WHERE deleted_at IS NULL` by default. True deletion is only allowed for PDPA data
subject requests, which must go through the dedicated `lib/pdpa/delete.ts` utility.

Exception: `audit_logs` are append-only and may never be deleted.

### R3.3 — Migrations Are Versioned and Irreversible

- Use Drizzle Kit for all schema changes: `drizzle-kit generate` to generate, `drizzle-kit push`
  only in development, explicit migration files for production.
- Never modify an existing migration file after it has been applied to any environment.
- All migrations must be forward-only. If a column needs to be changed, add a new column,
  migrate data, then drop the old one in a separate migration.
- Every migration must have a human-readable description comment at the top.

### R3.4 — No Raw SQL in Application Code

All queries go through Drizzle. Raw SQL is only acceptable in migration files.

### R3.5 — UUID Primary Keys Everywhere

Use `UUID DEFAULT gen_random_uuid()` for all primary keys. No integer sequences.

---

## R4 — Authentication & Authorization

### R4.1 — Invite-Only; No Self-Service Signup

There is no public registration flow. New accounts are created by the admin (Steven) via an
invite-only magic link flow. Any route that allows account creation must verify that the
requesting user is an admin.

### R4.2 — Role Hierarchy

Roles in `account_memberships.role`:
- `owner`: Full access to their own account. Cannot access other accounts.
- `admin`: Platform-level admin (Steven). Can access all accounts for support.

There is no `member` role in MVP. All downlines are `owner` of their own account.

### R4.3 — Session Must Carry account_id

The session object returned by `getAccountFromSession()` must always include `account.id`.
Avoid patterns where account_id is derived from the request URL — use the authenticated session.

---

## R5 — Voice Capture System Rules

**Risk if violated:** New distributors get generic AI content, feel the tool "isn't them",
quit within 90 days. This is the documented primary cause of high attrition.

### R5.1 — Build Order: Voice Capture Before Content Studio

Voice Capture (Phases 0–1) must be complete before Content Studio layers 7–9 are implemented.
The dependency is: `voice_profiles` + `story_bank` + `journey_moments` → Content Studio
layers 7, 8, 9. These layers return empty strings if the upstream tables have no data — they
do not cause errors, but they silently degrade content quality.

### R5.2 — Voice Note Is the Only Input for Why Story and Journey Sessions

The `VoiceRecorder` component is the exclusive input mechanism for:
- All 5 Why Story Excavation questions (Sessions 1)
- Observer Voice activation (Session 3)
- Daily Journey Capture

Do not add a text `<textarea>` or text input field as an alternative for these flows.

```typescript
// ❌ FORBIDDEN — text fallback in Why Story session
<textarea placeholder="If you can't record, type your answer here..." />

// ✅ ALLOWED — technical failure fallback in Daily Journey only
{hasTechnicalFailure && <TextFallback reason="Recording failed" />}
```

### R5.3 — Daily Journey Capture: Maximum 3 per Day

The `/api/journey/capture` endpoint must enforce a hard limit of 3 captures per account per
calendar day. Return a `429 Too Many Requests` with message explaining the limit.

### R5.4 — The Modification Rule Is Enforced at the API Layer

The `/api/content-drafts/:id/export` endpoint must:
1. Compute `detectModification(draft.draft_text, draft.draft_modified_text)`
2. If `similarity > 0.85` → return `{ error: 'modification_required', similarity }` with status 400
3. Only proceed to export if `is_modified === true`

The UI showing a modification progress bar is UX. The API enforcing it is compliance. Both
are required, but the API enforcement cannot be disabled by UI changes.

### R5.5 — User Confirmation Required Before Story Bank Entry Is Active

A story extracted from Why Story Excavation is written to `story_bank` with `user_confirmed = false`.
It is NOT available to other modules (Content Studio, Objection Library, CRM) until the user
reviews and confirms it, setting `user_confirmed = true`.

```typescript
// lib/db/scoped.ts — storyBank queries
list: (filters) => db.select().from(storyBank)
  .where(and(
    eq(storyBank.accountId, accountId),
    eq(storyBank.userConfirmed, true),  // Only confirmed stories reach other modules
    ...buildFilters(filters)
  ))
```

### R5.6 — Voice Profile Requires Minimum Data Threshold

Monthly Voice Profile generation must be skipped if the account has:
- Fewer than 10 journey moments in the past 30 days, OR
- Fewer than 3 exported (modified) content drafts in the past 30 days

Do not generate a low-confidence profile from insufficient data. Wait for next month.

### R5.7 — Why Story Session Has a 48-Hour Expiry

A Why Story session created in the database expires after 48 hours. After expiry, the user must
start a new session. Store session expiry in the DB, not in client state.

---

## R6 — Compliance Filter Rules

**Risk if violated:** Herbalife corporate may deactivate the entire distributor network —
20+ years of business destroyed.

### R6.1 — The Compliance Filter Is Not Optional

Every content generation endpoint that produces content shown to distributors for sharing
externally MUST pass through the compliance filter. There is no bypass, no debug flag, no
admin override.

### R6.2 — The 4-Layer Pipeline Must Execute in Order

```typescript
// lib/compliance/filter.ts

export async function runComplianceFilter(content: string, language: string): Promise<ComplianceResult> {
  // Layer 1 — Regex blacklist (must be < 50ms)
  const layer1 = checkRegexBlacklist(content, language);
  if (layer1.status === 'reject') return layer1;

  // Layer 2 — Numeric claim detection (must be < 50ms)
  const layer2 = checkNumericClaims(content);
  if (layer2.status === 'reject') return layer2;

  // Layer 3 — LLM-as-judge (Claude Haiku, target < 1000ms)
  const layer3 = await llmComplianceJudge(content);
  if (layer3.status === 'reject') return layer3;

  // Layer 4 — Disclosure block presence check
  const layer4 = checkDisclosurePresence(content, layer3.content_type);
  if (layer4.status === 'flag') return layer4;

  return { status: 'pass', content };
}
```

### R6.3 — Layer 1 Regex Blacklist Must Be Externally Maintainable

The compliance keyword list is stored in `docs/compliance/keywords.csv` (managed by Cowork zone).
The filter code must read from this file, not hardcode keywords. The CSV format:

```csv
keyword,language,severity,replacement_suggestion
减肥,zh-CN,reject,健康管理
100%,all,reject,
RM [0-9]+,all,reject,
治愈,zh-CN,reject,
```

### R6.4 — Compliance Violations Must Be Logged

Every compliance check result (pass/flag/reject) must be written to a `compliance_checks` log.
This is not the same as `audit_logs`. It records content hashes, rule hits, and model outputs.
This log is required for Herbalife corporate review evidence.

### R6.5 — Disclosure Block Is a Component, Not Text

The disclosure statement must be rendered by the `<DisclosureBlock>` React component. It must
not be a string inserted into a template. The component renders the fixed legal text and cannot
accept children that override that text.

```typescript
// ❌ FORBIDDEN — editable disclosure text
<div dangerouslySetInnerHTML={{ __html: userDefinedDisclosure }} />

// ✅ REQUIRED — non-overridable component
<DisclosureBlock position="footer" />
```

### R6.6 — No Income Claims Anywhere in Generated Content

The regex layer must catch:
- Specific RM amounts in promotional context: `RM\s*[\d,]+`
- "Earn", "income" within 5 words of a number
- Percentage gains: `\d+%` in income context
- "Guaranteed", "promise", "100%", "definitely earn"

---

## R7 — Content Generation Rules

### R7.1 — 60/30/10 Content Mix Is Enforced by the Weekly Compile

The weekly compile must generate:
- At least 3 of 5 drafts as value content (60%)
- At least 1 draft as personal story (30%)
- At most 1 draft as CTA (10%)

This is a scheduling constraint, not a prompt instruction. The cron job selects which type to
generate based on the past week's published content distribution.

### R7.2 — Variation Seed Is Deterministic

The `variation_seed` that selects prompt variations must be computed as:
```typescript
const variationSeed = hash(`${accountId}:${contentType}:${weekISO}:${counter}`);
```

This ensures reproducibility — if a generation fails and is retried, it produces the same draft.

### R7.3 — The 9-Layer Prompt Layers Must Be Applied in Order

Content Studio prompt assembly must follow this exact layer order:

```typescript
const prompt = [
  LAYER_1_BASE_COMPLIANCE,          // Platform-wide compliance
  LAYER_2_PERSONA(archetype),       // Brand archetype
  LAYER_3_PLATFORM(platform),       // FB / IG / TikTok style
  LAYER_4_CONTENT_TYPE(type),       // Hook to CTA structure
  LAYER_5_RUNTIME(brandKit),        // Brand kit variables
  LAYER_6_LANGUAGE(language),       // zh-CN / rojak / ms-MY
  LAYER_7_VOICE_PROFILE(profile),   // ⭐ Voice fingerprint
  LAYER_8_STORY_BANK(stories),      // ⭐ Personal stories
  LAYER_9_JOURNEY_BANK(moments),    // ⭐ Recent moments
].join('\n\n---\n\n');
```

If a layer's data is not yet available (e.g., no Voice Profile yet in Month 1), the layer
returns an empty string — it does not throw.

---

## R8 — PII & Data Handling Rules

**Risk if violated:** PDPA fine up to RM 500,000 + 3 years imprisonment.

### R8.1 — Consent Is Collected Before PII Is Stored

Every funnel landing page that collects name, phone, or email must show a consent checkbox
before the form can be submitted. The consent record must be stored alongside the lead record.

```sql
leads (
  -- ...
  consent_given BOOLEAN NOT NULL DEFAULT FALSE,
  consent_at TIMESTAMP,
  consent_ip TEXT,
  privacy_notice_version TEXT  -- which version they consented to
)
```

### R8.2 — Lead Deletion Is Immediate and Complete

When a data subject requests deletion:
1. Delete the lead record from `leads`
2. Delete all associated `lead_activities`
3. Anonymize (do not delete) associated audit logs — replace PII with `[DELETED]`
4. Write a `pdpa_deletion_log` record
5. Return confirmation to the requestor within 24 hours

### R8.3 — Auto-Anonymize After 12 Months of Inactivity

Leads with no activity for 12 months must be automatically anonymized by a monthly cron:
- Replace `name`, `phone`, `email` with `[anonymized]`
- Keep the record for analytics purposes
- Record the anonymization in the audit log

### R8.4 — Voice Notes Contain Sensitive PII

Voice note files stored in R2 are deeply personal. Apply:
- R2 signed URLs with 1-hour expiry for playback (never public URLs)
- Voice note files must be deleted from R2 when the account is deleted
- Voice note transcripts in the database contain PII and are covered by PDPA deletion rules

### R8.5 — Cross-Border Data Transfer Notice

Supabase data is stored in Singapore (AWS `ap-southeast-1`). This constitutes cross-border
transfer under PDPA. The Privacy Notice page must disclose:
> "Your data is stored on servers in Singapore, operated by Supabase, Inc."

---

## R9 — Async Job Rules

### R9.1 — Never Transcribe Synchronously in a Route Handler

All Whisper API calls must happen in a BullMQ worker, not in route handlers. The route handler:
1. Inserts the voice note record with `transcript_status = 'pending'`
2. Enqueues the BullMQ job
3. Returns immediately with `202 Accepted`

### R9.2 — Retry Policy for All Async Jobs

```typescript
const transcribeQueue = new Queue('transcribe-voice-note', {
  defaultJobOptions: {
    attempts: 2,
    backoff: { type: 'exponential', delay: 5000 },
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 50 },
  }
});
```

On final failure, set `transcript_status = 'failed'` and notify the user.

### R9.3 — Cron Jobs Process One Account at a Time

Weekly compile and monthly voice profile crons iterate through active accounts one at a time
in a loop. They do not bulk-process all accounts in a single function call (Vercel timeout risk).

```typescript
// jobs/weekly-compile.ts
export async function runWeeklyCompile() {
  const accounts = await getActiveAccounts();
  for (const account of accounts) {
    try {
      await processWeeklyCompileForAccount(account.id);
    } catch (err) {
      Sentry.captureException(err, { extra: { account_id: account.id } });
      // Continue to next account — do not abort the entire run
    }
  }
}
```

### R9.4 — Push Notifications Must Include Idempotency Tags

All Web Push notifications must include a `tag` field to prevent duplicates if the cron fires
more than once:

```typescript
await sendWebPush(sub, {
  title: '...',
  tag: `journey-${accountId}-${format(today, 'yyyy-MM-dd')}`,
});
```

---

## R10 — API Design Rules

### R10.1 — All API Routes Are Under `/api/`

No business logic in Server Components. All data fetching in Server Components that requires
authentication must call an internal API route (or use a shared server action).

### R10.2 — HTTP Method Semantics Are Enforced

| Method | Use |
|--------|-----|
| GET | Read-only, idempotent |
| POST | Create new resource |
| PATCH | Partial update to existing resource |
| PUT | Full replacement of existing resource |
| DELETE | Soft-delete only |

### R10.3 — Pagination on All List Endpoints

Any endpoint that returns a list must support cursor-based pagination:

```typescript
// Request: GET /api/journey/list?cursor=<uuid>&limit=20
// Response: { moments: [...], next_cursor: <uuid> | null }
```

Default limit is 20. Maximum limit is 100.

### R10.4 — API Response Shape Is Consistent

Success:
```typescript
{ data: T, meta?: { cursor, total } }
```

Error:
```typescript
{ error: 'machine_readable_code', message: string, details?: unknown }
```

---

## R11 — Storage Rules

### R11.1 — All Uploads Go Direct-to-R2 via Presigned URL

Never proxy file uploads through the Next.js server. The pattern is:

```
Client → POST /api/voice-notes/presign → get presigned PUT URL
Client → PUT {presigned_url} with file blob → direct to R2
Client → POST /api/voice-notes/complete → notify server upload is done
```

### R11.2 — All R2 Access Is Via Signed URLs

Never make R2 buckets public. All file access must use time-limited signed URLs:
- Playback: 1-hour expiry
- Download: 24-hour expiry
- Upload: 5-minute expiry

### R11.3 — Video Content Uses Bunny.net Stream, Not R2

Recorded webinar videos are stored and served via Bunny.net Stream, not Cloudflare R2.
R2 is for audio (voice notes), PDFs, and images only.

---

## R12 — Testing Rules

### R12.1 — Test Runner Is vitest

Use vitest exclusively. Do not mix Jest and vitest. The configuration is in `vitest.config.ts`.

### R12.2 — Tests Are Co-Located with Jobs and Lib Files

- Unit tests for `lib/compliance/filter.ts` → `lib/compliance/filter.test.ts`
- Unit tests for `jobs/weekly-compile.ts` → `jobs/weekly-compile.test.ts`
- Integration tests (cross-cutting) → `tests/integration/`
- Account isolation tests → `tests/account-isolation.test.ts`

### R12.3 — Mandatory Test Categories

Every task must ship with these test types:

| Category | Scope |
|----------|-------|
| **Account isolation** | Prove cross-account data cannot leak |
| **Auth gate** | Prove unauthenticated requests → 401 |
| **Modification enforcement** | Prove unmodified exports → 400 |
| **Compliance filter** | Each layer independently tested |
| **Async job happy path** | Mock Whisper/Claude, verify DB state changes |
| **Edge cases** | Empty input, very long input, malformed audio |

### R12.4 — No Real External API Calls in Tests

Mock all external services:
- `openai` (Whisper) → mock with a fixed transcript string
- `@anthropic-ai/sdk` → mock with a fixed JSON response
- `Resend` → mock, verify call arguments
- Web Push → mock, verify notification structure

---

## R13 — Logging & Observability

### R13.1 — All Logs Must Include account_id and action

```typescript
logger.info({ account_id, user_id, action: 'journey.captured', journey_moment_id });
Sentry.setUser({ id: user.id, account_id: account.id });
posthog.capture('journey_captured', { account_id, category, duration_seconds });
```

### R13.2 — Error Boundaries Capture to Sentry

All route handlers must catch top-level exceptions and report to Sentry before returning
a 500 response.

### R13.3 — PostHog Events Follow a Naming Convention

Format: `{module}_{action}` in snake_case. Examples:
- `voice_note_recorded`, `voice_note_transcription_failed`
- `why_story_session_started`, `why_story_extraction_complete`
- `content_draft_exported`, `content_draft_modification_failed`
- `compliance_filter_passed`, `compliance_filter_rejected`

---

## R14 — Forbidden Patterns

The following patterns are permanently forbidden. No exceptions without explicit written
sign-off from Steven.

| Pattern | Risk |
|---------|------|
| Direct `db.select().from(table)` without `account_id` WHERE | Data leak |
| Posting to social media APIs automatically | Platform ban, Herbalife compliance |
| Text input alternative for Why Story voice sessions | Voice data quality collapse |
| One-click export of unmodified AI draft | Product principle violation |
| Hardcoded income or earning figures in any template | Direct Sales Act violation |
| Fake-live webinar indicators ("LIVE NOW", fake attendee count) | Herbalife compliance |
| `any` TypeScript type without justification comment | Type safety collapse |
| Raw SQL in application code | Schema drift risk |
| Deleting audit_log records | PDPA violation |
| Public R2 bucket URLs | PII exposure |
| Storing Herbalife corporate data (product codes, pricing) | IP/contractual risk |
| WhatsApp API automated messaging | Platform TOS violation |
| Income claims in any content template, prompt, or generated text | Compliance violation |

---

## R15 — Environment & Secrets

### R15.1 — .env.local Is Never Committed

`.env.local` is in `.gitignore`. Never commit secrets. Use Vercel environment variables for all
deployment secrets.

### R15.2 — .env.example Is the Canonical Schema

`/.env.example` documents all required environment variables with placeholder values. It is
committed to the repository and kept up to date with every new integration.

```bash
# .env.example

# Database
DATABASE_URL=postgresql://...

# Auth
CLERK_SECRET_KEY=sk_...
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_...

# Storage
CLOUDFLARE_ACCOUNT_ID=
CLOUDFLARE_R2_ACCESS_KEY_ID=
CLOUDFLARE_R2_SECRET_ACCESS_KEY=
CLOUDFLARE_R2_BUCKET_NAME=
CLOUDFLARE_R2_PUBLIC_URL=

# LLMs
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...

# Email
RESEND_API_KEY=re_...

# Video
BUNNY_STREAM_API_KEY=
BUNNY_STREAM_LIBRARY_ID=

# Jobs
REDIS_URL=redis://...

# Monitoring
SENTRY_DSN=https://...
NEXT_PUBLIC_POSTHOG_KEY=phc_...
NEXT_PUBLIC_POSTHOG_HOST=https://app.posthog.com

# App
NEXT_PUBLIC_APP_URL=https://app.yourteam.com
NEXT_PUBLIC_ROOT_DOMAIN=yourteam.com
ADMIN_EMAIL=stevensc082@gmail.com
```

### R15.3 — API Keys Are Never Exposed to the Client

All LLM calls, storage operations, and third-party API calls happen server-side only. No
`NEXT_PUBLIC_ANTHROPIC_API_KEY` or similar.

---

*Last updated: 2026-05-20 · Based on v4.1.3 Master Architecture Archive*
