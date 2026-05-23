# Codex Task Brief — Voice Capture System
# President Tools OS — Phase 2 (Weeks 2–3)
# 
# HOW TO RUN:
#   codex --model o3 --approval-mode auto-edit "$(cat CODEX_VOICE_CAPTURE.md)"
# OR feed this file directly as your Codex system prompt / task context.
#
# IMPORTANT: Read every section before writing any code.
# Do NOT skip the "Rules & Constraints" section — violations block the whole system.

---

## 1. Mission

Build the **Voice Capture System** for President Tools OS — an internal Herbalife
distributor tool built in Malaysia. This system is the backbone of the entire
platform. Content Studio (Phase 3) cannot be built until Voice Capture is complete.

**What it is:** Distributors record short audio clips about their journey. The
system transcribes, stores, and synthesises these clips into a Voice Profile —
a persistent representation of how the user thinks, speaks, and tells their story.
That Voice Profile is injected into every AI content generation prompt.

**What it is NOT:** A podcast tool. A marketing API integration. A text-input form.
Audio is mandatory — there is no "type instead" fallback.

---

## 2. Project Context

### Stack (already installed — do not change package.json)
- Next.js 14 App Router, TypeScript strict mode (`noUncheckedIndexedAccess: true`)
- Supabase Auth + PostgreSQL, Drizzle ORM, Zod validation
- Cloudflare R2 for audio file storage
- BullMQ + Redis (Upstash) for async transcription queue
- OpenAI Whisper API for transcription
- Anthropic Claude Sonnet for Voice Profile synthesis

### Foundation already built (do not re-implement)
- `lib/db/scoped.ts` — `scopedDb(accountId)` + `adminDb`
- `lib/auth/session.ts` — `getAccountFromSession()`, `requireAdmin()`
- `lib/supabase/server.ts` — `createClient()`, `createAdminClient()`
- `app/(app)/layout.tsx` — authenticated app shell
- `middleware.ts` — auth guard already applied to all `/app/*` routes

### Path aliases
- `@/` maps to the project root (e.g. `@/lib/db/scoped`)

### Environment variables (already in .env.example — just use them)
```
OPENAI_API_KEY              # Whisper transcription
ANTHROPIC_API_KEY           # Claude Sonnet for Voice Profile
CLOUDFLARE_R2_ACCOUNT_ID
CLOUDFLARE_R2_ACCESS_KEY_ID
CLOUDFLARE_R2_SECRET_ACCESS_KEY
CLOUDFLARE_R2_BUCKET_NAME
CLOUDFLARE_R2_PUBLIC_URL    # CDN base URL for audio playback
REDIS_URL                   # Upstash Redis (BullMQ transport)
REDIS_TOKEN                 # Upstash REST token (for status polling)
```

---

## 3. The 4 Voice Capture Pipelines

### Pipeline 1 — Why Story (One-time)
- **Trigger:** User clicks "Record My Why Story" (first time only)
- **Duration:** 3–7 minutes (enforce: reject if < 60s or > 10 min)
- **Prompt shown to user:**
  > "Record yourself answering: Why did you join Herbalife? What was happening
  > in your life before? What changed? Speak naturally — this is your story."
- **Outcome:** Transcribed text stored as `type = 'why_story'`. Marks account
  `voice_capture_completed_at` once Why Story + at least 3 Daily Journeys exist.
- **One-time rule:** User cannot re-record Why Story once accepted. Admin can reset.

### Pipeline 2 — Daily Journey (Recurring)
- **Trigger:** User clicks "Record Today's Journey" (dashboard or /voice page)
- **Duration:** 1–3 minutes (enforce: reject if < 20s or > 5 min)
- **Daily limit:** MAX 3 recordings per calendar day (Malaysia timezone UTC+8)
- **Prompt shown to user:**
  > "What happened today? A conversation, a result, a moment — anything real.
  > Speak naturally. Even 90 seconds is enough."
- **Outcome:** Transcribed text stored as `type = 'daily_journey'` with the date.

### Pipeline 3 — Weekly Compile (System-generated, no recording)
- **Trigger:** Background job runs every Monday 08:00 MYT (UTC+8 = UTC 00:00 Monday)
- **Input:** All `daily_journey` transcripts from the past 7 days for an account
- **Process:** Claude Sonnet summarises the week's transcripts into a weekly digest
- **Prompt to Claude:**
  ```
  You are summarising a Herbalife distributor's weekly journey for their personal
  archive. Given these daily voice journal entries from the past 7 days, write a
  cohesive weekly summary in first person. Preserve the person's authentic voice,
  specific moments, and emotional arc. Do not add advice or coaching. 200–400 words.

  Daily entries:
  {entries}
  ```
- **Outcome:** Stored as `type = 'weekly_compile'` with `week_start_date`.
- **Skip condition:** If fewer than 2 daily_journey entries exist for the week, skip.

### Pipeline 4 — Voice Profile (System-generated, rebuilt on demand)
- **Trigger:** After every new transcription is accepted; also on-demand from /voice page
- **Input:** ALL accepted transcripts for the account (why_story + daily_journeys,
  most recent 30 entries max)
- **Process:** Claude Sonnet synthesises a Voice Profile JSON object
- **Prompt to Claude:**
  ```
  Analyse these voice transcripts from a single person and extract their authentic
  communication style. Output ONLY valid JSON matching this exact schema — no
  markdown, no explanation:

  {
    "vocabulary_level": "simple|conversational|sophisticated",
    "sentence_rhythm": "short_punchy|flowing|mixed",
    "emotional_tone": "warm|direct|inspirational|matter_of_fact",
    "storytelling_style": "narrative|anecdotal|analytical",
    "common_phrases": ["phrase1", "phrase2", "phrase3"],
    "topics_they_return_to": ["topic1", "topic2"],
    "energy_level": "calm|enthusiastic|intense",
    "malaysia_context": true|false,
    "languages_mixed": ["english"] or ["english", "mandarin"] or ["english", "malay"],
    "summary": "2–3 sentence description of their unique voice"
  }

  Transcripts:
  {transcripts}
  ```
- **Outcome:** Stored in `voice_profiles` table, versioned. Latest version used by
  Content Studio as Layer 7 of its 9-layer prompt.
- **Rebuild trigger:** Rebuild after every 5th new transcript, or manual trigger.

---

## 4. Database Schema — Add to Drizzle

### 4a. Create file: `lib/db/schema/voice.ts`

```typescript
/**
 * Voice Capture Schema
 * All tables carry account_id — required by ENGINEERING_RULES.md R1
 */
```

Tables to define:

**`voice_captures`**
| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | gen_random_uuid() |
| account_id | UUID NOT NULL | FK → accounts.id ON DELETE CASCADE |
| type | enum NOT NULL | 'why_story' \| 'daily_journey' \| 'weekly_compile' |
| status | enum NOT NULL | 'recording' \| 'uploading' \| 'transcribing' \| 'accepted' \| 'failed' |
| r2_key | TEXT | Path in R2 bucket. NULL for weekly_compile (no audio) |
| r2_public_url | TEXT | CDN URL for playback |
| duration_seconds | INTEGER | Audio duration |
| transcript | TEXT | Raw Whisper output |
| transcript_cleaned | TEXT | Lightly cleaned (remove filler words) |
| week_start_date | DATE | NULL except for weekly_compile |
| job_id | TEXT | BullMQ job ID for polling |
| error_message | TEXT | NULL unless status = 'failed' |
| recorded_at | TIMESTAMPTZ NOT NULL DEFAULT now() |
| created_at | TIMESTAMPTZ NOT NULL DEFAULT now() |
| updated_at | TIMESTAMPTZ NOT NULL DEFAULT now() |

Indexes: `(account_id)`, `(account_id, type)`, `(account_id, status)`,
`(account_id, recorded_at DESC)`

**`voice_profiles`**
| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| account_id | UUID NOT NULL | FK → accounts.id ON DELETE CASCADE |
| version | INTEGER NOT NULL DEFAULT 1 | Increments on rebuild |
| profile_json | TEXT NOT NULL | JSON string matching the schema above |
| source_capture_count | INTEGER | How many transcripts were used |
| built_at | TIMESTAMPTZ NOT NULL DEFAULT now() |
| created_at | TIMESTAMPTZ NOT NULL DEFAULT now() |

Unique index: `(account_id, version)`. Add a helper to get latest:
query `ORDER BY version DESC LIMIT 1`.

### 4b. Export from `lib/db/schema/index.ts`
Add: `export * from "./voice";`

### 4c. Create migration: `drizzle/0002_voice_capture.sql`
Write the SQL migration for both tables with:
- Enums: `voice_capture_type`, `voice_capture_status`
- All indexes
- RLS enabled on both tables
- RLS policies:
  - `voice_captures`: SELECT/INSERT/UPDATE — own account or admin
  - `voice_profiles`: SELECT — own account or admin; INSERT/UPDATE — admin or system
- Updated-at trigger on `voice_captures`

---

## 5. Extend scopedDb — Add to `lib/db/scoped.ts`

Add a `voice` namespace to the `scopedDb()` return object:

```typescript
voice: {
  // Captures
  createCapture: async (data) => { ... }  // INSERT, returns capture
  getCapture: async (id) => { ... }        // SELECT WHERE id AND account_id
  updateCapture: async (id, data) => { ... } // UPDATE WHERE id AND account_id
  listCaptures: async (type?, limit = 20) => { ... } // SELECT with optional type filter
  countTodayDailyJourneys: async () => { ... } // COUNT where type='daily_journey' AND DATE(recorded_at AT TIME ZONE 'Asia/Kuala_Lumpur') = today
  getWhyStory: async () => { ... } // SELECT WHERE type='why_story' AND status='accepted' LIMIT 1
  getLatestWeeklyCompile: async () => { ... }

  // Voice Profile
  getLatestProfile: async () => { ... } // latest version
  createProfile: async (data) => { ... }
  getNextVersion: async () => { ... }   // MAX(version) + 1 for this account
}
```

---

## 6. R2 Storage Helper — Create `lib/storage/r2.ts`

```typescript
/**
 * Cloudflare R2 storage helper.
 * Audio files are stored at: voice/{accountId}/{captureId}.webm
 * Using @aws-sdk/client-s3 (already compatible with R2's S3 API).
 */
```

Install if missing: `npm install @aws-sdk/client-s3 @aws-sdk/s3-request-presigner`

Exports:
- `generateUploadPresignedUrl(key: string, contentType: string): Promise<string>`
  — Returns a PUT presigned URL (expires 5 min). Client uploads directly.
- `getPublicUrl(key: string): string`
  — Returns `${CLOUDFLARE_R2_PUBLIC_URL}/${key}`
- `deleteObject(key: string): Promise<void>`
  — Hard delete from R2. Used if transcription fails and capture is abandoned.
- `r2KeyForCapture(accountId: string, captureId: string): string`
  — Returns `voice/${accountId}/${captureId}.webm`

---

## 7. BullMQ Worker — Create `jobs/workers/transcription.worker.ts`

```typescript
/**
 * Whisper Transcription Worker
 * Runs as a separate process: `npx tsx jobs/workers/transcription.worker.ts`
 * In production: deploy as a separate Vercel function or Railway worker.
 *
 * Queue name: "transcription"
 * Job data: { captureId: string; accountId: string; r2Key: string }
 */
```

Worker logic:
1. Download audio from R2 (use a signed GET URL, not the public URL — audio is private)
2. Send to OpenAI Whisper API (`model: "whisper-1"`, `response_format: "text"`)
3. Basic transcript cleaning: remove "um", "uh", "like", repeated words (simple regex)
4. `db.updateCapture(captureId, { transcript, transcript_cleaned, status: 'accepted' })`
5. Trigger Voice Profile rebuild (enqueue a separate `voice-profile` job)
6. On error: `db.updateCapture(captureId, { status: 'failed', error_message })`

Add `lib/jobs/queues.ts`:
```typescript
// Shared queue references (import these instead of creating new Queue instances)
export const transcriptionQueue = new Queue("transcription", { connection })
export const voiceProfileQueue = new Queue("voice-profile", { connection })
```

Add `jobs/workers/voice-profile.worker.ts`:
1. Fetch last 30 accepted transcripts for the account (why_story + daily_journey)
2. Build the prompt with all transcripts
3. Call Claude Sonnet (`claude-sonnet-4-5` or latest available)
4. Parse JSON response — validate against the Voice Profile schema with Zod
5. Increment version and insert into `voice_profiles`

Connection: use Upstash Redis IORedis compatible connection from `REDIS_URL`.

---

## 8. API Routes

### POST `/api/voice/upload-url`
**Auth:** `getAccountFromSession()` — must be authenticated

Request body (Zod):
```typescript
{ captureType: "why_story" | "daily_journey"; durationSeconds: number }
```

Validations:
- `why_story`: durationSeconds must be 60–600
- `daily_journey`: durationSeconds must be 20–300
- `why_story`: check no existing accepted why_story exists (one-time rule)
- `daily_journey`: check `countTodayDailyJourneys() < 3`

Logic:
1. Create a `voice_captures` row with `status = 'uploading'`
2. Generate R2 presigned PUT URL via `generateUploadPresignedUrl()`
3. Return `{ captureId, uploadUrl, expiresIn: 300 }`

### POST `/api/voice/confirm-upload`
**Auth:** `getAccountFromSession()`

Request body: `{ captureId: string }`

Logic:
1. Load capture, verify it belongs to this account and is in `uploading` status
2. Update status to `transcribing`
3. Enqueue BullMQ transcription job: `transcriptionQueue.add("transcribe", { captureId, accountId, r2Key })`
4. Return `{ jobId: job.id }`

### GET `/api/voice/status/[captureId]`
**Auth:** `getAccountFromSession()`

Logic:
1. Load capture by id + account_id
2. Return `{ status, transcript: transcript_cleaned, error_message }`
   — only return transcript if status = 'accepted'

### GET `/api/voice/captures`
**Auth:** `getAccountFromSession()`

Query params: `type?: string; limit?: number`

Returns list of captures for this account (no cross-account access).

### GET `/api/voice/profile`
**Auth:** `getAccountFromSession()`

Returns the latest Voice Profile for this account, or `{ profile: null }` if none built yet.

### POST `/api/voice/profile/rebuild`
**Auth:** `getAccountFromSession()`

Manually trigger Voice Profile rebuild. Rate limit: max 1 rebuild per 10 minutes per account (use `voice_profiles.built_at` to check). Enqueue `voice-profile` job.

---

## 9. UI Components

### Page: `app/(app)/voice/page.tsx` (replace the placeholder)

Layout:
```
┌─────────────────────────────────────────────┐
│ Voice Capture                               │
│ Your authentic voice powers everything      │
├─────────────────────────────────────────────┤
│ ┌─────────────────┐  ┌────────────────────┐ │
│ │  Why Story      │  │  Daily Journey     │ │
│ │  [ONE TIME]     │  │  [0/3 today]       │ │
│ │  ● Record       │  │  ● Record Today    │ │
│ └─────────────────┘  └────────────────────┘ │
├─────────────────────────────────────────────┤
│ Voice Profile                               │
│ [Not built yet / Built from N recordings]   │
│ [Summary: "..."]                            │
├─────────────────────────────────────────────┤
│ Recent Recordings                           │
│ [List of past captures with status badges]  │
└─────────────────────────────────────────────┘
```

### Component: `app/(app)/voice/_components/audio-recorder.tsx`

Client component. Uses browser `MediaRecorder` API.

States: `idle → recording → recorded → uploading → transcribing → done | error`

UI elements:
- **Record button:** Large circle button. Red when recording. Shows waveform animation (CSS, no library needed — simple sine wave with CSS keyframes).
- **Timer:** MM:SS display. Shows recording duration live. Turns red if approaching limit.
- **Waveform:** Simple animated bars (CSS only, no canvas library needed).
- **Playback:** After recording, show an `<audio>` element for review before upload.
- **Confirm button:** "Use This Recording" → triggers upload flow.
- **Re-record button:** "Record Again" → resets state, discards previous blob.

Upload flow (client-side):
1. Call `POST /api/voice/upload-url` with type + duration
2. PUT audio blob directly to R2 presigned URL (fetch with PUT + correct content-type)
3. Call `POST /api/voice/confirm-upload` with captureId
4. Poll `GET /api/voice/status/[captureId]` every 3 seconds until status ≠ 'transcribing'
5. Show transcript preview on success. Show error message on failure.

Props:
```typescript
interface AudioRecorderProps {
  captureType: "why_story" | "daily_journey";
  minSeconds: number;
  maxSeconds: number;
  promptText: string;
  onComplete: (captureId: string, transcript: string) => void;
  disabled?: boolean;
  disabledReason?: string;
}
```

### Component: `app/(app)/voice/_components/voice-profile-card.tsx`

Displays the Voice Profile JSON in a readable card:
- Energy level badge
- Vocabulary level chip
- Common phrases (tag cloud style)
- Topics they return to
- Summary paragraph
- "Rebuild Profile" button (calls POST /api/voice/profile/rebuild)

### Component: `app/(app)/voice/_components/capture-list.tsx`

List of recent captures with:
- Type badge (Why Story / Daily Journey / Weekly Compile)
- Status badge (transcribing / accepted / failed)
- Date + duration
- Collapsed transcript (click to expand)
- Playback button (if r2_public_url exists)

---

## 10. Weekly Compile Cron Job

### Create `jobs/crons/weekly-compile.ts`

```typescript
/**
 * Weekly Compile — runs every Monday 00:00 UTC (= 08:00 MYT)
 * Cron expression: "0 0 * * 1"
 *
 * In production: deploy as a Vercel Cron (vercel.json) or Railway cron.
 * For local dev: run manually with `npx tsx jobs/crons/weekly-compile.ts`
 */
```

Logic:
1. `adminDb.accounts.listAll()` — get all active accounts
2. For each account, find all `daily_journey` captures from last 7 days
3. Skip if fewer than 2 entries
4. Build Claude Sonnet prompt from the entries (see Pipeline 3 prompt above)
5. Call Claude API, get weekly summary text
6. Insert into `voice_captures` as `type = 'weekly_compile'`, `status = 'accepted'`,
   `transcript = summary`, `week_start_date = last Monday's date`
7. Enqueue `voice-profile` job for the account

Add to `vercel.json` (create if doesn't exist):
```json
{
  "crons": [
    { "path": "/api/crons/weekly-compile", "schedule": "0 0 * * 1" }
  ]
}
```

Also create `app/api/crons/weekly-compile/route.ts`:
- Vercel Cron calls this endpoint
- Verify `Authorization: Bearer ${CRON_SECRET}` header
- Runs the weekly compile logic inline (or delegates to a queue job)
- Add `CRON_SECRET` to `.env.example`

---

## 11. Rules & Constraints — READ BEFORE CODING

These are non-negotiable. Violating any of these breaks the system.

### R1: Account Isolation (ENGINEERING_RULES.md R1)
```typescript
// ❌ FORBIDDEN — leaks data across accounts
const captures = await db.select().from(voiceCaptures)

// ✅ REQUIRED — always scope to account
const captures = await scopedDb(accountId).voice.listCaptures()
```
Every single DB query must go through `scopedDb(accountId)`.
The only exception is the cron job using `adminDb` — mark every such call with:
`// ADMIN: cross-account query intentional`

### R2: No Text Input Alternative
There must be no text area, text input, or "type your story instead" option anywhere
in the Voice Capture UI. Audio is mandatory. This is an architectural decision.

### R3: Daily Limit is Strict
3 Daily Journey recordings per calendar day (Malaysia timezone: Asia/Kuala_Lumpur).
Check must happen at the API level in `/api/voice/upload-url`, not just in the UI.
The API must return 429 if the limit is reached.

### R4: Why Story is One-Time
Once a Why Story has `status = 'accepted'`, the user cannot record another.
The UI must show "Your Why Story is locked in ✓" with a playback option.
Admin can reset (DELETE the record via an admin API route you must also create).

### R5: Modification Rule (for Content Studio — enforce NOW)
Voice transcripts are raw — they don't yet need the Modification Rule.
But when you add `transcript_cleaned` to the API response, add a field:
`similarity_warning: false` (always false for transcripts — they are source material,
not AI drafts). This field will be used by Content Studio later.

### R6: TypeScript Strict
- `noUncheckedIndexedAccess` is ON — always check array access with `?.[0]` or guard
- No `any` types — use `unknown` + type narrowing
- All Zod schemas go in `lib/validators/voice.ts`
- All DB types inferred from Drizzle schema — no manual type duplication

### R7: Error Handling Pattern
All API routes return:
```typescript
// Success
{ data: T }  or  { ok: true, ... }
// Error
{ error: string }  with appropriate HTTP status
```
Never throw unhandled errors in API routes — wrap in try/catch, return 500 with message.

### R8: Compliance — No Voice Data to Third Parties
Whisper transcription via OpenAI is acceptable (in privacy policy).
Never send audio or transcripts to any other third-party service not listed in the
approved stack. Do not add logging services that capture transcript content.

---

## 12. Tests Required

Create `tests/voice-capture.test.ts`:

1. **Daily limit guard** — `countTodayDailyJourneys` mock: return 3 → API must return 429
2. **Why Story one-time guard** — existing accepted why_story → API must reject new upload
3. **Duration validation** — daily_journey with 15 seconds → rejected; 90 seconds → accepted
4. **Account isolation** — Voice captures from Account A not visible in Account B's list
5. **Voice Profile Zod schema** — test that invalid JSON (missing fields) is rejected
6. **R2 key format** — `r2KeyForCapture(accountId, captureId)` returns correct path
7. **Weekly compile skip** — fewer than 2 entries → compile is skipped (no insert)
8. **Status polling** — status transitions: uploading → transcribing → accepted

Target: all tests pass with `npx vitest run`.

---

## 13. File Checklist

By the end, these files must exist:

```
lib/
  db/
    schema/
      voice.ts                          ← NEW
      index.ts                          ← UPDATE (add voice export)
    scoped.ts                           ← UPDATE (add voice namespace)
  storage/
    r2.ts                               ← NEW
  jobs/
    queues.ts                           ← NEW
  validators/
    voice.ts                            ← NEW (all Zod schemas)

drizzle/
  0002_voice_capture.sql                ← NEW

jobs/
  workers/
    transcription.worker.ts             ← NEW
    voice-profile.worker.ts             ← NEW
  crons/
    weekly-compile.ts                   ← NEW

app/
  (app)/
    voice/
      page.tsx                          ← REPLACE placeholder
      _components/
        audio-recorder.tsx              ← NEW
        voice-profile-card.tsx          ← NEW
        capture-list.tsx                ← NEW
  api/
    voice/
      upload-url/route.ts               ← NEW
      confirm-upload/route.ts           ← NEW
      status/[captureId]/route.ts       ← NEW
      captures/route.ts                 ← NEW
      profile/route.ts                  ← NEW
      profile/rebuild/route.ts          ← NEW
    crons/
      weekly-compile/route.ts           ← NEW
    admin/
      voice/reset-why-story/route.ts    ← NEW (admin: reset why story for account)

tests/
  voice-capture.test.ts                 ← NEW

vercel.json                             ← NEW (cron config)
```

---

## 14. Definition of Done

Codex is done when ALL of the following are true:

- [ ] `npx tsc --noEmit` → 0 errors
- [ ] `npx vitest run` → all tests pass (including the 15 existing + new voice tests)
- [ ] `npx drizzle-kit generate` → generates migration without errors
- [ ] The `/voice` page renders without runtime errors (run `npx next build`)
- [ ] Audio recorder component compiles and has no missing imports
- [ ] All API routes return typed responses (no `any` in return types)
- [ ] `scopedDb` voice namespace is fully typed (inferred from Drizzle schema)
- [ ] No direct `db.select().from(voiceCaptures)` calls outside of `scoped.ts`
- [ ] `ADMIN: cross-account query intentional` comment on every `adminDb` call in crons
- [ ] `vercel.json` exists with cron schedule

---

## 15. Start Order (Recommended Sequence)

Execute in this order to avoid import errors:

1. `lib/db/schema/voice.ts` (schema first — everything depends on it)
2. `lib/db/schema/index.ts` (update exports)
3. `drizzle/0002_voice_capture.sql` (SQL migration)
4. `lib/validators/voice.ts` (Zod schemas — used by API routes and workers)
5. `lib/db/scoped.ts` (add voice namespace — imports from schema)
6. `lib/storage/r2.ts` (independent utility)
7. `lib/jobs/queues.ts` (BullMQ queue references)
8. `jobs/workers/transcription.worker.ts`
9. `jobs/workers/voice-profile.worker.ts`
10. `jobs/crons/weekly-compile.ts`
11. API routes (upload-url → confirm-upload → status → captures → profile → rebuild)
12. `app/api/crons/weekly-compile/route.ts`
13. `app/api/admin/voice/reset-why-story/route.ts`
14. UI components (audio-recorder → capture-list → voice-profile-card)
15. `app/(app)/voice/page.tsx` (assembles the components)
16. `tests/voice-capture.test.ts`
17. `vercel.json`
18. Final: run `tsc --noEmit` + `vitest run` + `next build`
