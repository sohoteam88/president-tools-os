# AGENTS.md — Claude Code Agent Coordination Rules
# Herbalife Internal Team Tool v4.1.3

> **Primary source of truth**: `docs/architecture/herbalife-internal-team-tool-master-archive.md`
> **Voice Capture implementation detail**: `docs/architecture/voice-capture-playbook.md`
>
> Read both documents before starting any task. Never code from memory.

---

## 1. What This System Is

An **internal team tool** — not a public SaaS — for a Master Distributor and 50 downline members
running attraction marketing for Herbalife Malaysia (SEA Chinese market).

Three non-negotiable product principles that must shape every decision:

1. **Manual-first**: The tool never executes actions on external platforms (no WhatsApp API, no
   Meta API, no TikTok API). It generates, reminds, and records. Humans execute.
2. **Compliance-first**: Every content-generating feature must route through the Compliance Filter.
   Disclosure blocks are non-deletable. No income claims anywhere.
3. **AI = amplifier, not creator**: The Modification Rule is enforced at the code level. A draft
   that has not been edited by the human cannot be exported. This is not optional.

---

## 2. Zone Assignment — Who Does What

This project runs on a 4-zone parallel workflow. Claude Code (you) is **Zone 1 only**.

| Zone | Actor | Scope |
|------|-------|-------|
| **Zone 1 — YOU** | Claude Code | All product code (schema, API routes, UI, jobs, tests) |
| Zone 2 | Cowork | Content research, document formatting, compliance keyword CSV, slide decks |
| Zone 3 | Human (Steven) | Strategy, product decisions, prompt calibration, compliance judgment calls |
| Zone 4 | Content Writer | Master lead magnet originals, webinar script, nurture sequences |

**Hard rules for Zone 1:**
- Never make product decisions. If a spec is ambiguous, implement the most conservative
  interpretation and leave a `// TODO(DECISION): ...` comment.
- Never write original marketing content or personas. Use the placeholders in the spec.
- Never touch compliance policy logic without an explicit instruction. Err toward stricter.
- Never send real emails, push notifications, or make external API calls in tests. Mock them.

---

## 3. Build Order — Strict Dependency Sequence

**DO NOT skip or reorder steps.** The dependency chain is real and breaks downstream modules
if violated. Voice Capture must be built before Content Studio.

```
Phase 0 — Foundation (Week 1)
  ├── Task F1: Auth + Account model + Invite flow
  ├── Task F2: Multi-tenant DB schema (accounts, users, memberships)
  ├── Task F3: scopedDb helper + account isolation tests
  ├── Task F4: Subdomain routing middleware
  └── Task F5: R2 storage client + file path conventions

Phase 1 — Voice Capture System (Weeks 2–3) ← MUST come before Content Studio
  ├── Task V1: voice_notes table + R2 presigned upload
  ├── Task V2: Whisper transcription worker (BullMQ + Redis)
  ├── Task V3: VoiceRecorder UI component
  ├── Task V4: Why Story Excavation pipeline + Claude integration
  ├── Task V5: Daily Journey Capture + auto-categorize
  ├── Task V6: Weekly Compile cron + modification detection
  └── Task V7: Voice Profile generation (monthly cron)

Phase 2 — Content Studio (Week 4) ← Depends on Phase 1
  ├── Task C1: 9-layer prompt system (layers 1–6 first, then 7–9 after Voice Capture)
  ├── Task C2: Compliance Filter pipeline (4+1 layers)
  ├── Task C3: Content generation API + 60/30/10 mix logic
  └── Task C4: Content Studio UI

Phase 3 — Funnel + Lead Magnets (Week 5)
  ├── Task L1: Funnel Builder CRUD + landing page renderer
  ├── Task L2: Lead Magnet system (master + distributor + PDF personalization)
  └── Task L3: Nurture sequence state machine

Phase 4 — Webinar System (Week 6)
  ├── Task W1: Recorded Webinar player + Bunny.net integration
  ├── Task W2: Registration + reminder sequence
  ├── Task W3: Watch heartbeat tracker + segmentation logic
  └── Task W4: Post-webinar follow-up dispatch

Phase 5 — CRM + Follow-up (Week 7)
  ├── Task R1: Lead data model + Kanban UI
  ├── Task R2: Lead state machine (manual transitions)
  ├── Task R3: WhatsApp deep-link generator
  └── Task R4: Follow-up Coach daily to-do

Phase 6 — Auxiliary (Week 8)
  ├── Task A1: Ad Insights (manual entry + OCR via GPT-4o Vision)
  └── Task A2: Objection Library (5 categories × 3 responses + CRM sidebar)

Phase 7 — Compliance Features (Weeks 9–10)
  ├── Task CP1: Privacy Notice + Consent Checkbox on all funnel landing pages
  ├── Task CP2: Audit Log (all write operations)
  ├── Task CP3: Data Subject Rights (delete, export, anonymize)
  └── Task CP4: PDPA data retention policy (12-month auto-anonymize)

Phase 8 — Polish (Week 11)
  ├── Task P1: Account Setup Wizard (8 steps integrated)
  ├── Task P2: Admin dashboard (per-account Voice Capture state)
  └── Task P3: End-to-end smoke tests
```

---

## 4. How to Read a Task Brief from Steven

When you receive a task brief, it will follow this template (from master archive Section 13.2):

```
读 docs/architecture/<filename>.md Section X
实现 [模块名]:
1. Schema (Drizzle)
2. API routes
3. UI (shadcn/ui + Tailwind)
4. 业务逻辑
5. vitest 测试

约束:
- 所有 query 加 account_id scope
- TypeScript strict mode
- 跟 ENGINEERING_RULES.md 一致

完成后报告: 写了什么文件、测试结果、未完成 TODO。
```

**Always confirm your understanding** by echoing back: the Section you read, what you are
building, and any ambiguities you resolved conservatively.

---

## 5. Mandatory Pre-Task Checklist

Before writing a single line of code for any task, verify:

- [ ] Read the relevant Section(s) of the master archive
- [ ] Read ENGINEERING_RULES.md (especially the account isolation rules)
- [ ] Check REPOSITORY_STRUCTURE.md to confirm where files should live
- [ ] Confirm this module does not depend on an unbuilt upstream module
- [ ] Identify which tables this module reads/writes and verify they exist in the schema

---

## 6. Mandatory Post-Task Report

After completing any task, output exactly this report:

```
## Task Complete: [Task Name]

### Files Written
- [path/to/file.ts] — [one-line description]
...

### Schema Changes
- [table_name]: [columns added/changed]
...

### Tests
- [test file]: [N tests, all passing / N failing — reason]

### API Endpoints Added
- [METHOD /api/path] — [description]
...

### TODOs Left
- TODO(DECISION): [description of decision needed from Steven]
- TODO(PHASE-N): [work deferred to a later phase]
- TODO(TEST): [test coverage gap]
...

### Known Risks
- [Risk description and why it was left]
```

---

## 7. Critical Non-Negotiables (Cannot Be Overridden by Task Brief)

These rules apply to **every file, every session, no exceptions**:

### 7.1 Account Isolation

Every database query MUST use `scopedDb(accountId)`. Direct `db.select().from(table)` without
an `account_id` WHERE clause is **forbidden** in application code.

```typescript
// ❌ FORBIDDEN — will be rejected in code review
const moments = await db.select().from(journeyMoments);

// ✅ REQUIRED — always use scopedDb
const moments = await scopedDb(accountId).journeyMoments.list({ days: 14 });
```

Every route handler MUST start with:
```typescript
const account = await getAccountFromSession(req);
if (!account) return new Response('Unauthorized', { status: 401 });
```

### 7.2 Modification Rule — Enforced at Code Level

The export endpoint for any AI-generated draft MUST check `is_modified` before allowing export.
This is a product guarantee, not a nice-to-have. Use `detectModification()` from
`lib/content/similarity.ts`. The similarity threshold is **0.85** (>0.85 similarity = not modified).

```typescript
// app/api/content-drafts/[id]/export/route.ts
if (!is_modified) {
  return Response.json({ error: 'modification_required' }, { status: 400 });
}
```

### 7.3 Compliance Filter — Required Before Any Content Reaches Users

All content generated by Content Studio MUST pass through the 4-layer Compliance Filter before
being returned to the UI. The pipeline is:

```
Layer 1: Regex blacklist (< 50ms)
Layer 2: Numeric claim detection (< 50ms)
Layer 3: Claude Haiku LLM-as-judge (~500ms)
Layer 4: Disclosure block presence check
    ↓
Pass → return to user
Flag → queue for human review
Reject → return error, prompt user to regenerate
```

Never return unflagged AI content directly to the user, bypassing this pipeline.

### 7.4 Disclosure Block — Non-Deletable

The `<DisclosureBlock>` component in `components/ui/DisclosureBlock.tsx` must be:
- Present on every funnel landing page
- Present on every lead magnet PDF footer page
- Structurally non-removable (not a user-configurable toggle)

### 7.5 No Marketing API Integrations

Never write code that:
- Automatically posts to social media platforms
- Calls WhatsApp Business API for automated messaging
- Integrates with Meta Ads API for automated campaign management
- Integrates with TikTok for automated content publishing

WhatsApp links are `wa.me/{phone}?text={prefilled}` deep links only. No API.

### 7.6 Voice Note = Only Input for Voice Capture Sessions

The Why Story Excavation UI (Session 1) and Daily Journey Capture UI must NOT provide a text
input field as an alternative to voice note recording. The `VoiceRecorder` component is the
only input mechanism. This is a product principle, not a UX choice.

Exception (and only exception): Daily Journey Capture may offer a text fallback if recording
fails after 3 technical retries. Log this fallback usage in the audit log.

### 7.7 Audit Log Every Write

Every action that creates, modifies, or deletes a record involving personal data or content
must write to the `audit_logs` table. This is a PDPA compliance requirement.

```typescript
await auditLog({
  account_id,
  actor_user_id: session.user.id,
  action: 'lead.deleted',
  resource_type: 'lead',
  resource_id: leadId,
  ip_address: getIP(req),
});
```

---

## 8. LLM Routing Rules

Use the correct model for each task. Do not upgrade to a more expensive model to compensate
for a weak prompt — fix the prompt instead.

| Task | Model | Reason |
|------|-------|--------|
| Why Story Extraction | `claude-sonnet-4-20250514` | Deep narrative analysis |
| Weekly Compile drafts | `claude-sonnet-4-20250514` | Voice-accurate content generation |
| Voice Profile generation | `claude-sonnet-4-20250514` | Pattern analysis across 30 days |
| Content Studio generation | `claude-sonnet-4-20250514` | 9-layer prompt quality |
| Journey auto-categorize | `claude-haiku-4-5-20251001` | Short input, cost-sensitive (30×/month/user) |
| Compliance LLM-as-judge | `claude-haiku-4-5-20251001` | High-frequency, latency-sensitive |
| Ad screenshot OCR | `gpt-4o` (OpenAI) | Vision capability |
| Voice transcription | `whisper-1` (OpenAI) | Only option for audio-to-text |
| Malay language (Phase 2+) | `gemini-pro` (Google) | Superior Malay language quality |

Always use the `llmRouter` from `lib/ai/router.ts` — do not hardcode model strings in route
handlers or UI code.

---

## 9. Async Job Architecture

Whisper transcription is slow (10–30s for a 5-minute audio file). Never transcribe synchronously
in a route handler. The pattern is:

```
Route handler → insert voice_notes (status='pending') → enqueue BullMQ job → return 202
Worker → download from R2 → call Whisper → update transcript + status → emit event
Event handler → trigger downstream (Why Story extraction / Journey categorization)
```

Weekly Compile and Monthly Voice Profile generation run via Vercel Cron. Jobs that may
exceed 60 seconds must be split into a cron trigger + a worker that processes one account
at a time in a loop.

---

## 10. Error Handling Standards

All route handlers must return structured errors:

```typescript
return Response.json({
  error: 'machine_readable_code',         // snake_case, stable identifier
  message: 'Human-readable explanation',  // shown to user
  details?: { field: 'reason' }           // optional field-level errors
}, { status: 4xx | 5xx });
```

Never return raw exception messages to the client. Log them to Sentry:

```typescript
Sentry.captureException(error, { extra: { account_id, action: 'why_story.extract' } });
```

---

## 11. Test Requirements

Every task must ship with tests. Minimum coverage:

| Category | Requirement |
|----------|-------------|
| Account isolation | One test per table that proves Account A cannot read Account B's data |
| Modification enforcement | Test that unmodified draft export returns 400 |
| Compliance filter | Tests for regex layer, numeric claim layer, disclosure check |
| API route auth | Test that unauthenticated requests return 401 |
| Business logic | Happy path + at least 2 edge cases per function |

Test files live in `tests/`. Use **vitest**. Do not use Jest.

---

## 12. What to Do When You Are Unsure

1. **Ambiguous spec** → Implement the conservative interpretation, leave a `TODO(DECISION):`
2. **Two documents conflict** → Follow `herbalife-internal-team-tool-master-archive.md` as
   primary source. Flag the conflict in your post-task report.
3. **Missing upstream dependency** → Do not simulate or mock the DB schema. Stop and report
   which upstream task must be completed first.
4. **Compliance edge case** → Do not make a judgment call. Leave a `TODO(COMPLIANCE):` and
   mark the feature as gated pending human review.

---

## 13. Document Conflict Resolution: RLS vs Application-level Filtering

The two source documents disagree on tenant isolation strategy:

- **Master Archive** (primary): Full Postgres RLS on all business tables
- **Voice Capture Playbook**: Application-level filtering via `scopedDb()` (simplified)

**Resolution (effective immediately):**
- **MVP (Phase 0–8):** Use `scopedDb()` application-level filtering. This is faster to build and
  sufficient for 50 users where you control all code paths.
- **Pre-productize (Month 6 decision point):** Add Postgres RLS as a defense-in-depth layer on
  top of the application-level filtering.
- **Always:** Ship the `account-isolation.test.ts` that proves cross-account data leakage is
  impossible, regardless of which strategy is active.

This decision is locked. Do not implement RLS in the MVP phase unless explicitly instructed.

---

*Last updated: 2026-05-20 · Based on v4.1.3 Master Architecture Archive*
