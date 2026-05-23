# MVP_IMPLEMENTATION_PLAN.md — Sequenced Build Plan
# Herbalife Internal Team Tool v4.1.3

> **Do not start coding until Phase 0 compliance actions are complete.**
> Architecture references: `docs/architecture/herbalife-internal-team-tool-master-archive.md`
> Voice Capture detail: `docs/architecture/voice-capture-playbook.md`

---

## Overview

| Phase | Duration | Focus | Gate |
|-------|----------|-------|------|
| **Phase 0 — Pre-Build** | Days 1–14 | Discovery + compliance kickoff | Herbalife email sent |
| **Phase 1 — Foundation** | Week 1 | Auth + multi-tenant DB + infrastructure | All 7 Day-1 decisions locked |
| **Phase 2 — Voice Capture** | Weeks 2–3 | Voice Capture System (backbone) | Voice notes transcribing; stories extracting |
| **Phase 3 — Content Studio** | Week 4 | 9-layer prompt + compliance filter | Content generation works end-to-end |
| **Phase 4 — Funnel + Lead Magnets** | Week 5 | Funnel builder + PDF personalization | One funnel end-to-end live |
| **Phase 5 — Webinar System** | Week 6 | Recorded webinar + segmentation | Webinar plays; watch data captured |
| **Phase 6 — CRM + Follow-up** | Week 7 | Manual CRM + daily to-do | Lead lifecycle complete |
| **Phase 7 — Auxiliary** | Week 8 | Ad Insights + Objection Library | Auxiliary modules working |
| **Phase 8 — Compliance** | Weeks 9–10 | PDPA features + audit log | Compliance features production-ready |
| **Phase 9 — Polish** | Week 11 | Setup Wizard + Admin + smoke tests | Production-ready |

**Total: 11 weeks coding. Preceded by 14-day discovery sprint.**

---

## Parallel Workstreams

Four zones run in parallel throughout the build phase.

```
Week:    1    2    3    4    5    6    7    8    9    10   11
         ─────────────────────────────────────────────────────
WS1      [Foundation][VC Sys.][CS][Funnel][Webinar][CRM][Aux][CP][CP][Polish]
(Code)   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

WS2      [Compliance CSV][Master Lead Magnet 1][Lead Magnet 2][LM3][Webinar Script]
(Writer) ──────────────────────────────────────────────────────────

WS3      [Prompt v1][Tune][Tune Content Studio][Tune][Tune][...]
(Steven) ────────────────────────────────────────────────────────

WS4      ·············[Live Testing starts Week 6]·············
(Testing)────────────────────────────────────────────────────────
```

**Critical insight** (from master archive Section 14.4): The critical path is content + testing,
not coding. Accelerating code does not accelerate the overall timeline.

---

## Phase 0 — Pre-Build (Days 1–14)

**This phase runs BEFORE any code is written.** Do not start Phase 1 until Day 1 compliance
actions are complete.

### Compliance Action 1 — Herbalife Corporate Email (Day 1–2)

Send an email to Herbalife Malaysia compliance inquiring about guidance for an internal
AI-assisted content drafting tool for your own downline. Emphasize:
- Internal use only (your 50 downline, no fees charged)
- AI generates drafts; distributors are required to review and modify before publishing
- No automated social media posting, no platform API integrations
- All content passes through compliance filters before being shown

Frame as "seeking guidance" not "asking permission."

| Corporate Response | Action |
|-------------------|--------|
| ✅ OK / proceed | Build continues. Keep email as paper trail. |
| 🟡 Need more info | Provide demo + documentation. Continue cautiously. |
| 🟡 Formal approval process | Enter process. Possible 4–8 week delay. |
| 🔴 Not allowed | **STOP. Pivot to Team Leader Playbook (Notion + Group Coaching).** |
| ⏳ No response after 4 weeks | Good faith effort made. Proceed cautiously. |

### Compliance Action 2 — Tax Accountant (Day 3–7)

30–60 minute consultation (RM 500–1,000). Key questions:
- How to structure the RM 16–30K investment as tax deduction
- Sole proprietor vs Sdn Bhd for future productization
- Tax implications if 50 downlines benefit from your tool
- What records to keep for LHDN

### Compliance Action 3 — Internal Terms of Use Draft (Day 5–10)

Draft a Terms of Use that all downlines must e-sign during onboarding. Key clauses:
- Eligibility (your active downlines only)
- Tool usage (draft assistance only, distributor is final author)
- Compliance obligations (distributor's own responsibility for content they post)
- Data responsibility (what data you collect and why)
- Restrictions (no screenshots for external sharing, no sub-licensing)
- Termination (you can revoke access)
- Liability limitations

### Discovery Sprint Activities (Days 1–14)

In parallel with compliance:
- Interview 3–5 downlines to validate assumptions (especially Voice Capture paradox)
- Shortlist and contact content writer candidates
- Finalize brand archetype list (3–5 archetypes for MVP)
- Draft 5 Why Story excavation questions (in zh-CN for Chinese users)
- Sketch Setup Wizard step-by-step UX flow

---

## Phase 1 — Foundation (Week 1)

**Goal:** All 7 Day-1 architecture decisions are locked in running code before anything else.

### Task F1 — Auth + Account Model + Invite Flow

```
Read: master-archive.md Section 5 (Decision 3) + Section 6 (Auth)

Implement:
1. Clerk (or Supabase Auth) setup
2. accounts, users, account_memberships tables (Drizzle schema)
3. Invite-only flow: admin creates invite token, downline uses magic link
4. getAccountFromSession() helper in lib/auth/session.ts
5. Role-based access: 'owner' vs 'admin'

Tests:
- Unauthenticated requests return 401
- Admin can create accounts; non-admin cannot
- Invite token expires after 48h
```

### Task F2 — Multi-Tenant Database Foundation

```
Read: master-archive.md Section 5 (Decisions 1, 2) + Section 11

Implement:
1. All core table schemas with account_id (Drizzle)
   - accounts, users, account_memberships
   - brand_kits, voice_profiles (empty at this stage)
   - leads (empty at this stage)
   - audit_logs
2. scopedDb(accountId) helper (lib/db/scoped.ts)
   - Throws if accountId is missing
   - Returns typed query builders for each table
3. Migration file: drizzle/0001_initial_accounts.sql

Tests:
- account-isolation.test.ts: Account A cannot read Account B's leads
- scopedDb throws on undefined accountId
```

### Task F3 — Subdomain Routing Middleware

```
Read: master-archive.md Section 5 (Decision 4)

Implement:
1. middleware.ts: parse subdomain from host header
2. Resolve account from subdomain (or pass through for app/admin/api)
3. Inject x-account-id header into request
4. Vercel wildcard domain setup instructions in /docs/deployment.md

Tests:
- Subdomain resolves to correct account
- Unknown subdomain returns 404
- Reserved subdomains (www, app, admin, api) pass through
```

### Task F4 — Cloudflare R2 Storage Client

```
Read: master-archive.md Section 5 (Decision 5)

Implement:
1. R2 client in lib/storage/r2.ts
2. Presigned URL generation (upload + download)
3. Path enforcement: accounts/{account_id}/{module}/{filename}
4. Helper: r2Path(accountId, module, filename) → always-correct path

Tests:
- Generated paths always include account_id in position 2
- Presigned URL expires within configured window
```

### Task F5 — BullMQ + Redis Setup

```
Note: BullMQ is required for async Whisper transcription (not in original tech stack
docs, but required for the async job architecture). Add redis to infrastructure.

Implement:
1. Redis connection in jobs/queues.ts
2. Queue definitions: transcribe-voice-note
3. Job retry policy (2 attempts, exponential backoff)
4. Dead letter queue for failed transcriptions

Tests:
- Queue accepts jobs
- Worker processes jobs and updates DB
```

### Task F6 — Sentry + PostHog Instrumentation

```
Implement:
1. Sentry initialization with account_id context
2. PostHog client with account_id identify
3. Structured logger utility with account_id + action fields
4. Error boundary wrapper for route handlers
```

**Phase 1 Gate:** Auth works. An admin can create an account and invite a downline. The
downline logs in and sees an empty dashboard. scopedDb is in place. R2 can accept uploads.

---

## Phase 2 — Voice Capture System (Weeks 2–3)

**Goal:** The Voice Capture backbone is fully operational. New distributors can complete
Why Story sessions, capture daily moments, receive weekly drafts, and have a Voice Profile.

**CRITICAL:** This phase must be 100% complete before Phase 3 begins.

### Task V1 — Voice Notes Schema + R2 Upload Pipeline

```
Read: voice-capture-playbook.md Sections 2.1, 3, 4

Implement:
1. voice_notes table (Drizzle schema — see playbook Section 2.1)
2. POST /api/voice-notes/presign (R2 presigned URL)
3. POST /api/voice-notes/complete (notify upload done, enqueue job)
4. Migration: drizzle/0002_voice_capture_tables.sql (all 5 voice tables)
   - voice_notes, story_bank, journey_moments, voice_profiles, content_drafts

Tests:
- Account isolation on voice_notes
- Presigned URL path includes account_id
- Complete endpoint enqueues BullMQ job
```

### Task V2 — Whisper Transcription Worker

```
Read: voice-capture-playbook.md Section 2.2 (data flow diagram)

Implement:
1. BullMQ worker: transcribe-voice-note
2. Download audio from R2 → call Whisper API → update voice_notes
3. transcript_status transitions: pending → completed | failed
4. Event emission after completion to trigger downstream pipelines
5. Retry: 1 retry on failure; on final failure → mark 'failed', push user notification

Tests:
- Happy path: audio uploaded → transcript stored
- Whisper failure → status = 'failed', user notified
- Account isolation on transcript access
```

### Task V3 — VoiceRecorder UI Component

```
Read: voice-capture-playbook.md Section 13

Implement:
1. components/voice/VoiceRecorder.tsx (complete implementation from playbook)
2. States: idle → recording → uploading → done
3. Duration enforcement (min/max configurable)
4. Direct-to-R2 upload via presigned URL
5. Mobile-optimized (large tap targets, audio/webm or audio/mp4)
6. Error handling: no mic permission, upload failure

Tests:
- Component renders in each state
- Duration enforcement (minDuration check)
- Upload triggers presign → PUT to R2 → complete API
```

### Task V4 — Why Story Excavation Pipeline

```
Read: voice-capture-playbook.md Sections 5, 9, 14

Implement:
1. story_bank table already in migration (Task V1)
2. POST /api/why-story/session/start
3. GET /api/why-story/session/:id/status
4. POST /api/why-story/session/:id/extract (Claude Sonnet + WHY_STORY_EXTRACTION_PROMPT)
5. PATCH /api/story-bank/:id (confirm + edit)
6. app/why-story/session/page.tsx (5 questions, VoiceRecorder per question)
7. app/why-story/review/page.tsx (review 3 extracted stories)
8. Session expiry: 48 hours from creation

Important constraints:
- NO text input alternative for questions
- Stories are created with user_confirmed=false
- Only confirmed stories are visible to other modules
- Extraction requires all 5 voice notes transcribed

Tests:
- 5 questions completed → extraction succeeds
- Fewer than 5 questions → extraction returns 400
- Extracted stories default to user_confirmed=false
- User confirmation sets user_confirmed=true
- Session expires after 48h
```

### Task V5 — Daily Journey Capture

```
Read: voice-capture-playbook.md Sections 6, 10, 15

Implement:
1. journey_moments table already in migration (Task V1)
2. GET /api/journey/today (has user captured today?)
3. POST /api/journey/capture (categorize with Claude Haiku + save)
4. GET /api/journey/list?days=14 (paginated)
5. app/journey/capture/page.tsx (rotating prompt + VoiceRecorder)
6. Daily cron: jobs/crons/daily-journey-reminder.ts (8pm push notification)
7. POST /api/push/subscribe (save push subscription)
8. Limit: max 3 captures per account per day

Important:
- Use Claude Haiku for categorization (cost-sensitive: 30×/month/user)
- Push notification has idempotency tag
- Allow user to adjust notification time in settings (7pm–10pm)

Tests:
- 4th capture on same day returns 429
- Categorization produces valid category enum value
- Push not sent to user who already captured today
```

### Task V6 — Weekly Compile Cron + Modification Detection

```
Read: voice-capture-playbook.md Sections 7, 11, 16

Implement:
1. content_drafts table already in migration (Task V1)
2. Weekly cron: jobs/crons/weekly-compile.ts (Sunday 9am)
3. Compile logic: fetch 7-day moments + brand_kit + voice_profile + stories
4. Generate 5 drafts using WEEKLY_COMPILE_PROMPT (Claude Sonnet)
5. GET /api/weekly-compile/this-week
6. PATCH /api/content-drafts/:id (save modified text, compute similarity)
7. POST /api/content-drafts/:id/export (modification gate)
8. lib/content/similarity.ts (detectModification, threshold 0.85)
9. app/weekly-compile/page.tsx + DraftCard component

Important:
- Compile is skipped if < 3 journey moments in past 7 days
- Export is blocked if similarity > 0.85
- UI shows real-time modification progress bar

Tests:
- < 3 moments → compile skipped, user notified
- Unmodified draft (similarity > 0.85) → export returns 400
- Modified draft → export succeeds, status = 'exported'
- Exported moment IDs saved to used_in_content_ids
```

### Task V7 — Voice Profile Generation

```
Read: voice-capture-playbook.md Sections 8, 12

Implement:
1. voice_profiles table already in migration (Task V1)
2. Monthly cron: jobs/crons/monthly-voice-profile.ts (1st of month, 2am)
3. Generation logic: fetch 30-day moments + exported content + stories
4. Generate profile using VOICE_PROFILE_GENERATION_PROMPT (Claude Sonnet)
5. Confidence score computation (Section 8.2)
6. Deactivate old version, insert new version
7. GET /api/voice-profile/current
8. POST /api/voice-profile/regenerate (admin only, for testing)

Important:
- Skip if < 10 moments OR < 3 exported drafts in past 30 days
- is_active flag: only one active profile per account

Tests:
- Insufficient data → profile not generated
- New profile version deactivates old version
- Confidence score is between 0 and 1
- Admin-only regenerate endpoint rejects non-admin
```

**Phase 2 Gate:** A new distributor can complete the Why Story session (5 questions), capture
daily journey moments, receive Sunday weekly drafts, modify and export them, and have a Voice
Profile generated after 30 days of usage. Account isolation tests pass for all 5 tables.

---

## Phase 3 — Content Studio (Week 4)

**Goal:** Content generation with all 9 layers, including voice data from Phase 2.

### Task C1 — 9-Layer Prompt System

```
Read: master-archive.md Section 8.3

Implement:
1. lib/content/prompts/ — all 9 layer files
2. lib/content/prompts/index.ts — assemblePrompt() function
3. Layers 1–6: base compliance, persona, platform, content type, runtime, language
4. Layers 7–9: inject voiceProfile, storyBank, journeyBank (empty strings if unavailable)
5. variation_seed computation in lib/content/variation.ts
6. 60/30/10 mix scheduler in lib/content/mix-scheduler.ts
```

### Task C2 — Compliance Filter Pipeline

```
Read: master-archive.md Section 8.11 + ENGINEERING_RULES.md R6

Implement:
1. lib/compliance/filter.ts — runComplianceFilter() (4 layers in order)
2. lib/compliance/keywords.ts — load from docs/compliance/keywords.csv
3. lib/compliance/regex.ts — Layer 1
4. lib/compliance/numeric.ts — Layer 2
5. lib/compliance/llm-judge.ts — Layer 3 (Claude Haiku)
6. lib/compliance/disclosure.ts — Layer 4
7. compliance_checks table — log every check
8. components/compliance/DisclosureBlock.tsx — non-deletable component

Tests:
- Each layer independently tested
- Known banned phrases → reject
- Known income claims → reject
- Missing disclosure → flag
- Clean content → pass
```

### Task C3 — Content Generation API + UI

```
Read: master-archive.md Section 8.3

Implement:
1. POST /api/content-studio/generate
   - Assemble 9-layer prompt
   - Call Claude Sonnet
   - Run compliance filter
   - Return result with compliance status
2. app/content-studio/page.tsx — generate UI
3. lib/content-studio/generate.ts — orchestration

Tests:
- Generation runs compliance filter before returning
- Rejected content returns error (not the content)
- Voice Profile layers inject correctly when profile exists
- Voice Profile layers return empty string (not error) when no profile yet
```

**Phase 3 Gate:** A distributor can generate content, it passes through the 4-layer compliance
filter, and the compliance layer 7–9 injections produce noticeably different content compared
to without voice data.

---

## Phase 4 — Funnel + Lead Magnets (Week 5)

### Task L1 — Funnel Builder

```
Read: master-archive.md Section 8.4

Implement:
1. funnel_templates table (Drizzle)
2. GET/POST /api/funnels (list, create)
3. GET/PATCH /api/funnels/:id (get, update)
4. app/funnel/[slug]/page.tsx — public landing page renderer
5. DisclosureBlock mandatory on every landing page
6. Lead capture form: name, phone, email + PDPA consent checkbox
7. On submit: create lead record + trigger MOFU Day 1

Phase 1 MVP: 2 persona templates seeded (上班族 + 全职妈妈)
```

### Task L2 — Lead Magnet System + PDF Personalization

```
Read: master-archive.md Section 8.5

Implement:
1. master_lead_magnets table (platform-owned, account_id = null)
2. distributor_lead_magnets table (per-account personalized copies)
3. Puppeteer PDF personalization: inject name, photo, WhatsApp link
4. POST /api/lead-magnets/:id/personalize → generate PDF → store in R2
5. Delivery: after lead submits form → email PDF link via Resend

Phase 1 MVP: 3 master lead magnets seeded by Steven + content writer
```

### Task L3 — Nurture Sequence State Machine

```
Read: master-archive.md Section 9.2 (Days 1–7)

Implement:
1. Nurture sequence logic (days 1–7 email + push cadence)
2. Triggered automatically when lead enters MOFU
3. Day 7: webinar registration invitation
4. Email delivery via Resend

Note: This is system-internal state machine; WhatsApp reminders are manual
(Follow-up Coach shows human what to send, does not send automatically)
```

---

## Phase 5 — Webinar System (Week 6)

### Task W1 — Recorded Webinar Player

```
Read: master-archive.md Section 8.6

Implement:
1. webinar_masters, distributor_webinar_configs tables
2. Bunny.net Stream integration (video delivery)
3. app/webinar/[token]/page.tsx — watch room
4. JIT + scheduled slot options (not fake-live)
5. NEVER add: "LIVE NOW" label, fake attendee count, fake Q&A bots
```

### Task W2 — Registration + Reminder Sequence

```
Implement:
1. POST /api/webinars/register
2. webinar_registrations table
3. Reminder cron: T-24h, T-3h, T-30min (push + email via Resend)
4. Landing page must display "Pre-recorded training" label
```

### Task W3 — Watch Heartbeat + Segmentation

```
Implement:
1. POST /api/webinars/:token/heartbeat (every 5–10 seconds)
2. webinar_watch_events table
3. Segmentation logic:
   - Hot: watch > 80% AND (click CTA OR asked question)
   - Warm: watch 50–80%
   - Cold: < 30% or no-show
4. Post-webinar: update lead.stage + dispatch follow-up tasks
```

---

## Phase 6 — CRM + Follow-up (Week 7)

### Task R1 — Manual CRM

```
Read: master-archive.md Section 8.7

Implement:
1. leads, lead_activities tables
2. GET/POST /api/leads (list, create)
3. PATCH /api/leads/:id (manual stage transitions)
4. app/crm/page.tsx — Kanban board
5. app/crm/[id]/page.tsx — Lead detail:
   - Conversation snippet textarea (paste WhatsApp chat)
   - POST /api/leads/:id/analyze → Claude analysis (tag + objection type + next step)
   - WhatsApp deep link button
   - Activity timeline
6. Audit log on all lead writes
```

### Task R2 — Follow-up Coach

```
Read: master-archive.md Section 8.8

Implement:
1. app/follow-up/page.tsx — today's task list
2. Three streams: Hot leads (post-webinar 24h), Warm leads (day 2–7), Day-N nurture
3. Per lead: suggested message (copy) + WhatsApp deep link button
4. No automatic sending. Human clicks, manual action.
```

---

## Phase 7 — Auxiliary (Week 8)

### Task A1 — Ad Insights

```
Read: master-archive.md Section 8.9

Implement:
1. Manual entry form: spend, impressions, clicks, leads
2. POST /api/ad-insights/ocr → GPT-4o Vision → extract metrics from screenshot
3. AI analysis: CPL comparison, CTR interpretation, plain-language explanation
4. Per-funnel-layer breakdown (TOFU vs BOFU CPL)
```

### Task A2 — Objection Library

```
Read: master-archive.md Section 8.10

Implement:
1. 5 categories × 3 responses seeded (by Steven + content writer)
2. app/objections/page.tsx — browse by category
3. CRM sidebar: suggest responses when lead conversation is pasted
4. Voice injection: AI injects distributor's own story into generic response
   (requires confirmed story_bank entries)
```

---

## Phase 8 — Compliance Features (Weeks 9–10)

### Task CP1 — PDPA Consent + Privacy Notice

```
Read: master-archive.md Section 12.3

Implement:
1. Consent checkbox on every funnel landing page (required field)
2. consent_given, consent_at, consent_ip, privacy_notice_version added to leads table
3. app/privacy/page.tsx — Privacy Notice page
4. Data controller disclosure + cross-border storage notice (Singapore/AWS)
```

### Task CP2 — Audit Log

```
Implement:
1. audit_logs table (already in schema from Phase 1)
2. auditLog() helper function
3. Wire up to: all lead writes, voice note uploads, story confirmations,
   compliance checks, PDPA actions, admin actions
4. Append-only enforcement (no DELETE on audit_logs)
```

### Task CP3 — Data Subject Rights

```
Read: master-archive.md Section 12.3

Implement:
1. POST /api/leads/:id/delete — PDPA deletion flow (lib/pdpa/delete.ts)
2. GET /api/leads/:id/export — data subject export
3. Monthly cron: 12-month auto-anonymize (lib/pdpa/anonymize.ts)
4. Admin UI: deletion confirmation + paper trail
```

### Task CP4 — Terms of Use Acceptance

```
Implement:
1. terms_accepted, terms_accepted_at columns on account_memberships
2. Gate: if terms not accepted, redirect to terms page before dashboard
3. Terms page with e-signature (checkbox confirm)
```

---

## Phase 9 — Polish (Week 11)

### Task P1 — Account Setup Wizard (8 Steps)

```
Read: master-archive.md Section 8.1

Implement:
1. Setup Wizard routing (step-1 through step-8)
2. Onboarding path branching based on distributor_seniority:
   - new (< 3 months): full 8 steps including Why Story
   - intermediate (3–12 months): Voice Capture optional
   - experienced (1y+): import past posts → AI generate initial Voice Profile
3. brand_kit creation and injection into all modules
4. Setup completion flag gates dashboard access
```

### Task P2 — Admin Dashboard

```
Implement:
1. app/(admin)/accounts/page.tsx — all accounts, Voice Capture state per account
2. app/(admin)/accounts/new/page.tsx — create + send invite
3. app/(admin)/compliance/page.tsx — flagged content review queue
4. Per-account detail: Why Stories count, journey moment count, capture rate,
   Voice Profile version + confidence, posts published
```

### Task P3 — End-to-End Smoke Tests

```
Write integration tests covering:
1. New distributor invite → login → setup wizard → Why Story → daily capture → weekly compile → export
2. Lead lifecycle: funnel form → MOFU → webinar register → watch → segment → CRM
3. Content generation → compliance filter → passed content
4. Compliance rejection → user sees error → content not exposed
5. Admin: create account → view voice capture state → review flagged compliance content
```

---

## Architecture Risks & Mitigations

These risks were identified during architecture review. Review before starting each affected phase.

| Risk | Phase Affected | Mitigation |
|------|---------------|------------|
| **RLS vs app-level filtering conflict** | Phase 1 | Resolved: use scopedDb() for MVP (see AGENTS.md Section 13). Add RLS at productization. |
| **Vercel 60s timeout for Whisper transcription** | Phase 2 | Use BullMQ worker + Redis, not route handler. Return 202 immediately. |
| **BullMQ/Redis not in original stack** | Phase 2 | Added explicitly. Provision Redis (Upstash on Vercel recommended). |
| **Compliance filter has no golden test set** | Phase 3 | Content writer delivers 20 pass/fail test cases in Week 3. |
| **Multi-LLM provider failures** | Phase 3+ | Wrap each LLM call in try/catch with user-friendly error. No fallback model (data integrity risk). |
| **Content writer late → prompt engineering blocked** | Phase 3 | Week 2 brief: deliver 3 sample lead magnet paragraphs by end of Week 2 for prompt testing. |
| **Monthly Voice Profile cron timeout for 50 accounts** | Phase 2 | Process one account per Vercel cron invocation, not all 50 at once. |
| **Admin vs downline data boundary** | Phase 1 | Admin routes use `// ADMIN: cross-account query intentional` comments. Audited separately. |
| **Herbalife corporate compliance gate** | Phase 0 | Hard stop condition. Do not build if corporate says No. |

---

## Go/No-Go Gates

### Phase 1 Gate
- [ ] Admin can invite a downline via magic link
- [ ] Downline can log in and see dashboard
- [ ] Account isolation test passes for leads table
- [ ] scopedDb throws on missing accountId
- [ ] R2 upload path includes account_id

### Phase 2 Gate (CRITICAL — must pass before Phase 3)
- [ ] Why Story session: all 5 questions → transcription → extraction → user confirmation works
- [ ] Daily journey capture → auto-categorization → journey_moments record
- [ ] Weekly compile runs (Sunday 9am) → 5 drafts generated
- [ ] Unmodified draft → export blocked (400 error)
- [ ] Modified draft → export succeeds
- [ ] Voice Profile generates after 30 days + 10 moments + 3 exports
- [ ] Account isolation tests pass for ALL 5 new tables

### Phase 3 Gate
- [ ] Content generation hits all 9 layers
- [ ] Compliance filter rejects known bad content
- [ ] Disclosure block present and non-removable
- [ ] Voice Profile data injected into generated content (measurably different from without)

### Phase 8 Gate (Production Readiness)
- [ ] Consent checkbox present on all funnel pages
- [ ] PDPA deletion deletes or anonymizes all PII
- [ ] Audit log covers all specified write operations
- [ ] Terms of Use acceptance gating onboarding
- [ ] Privacy Notice page live with correct Singapore/AWS disclosure

---

## Rollout After Phase 9

Follows the 3-stage rollout strategy from master archive Section 16:

**Rollout Stage 1 (Week 12–13):** Steven uses the tool himself. Full funnel + voice capture.
Goal: find bugs, validate UX, build first case study.

**Rollout Stage 2 (Week 14–17):** 5-person pilot cohort. Selection criteria: 3 Chinese + 2 Malay,
high willingness to change, different personas. Weekly group call (90 min) + personal check-ins.
Gate to Stage 3: 4/5 posting regularly, 3/5 getting leads, 1–2 actual sales.

**Rollout Stage 3 (Week 18+):** 5 cohort leaders each bring 9 downlines = 50 total.
You coach 5 leaders; leaders coach their 9.

**Month 6 Decision Point:** Evaluate data. Three options:
- A: Keep internal, expand to 100+
- B: Productize as SaaS (add billing shell from v4.1 blueprint)
- C: Sell methodology to other Uplines (RM 5–10K × 10–20 uplines)

---

## Success Metrics Reference

From master archive Section 17. Track from Day 1 of rollout:

| Metric | Target |
|--------|--------|
| New distributor 90-day retention | 50–60% (baseline: 20–30%) |
| New distributor posts in first month | 10–15 (baseline: 0–3) |
| Content "feels like me" rating | 80% |
| Daily tool open rate | 70% |
| Voice Profile confidence at Month 3 | 0.7 |
| TOFU → MOFU conversion | 30%+ |
| MOFU → Webinar register | 20%+ |
| Webinar attend rate | 40%+ |
| Webinar → 1:1 conversation | 15%+ |
| 1:1 → New distributor/customer | 20%+ |

---

*Last updated: 2026-05-20 · Based on v4.1.3 Master Architecture Archive + Voice Capture Playbook*
