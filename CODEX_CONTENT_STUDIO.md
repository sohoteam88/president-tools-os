# Codex Task Brief — Content Studio
# President Tools OS — Phase 3 (Week 4)
#
# HOW TO RUN:
#   codex --model o3 --approval-mode auto-edit "$(cat CODEX_CONTENT_STUDIO.md)"
#
# PREREQUISITE: Voice Capture System (Phase 2) must be complete.
# The Content Studio cannot function without voice_captures + voice_profiles tables.
# IMPORTANT: Read every section before writing any code.

---

## 1. Mission

Build **Content Studio** — the AI content generation module for President Tools OS.
Distributors select a platform and content type, optionally describe a topic, then
click Generate. The system builds a draft using their authentic voice (pulled from
Voice Capture). They must meaningfully edit the draft before exporting it.

Three non-negotiables that govern every decision in this module:
1. **Compliance-first** — all content passes a 4-layer filter before export
2. **AI = amplifier, not author** — the Modification Rule blocks unedited exports
3. **Manual-first** — no auto-posting, no social API integration, export = text copy only

---

## 2. Project Context

### Stack (already installed — do not add packages unless listed in Section 11)
- Next.js 14 App Router, TypeScript strict (`noUncheckedIndexedAccess: true`)
- Supabase Auth + PostgreSQL, Drizzle ORM, Zod validation
- Anthropic Claude Sonnet → content generation (9-layer prompt)
- Anthropic Claude Haiku → compliance judge (Layer 3 of filter)
- `@aws-sdk/client-s3` → already installed (R2, not needed here but present)

### Foundation already built — do not re-implement
```
lib/db/scoped.ts              scopedDb(accountId) + adminDb
lib/auth/session.ts           getAccountFromSession(), requireAdmin()
lib/supabase/server.ts        createClient()
lib/db/schema/voice.ts        voiceCaptures, voiceProfiles tables + types
lib/validators/voice.ts       voiceProfileJsonSchema, VoiceProfileJson type
```

### Exact types you will import from voice schema
```typescript
import type { VoiceCapture, VoiceProfile } from "@/lib/db/schema/voice";
import type { VoiceProfileJson } from "@/lib/validators/voice";
import { voiceProfileJsonSchema } from "@/lib/validators/voice";
```

### `scopedDb(accountId).voice` namespace — methods you can call
```typescript
userDb.voice.getWhyStory()              // → VoiceCapture | undefined
userDb.voice.getLatestProfile()         // → VoiceProfile | undefined
userDb.voice.listAcceptedTranscripts(30) // → VoiceCapture[] (why_story + daily_journey)
```

### Anthropic SDK usage pattern
```typescript
import Anthropic from "@anthropic-ai/sdk";
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Sonnet for generation
const msg = await anthropic.messages.create({
  model: "claude-sonnet-4-5",
  max_tokens: 1024,
  messages: [{ role: "user", content: prompt }],
});
const text = msg.content[0]?.type === "text" ? msg.content[0].text : "";

// Haiku for compliance judge
const msg = await anthropic.messages.create({
  model: "claude-haiku-4-5-20251001",
  max_tokens: 256,
  messages: [{ role: "user", content: compliancePrompt }],
});
```

---

## 3. Platforms & Content Types

### Supported Platforms
```typescript
export const PLATFORMS = [
  "facebook",
  "instagram",
  "whatsapp",
  "tiktok_script",
  "invitation",
] as const;
export type Platform = typeof PLATFORMS[number];
```

### Content Types per Platform
```typescript
export const CONTENT_TYPES: Record<Platform, string[]> = {
  facebook:     ["lifestyle_story", "product_experience", "team_culture", "results_journey"],
  instagram:    ["caption_lifestyle", "caption_product", "caption_results", "caption_invitation"],
  whatsapp:     ["personal_message", "group_announcement", "follow_up"],
  tiktok_script:["day_in_life", "transformation_story", "product_demo_script", "why_i_joined"],
  invitation:   ["event_invite", "zoom_call_invite", "coffee_chat_invite"],
};
```

### Platform Norms (inject into Layer 2)
```typescript
export const PLATFORM_NORMS: Record<Platform, string> = {
  facebook: "Long-form is fine (200–500 words). Conversational paragraphs. No excessive hashtags (max 3). Personal stories perform well. Emojis: optional, use sparingly.",
  instagram: "Short caption (50–150 words). End with a soft call-to-action. 5–10 relevant hashtags on a new line after the caption. Emojis: natural, 2–5 max.",
  whatsapp: "Conversational tone, like texting a friend. Under 100 words. No hashtags. Warm, direct, personal. Don't sound like an ad.",
  tiktok_script: "Spoken word script, not a post. Format: [HOOK 0-3s] / [BODY 3-45s] / [CTA 45-60s]. Natural speech rhythm. Short sentences. Include suggested B-roll notes in brackets.",
  invitation: "Direct and warm. State what, when (leave date/time blank — user fills in), why they'd enjoy it. One clear action: 'Let me know if you're keen.' Under 80 words.",
};
```

---

## 4. The 9-Layer Prompt System

This is the core of Content Studio. Every generation request builds a single prompt
by concatenating all 9 layers in order. Do NOT skip or reorder layers.

Build this in `lib/content/prompt-builder.ts`:

```typescript
export interface PromptContext {
  platform: Platform;
  contentType: string;
  userTopic: string;          // Free-text input, max 200 chars. Can be empty.
  voiceProfile: VoiceProfileJson | null;
  whyStoryTranscript: string | null;
  recentJourneyTranscripts: string[];   // Last 5 accepted daily_journeys, newest first
  accountName: string;
  distributorSeniority: string;
}

export function buildContentPrompt(ctx: PromptContext): string { ... }
```

### Layer 1 — System Role
```
You are a content writing assistant for a Herbalife Malaysia distributor practicing
attraction marketing. Your job is to help them write authentic, personal content
that shares their genuine journey — not to sell products or make claims.

The distributor's name is: {accountName}
Their experience level: {distributorSeniority}
```

### Layer 2 — Platform Context
```
Platform: {platform}
Platform norms: {PLATFORM_NORMS[platform]}

Content type requested: {contentType}
```

### Layer 3 — Compliance Guardrails (non-negotiable)
```
MANDATORY COMPLIANCE RULES — violating any of these makes the content unusable:

NEVER include:
- Specific income amounts (e.g. "I earned RM3,000", "make $500 a day")
- Income opportunity claims ("you can earn", "financial freedom", "passive income")
- Specific weight or measurement claims ("lost 10kg", "dropped 2 dress sizes")
- Medical or health claims ("cured", "treats", "heals", "fixes", "prevents disease")
- Comparison claims ("better than", "unlike other MLM companies")
- Guaranteed results of any kind
- Prices or promotional offers

ALWAYS ensure:
- Content is clearly personal experience, not a general claim
- Any mention of product results is framed as personal experience only
- No pressure language ("limited time", "don't miss out", "last chance")
- Tone is sharing, not selling
```

### Layer 4 — Attraction Marketing Philosophy
```
Attraction marketing principle: Share your life, don't pitch your business.
People should be curious about what you do — not pressured to join or buy.

Write as if talking to a friend who hasn't asked about the business.
Show the lifestyle, the community, the personal growth — not the product features.
The goal is for readers to think "I want what they have" — not "they're trying to sell me something."
```

### Layer 5 — Tone & Style Guardrails
```
Writing style rules:
- Write in first person ("I", "we", "my team")
- Use conversational Malaysian English — natural code-switching is fine if the profile shows it
- Avoid corporate or MLM-sounding language ("synergy", "upline", "downline", "volume", "PV/BV")
- Avoid generic positivity clichés ("hustle", "grind", "blessed and grateful")
- Keep sentences short and punchy for mobile reading
- One idea per paragraph
- End with authentic curiosity, not a sales CTA
```

### Layer 6 — Personal Context
```
About this distributor:
- Seniority: {distributorSeniority}
- Topic they want to write about today: "{userTopic}"
{userTopic is empty ? "No specific topic — draw from their recent journey entries." : ""}
```

### Layer 7 — Voice Profile (inject if available)
```
{voiceProfile is null ?
  "No Voice Profile built yet — write in a warm, conversational Malaysian style." :
  `
This person's authentic communication style (extracted from their voice recordings):
- Vocabulary level: {voiceProfile.vocabulary_level}
- Sentence rhythm: {voiceProfile.sentence_rhythm}
- Emotional tone: {voiceProfile.emotional_tone}
- Storytelling style: {voiceProfile.storytelling_style}
- Phrases they commonly use: {voiceProfile.common_phrases.join(", ")}
- Topics they return to: {voiceProfile.topics_they_return_to.join(", ")}
- Energy level: {voiceProfile.energy_level}
- Languages they mix: {voiceProfile.languages_mixed.join(" + ")}

Mirror this style closely. The output should sound like THEM, not like a generic AI post.
  `
}
```

### Layer 8 — Story Bank (Why Story)
```
{whyStoryTranscript is null ?
  "No Why Story recorded yet — skip story references." :
  `
Their origin story (from their own voice recording — treat this as their truth):
---
{whyStoryTranscript}
---
Draw from this story if relevant to the content type. Quote their own words where natural.
  `
}
```

### Layer 9 — Journey Bank (Recent Daily Journeys)
```
{recentJourneyTranscripts.length === 0 ?
  "No recent journey entries — write from general context." :
  `
Their recent experiences (from their daily voice journals, newest first):
${recentJourneyTranscripts.map((t, i) => `[Entry ${i + 1}]: ${t}`).join("\n\n")}
---
Use specific moments, conversations, or feelings from these entries when they fit
the content type. Real specifics make content authentic.
  `
}
```

### Final Instruction (append after all 9 layers)
```
Now write the {contentType} for {platform}.

Requirements:
- Output ONLY the final post content — no preamble, no "here's your post:", no explanation
- Do not add a disclaimer or note about compliance — the system handles that separately
- {platform === "tiktok_script" ? "Format as a spoken script with [HOOK], [BODY], [CTA] sections" : ""}
- {platform === "instagram" ? "Include hashtags on a new line after the caption" : ""}
- Length appropriate for {platform}: {PLATFORM_NORMS[platform]}
```

---

## 5. Compliance Filter — 4+1 Layers

Build in `lib/compliance/filter.ts`. This runs as a pipeline — all layers execute
in order. Each layer can short-circuit (return `flagged`) immediately.

```typescript
export interface ComplianceResult {
  passed: boolean;
  flags: ComplianceFlag[];
}

export interface ComplianceFlag {
  layer: 1 | 2 | 3 | 4;
  code: string;       // e.g. "INCOME_CLAIM", "NUMERIC_HEALTH_CLAIM"
  excerpt: string;    // The offending text snippet (max 100 chars)
  message: string;    // Human-readable explanation shown to user
}

export async function runComplianceFilter(
  text: string,
  accountId: string,
  draftId: string
): Promise<ComplianceResult>
```

### Layer 1 — Regex Keyword Blacklist
File: `lib/compliance/keywords.csv`

Format: `category,pattern,message`

Build the CSV with these entries (plain text, no regex flags — lowercase match):
```
INCOME_CLAIM,"earn[a-z\s]*rm","Contains an income earnings claim"
INCOME_CLAIM,"made rm","Contains an income earnings claim"
INCOME_CLAIM,"passive income","Contains passive income language"
INCOME_CLAIM,"financial freedom","Contains financial freedom language"
INCOME_CLAIM,"quit your job","Contains income opportunity language"
INCOME_CLAIM,"full.time income","Contains income opportunity language"
INCOME_CLAIM,"extra income","Contains income opportunity language"
HEALTH_CLAIM,"cured","Contains a medical cure claim"
HEALTH_CLAIM,"treats diabetes","Contains a disease treatment claim"
HEALTH_CLAIM,"lowers blood pressure","Contains an unapproved health claim"
HEALTH_CLAIM,"prevents cancer","Contains a disease prevention claim"
HEALTH_CLAIM,"heals","Contains a healing claim"
WEIGHT_CLAIM,"lost \d+\s*kg","Contains a specific weight loss claim"
WEIGHT_CLAIM,"dropped \d+\s*kg","Contains a specific weight loss claim"
WEIGHT_CLAIM,"lost \d+\s*pound","Contains a specific weight loss claim"
OPPORTUNITY_CLAIM,"join my team","Contains direct recruitment language"
OPPORTUNITY_CLAIM,"be your own boss","Contains income opportunity language"
OPPORTUNITY_CLAIM,"work from home and earn","Contains income opportunity language"
```

Load this CSV at startup (not on every request). Cache it as a module-level constant.
Parse each `pattern` as a `new RegExp(pattern, "i")`.

Layer 1 is SYNCHRONOUS — no API calls. Return immediately if any keyword matches.

### Layer 2 — Numeric Claim Detector
Pure regex, synchronous. Flag if the text contains:
```
/RM\s*[\d,]+/i          → "Contains a specific monetary amount"
/USD?\s*[\d,]+/i        → "Contains a specific monetary amount"
/\d+\s*kg/i             → "Contains a specific weight claim"
/\d+\s*(lbs?|pounds?)/i → "Contains a specific weight claim"
/\d+\s*%/i              → "Contains a specific percentage claim" (unless in context like "100% of the time")
/\d+\s*(days?|weeks?|months?) results/i → "Contains a specific results timeline"
```

Exception: Skip numeric flags if the number appears inside a URL or hashtag.

### Layer 3 — Claude Haiku LLM Judge
Async. Only runs if Layers 1 and 2 both passed (saves API cost).

Prompt:
```
You are a compliance reviewer for Herbalife Malaysia distributor content.
Herbalife's rules prohibit: income claims, specific weight/health claims,
disease treatment claims, income opportunity recruitment language, and
guaranteed results of any kind.

Review the following distributor content:
---
{text}
---

Does this content contain ANY compliance violation?
Reply with EXACTLY this format:
VERDICT: PASS or FAIL
REASON: [one sentence, or "None" if PASS]
```

Parse response: if first line contains "FAIL" → flag with code `"LLM_COMPLIANCE_FAIL"`,
message = the REASON line content.

Timeout: 8 seconds. If Haiku times out, skip Layer 3 (log warning, do not block).

### Layer 4 — Disclosure Presence Check
Synchronous. If the content mentions any of these trigger words:
`product`, `nutrition`, `shake`, `supplement`, `results`, `lost`, `gained`, `energy`

Then check that the content includes a disclosure sentence.
The required disclosure is configurable via env var:
```
COMPLIANCE_DISCLOSURE_TEXT=
"Results may vary. Products are not intended to diagnose, treat, cure, or prevent any disease."
```

If trigger words found AND disclosure absent → flag:
- code: `"MISSING_DISCLOSURE"`
- message: "Content mentions results or products but is missing the required disclaimer. Add: [COMPLIANCE_DISCLOSURE_TEXT]"

### +1 — Modification Rule (not a compliance flag — separate check)
Build in `lib/compliance/modification.ts`:

```typescript
export function computeSimilarity(textA: string, textB: string): number
export function isModifiedEnough(originalDraft: string, userDraft: string): boolean
```

**Algorithm — Jaccard similarity on word token sets:**
```typescript
function tokenize(text: string): Set<string> {
  return new Set(
    text.toLowerCase()
      .replace(/[^a-z0-9\s]/g, "")   // strip punctuation
      .split(/\s+/)
      .filter(w => w.length > 2)      // ignore short words (a, is, to...)
  );
}

function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  const intersection = [...a].filter(w => b.has(w)).length;
  const union = new Set([...a, ...b]).size;
  return union === 0 ? 0 : intersection / union;
}
```

`isModifiedEnough` returns `true` if similarity ≤ 0.80 (20% of tokens changed).
Export is blocked if `isModifiedEnough` returns `false`.

Threshold constant: `export const MODIFICATION_THRESHOLD = 0.80`

---

## 6. Database Schema

### 6a. Create `lib/db/schema/content.ts`

**`content_drafts`**
| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | gen_random_uuid() |
| account_id | UUID NOT NULL | FK → accounts.id ON DELETE CASCADE |
| platform | TEXT NOT NULL | one of PLATFORMS values |
| content_type | TEXT NOT NULL | e.g. "lifestyle_story" |
| user_topic | TEXT | optional user-provided topic hint |
| generated_draft | TEXT NOT NULL | raw AI output |
| user_draft | TEXT | null until user starts editing |
| compliance_status | TEXT NOT NULL DEFAULT 'pending' | 'pending'\|'checking'\|'passed'\|'flagged' |
| compliance_flags | TEXT | JSON array of ComplianceFlag[], null if passed |
| modification_score | REAL | Jaccard similarity 0.0–1.0, null until checked |
| voice_profile_version | INTEGER | which VoiceProfile version was used |
| exported_at | TIMESTAMPTZ | null until exported |
| created_at | TIMESTAMPTZ NOT NULL DEFAULT now() |
| updated_at | TIMESTAMPTZ NOT NULL DEFAULT now() |

Indexes: `(account_id)`, `(account_id, created_at DESC)`, `(account_id, compliance_status)`

**`content_compliance_logs`** — append-only audit trail
| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| account_id | UUID NOT NULL | |
| draft_id | UUID NOT NULL | FK → content_drafts.id ON DELETE CASCADE |
| layer | INTEGER NOT NULL | 1, 2, 3, or 4 |
| result | TEXT NOT NULL | 'passed'\|'flagged' |
| flag_codes | TEXT | JSON array of code strings, null if passed |
| details | TEXT | Human-readable summary |
| checked_at | TIMESTAMPTZ NOT NULL DEFAULT now() |

Indexes: `(draft_id)`, `(account_id, checked_at DESC)`

### 6b. Export from `lib/db/schema/index.ts`
Add: `export * from "./content";`

### 6c. Migration `drizzle/0003_content_studio.sql`
SQL migration:
- Both tables with all indexes
- RLS enabled on both tables
- `content_drafts` RLS: SELECT/INSERT/UPDATE by own account or admin
- `content_compliance_logs` RLS: SELECT by own account or admin; INSERT from application (own account + admin); NO DELETE policy (append-only)
- Updated-at trigger on `content_drafts`

---

## 7. Extend `scopedDb` in `lib/db/scoped.ts`

Add a `content` namespace to the scopedDb() return object.
Import new schema: `import { contentDrafts, contentComplianceLogs } from "@/lib/db/schema/content"`
Import types: `import type { ContentDraft, NewContentDraft, ContentComplianceLog } from "@/lib/db/schema/content"`

```typescript
content: {
  createDraft: async (data: Omit<NewContentDraft, "accountId"|"id"|"createdAt"|"updatedAt">)
    => Promise<ContentDraft | undefined>

  getDraft: async (id: string) => Promise<ContentDraft | undefined>
    // WHERE id = ? AND account_id = accountId

  updateDraft: async (id: string, data: Partial<NewContentDraft>)
    => Promise<ContentDraft | undefined>
    // WHERE id = ? AND account_id = accountId

  listDrafts: async (limit?: number) => Promise<ContentDraft[]>
    // ORDER BY created_at DESC, LIMIT limit (default 20)

  logCompliance: async (entry: Omit<NewContentComplianceLog, "id"|"checkedAt"|"accountId">)
    => Promise<void>
    // INSERT — never UPDATE or DELETE
}
```

---

## 8. API Routes

### POST `/api/content/generate`
**Auth:** `getAccountFromSession()`

Request body (Zod):
```typescript
z.object({
  platform: z.enum(["facebook","instagram","whatsapp","tiktok_script","invitation"]),
  contentType: z.string().min(1).max(100),
  userTopic: z.string().max(200).optional(),
})
```

Logic:
1. Load voice data in parallel:
   ```typescript
   const [latestProfile, whyStory, recentJourneys] = await Promise.all([
     userDb.voice.getLatestProfile(),
     userDb.voice.getWhyStory(),
     userDb.voice.listAcceptedTranscripts(5),  // last 5
   ]);
   ```
2. Parse Voice Profile JSON from `latestProfile.profileJson` using `voiceProfileJsonSchema.safeParse()`.
   If parse fails → log warning, set `voiceProfile = null` (don't crash).
3. Build prompt using `buildContentPrompt()` from `lib/content/prompt-builder.ts`
4. Call Claude Sonnet → get `generatedDraft`
5. Create draft record: `userDb.content.createDraft({ platform, contentType, userTopic, generatedDraft, voiceProfileVersion: latestProfile?.version ?? null, complianceStatus: "pending" })`
6. Return: `{ draftId, generatedDraft }`

Error handling: if Claude API call fails → return 503 with `{ error: "Generation failed. Please try again." }`

### POST `/api/content/check`
**Auth:** `getAccountFromSession()`

Request body:
```typescript
z.object({
  draftId: z.string().uuid(),
  userDraft: z.string().min(1).max(10000),
})
```

Logic:
1. Load draft, verify it belongs to this account
2. Update `user_draft` field with submitted text
3. Compute modification score: `jaccardSimilarity(tokenize(generated_draft), tokenize(user_draft))`
4. Update `modification_score` on draft
5. Run compliance filter: `runComplianceFilter(userDraft, accountId, draftId)`
6. For each layer checked, insert into `content_compliance_logs`
7. Update draft: `complianceStatus = result.passed ? "passed" : "flagged"`, `complianceFlags = JSON.stringify(result.flags)`
8. Return:
   ```typescript
   {
     complianceStatus: "passed" | "flagged",
     flags: ComplianceFlag[],
     modificationScore: number,           // 0.0–1.0 (lower = more modified)
     modifiedEnough: boolean,             // score <= 0.80
     canExport: result.passed && score <= 0.80,
   }
   ```

### POST `/api/content/export`
**Auth:** `getAccountFromSession()`

Request body: `{ draftId: z.string().uuid() }`

Logic:
1. Load draft, verify ownership
2. Guard: if `compliance_status !== "passed"` → return 403 `{ error: "Content must pass compliance check before export." }`
3. Guard: if `modification_score === null || modification_score > 0.80` → return 403 `{ error: "Please modify the AI draft more before exporting. Add your personal touch." }`
4. Update `exported_at = now()`
5. Audit log: `userDb.audit.log({ action: "content.exported", resourceType: "content_draft", resourceId: draftId })`
6. Return: `{ content: draft.user_draft, exportedAt: new Date() }`
   (Client copies to clipboard — no server-side posting)

### GET `/api/content/drafts`
**Auth:** `getAccountFromSession()`

Query params: `limit?: number` (default 20, max 50)

Returns: `{ drafts: ContentDraft[] }` — user_draft and generated_draft included

### GET `/api/content/drafts/[draftId]`
**Auth:** `getAccountFromSession()`

Returns single draft or 404.

---

## 9. UI Components

### Page: `app/(app)/content/page.tsx`
Server Component. Loads account + voice profile status.
If `voiceCaptureCompletedAt` is null → show locked state prompting user to do Voice Capture first.
Otherwise render `<ContentStudioClient />`.

```tsx
// Locked state (Voice Capture not done yet)
<div className="rounded-lg border-2 border-dashed ...">
  <span>🔒</span>
  <p>Complete Voice Capture first to unlock Content Studio.</p>
  <Link href="/voice">Go to Voice Capture →</Link>
</div>
```

### Component: `app/(app)/content/_components/content-studio-client.tsx`
Client Component. The full studio UI.

**State machine:**
```
idle → generating → generated → checking → checked(passed|flagged) → exported
```

**Layout:**
```
┌──────────────────────────────────────────────────────────┐
│ Content Studio                                           │
├──────────────────┬───────────────────────────────────────┤
│ LEFT PANEL       │ RIGHT PANEL                           │
│                  │                                       │
│ Platform         │ [Generated Draft — readonly]          │
│ ● Facebook       │ ┌─────────────────────────────────┐  │
│ ○ Instagram      │ │ [AI draft text, monospace-ish]  │  │
│ ○ WhatsApp       │ └─────────────────────────────────┘  │
│ ○ TikTok Script  │                                       │
│ ○ Invitation     │ Your Edit ↓                          │
│                  │ ┌─────────────────────────────────┐  │
│ Content Type     │ │ [Editable textarea]              │  │
│ [Dropdown]       │ └─────────────────────────────────┘  │
│                  │                                       │
│ Topic (optional) │ Modification: ██████░░ 72% changed   │
│ [Textarea 200c]  │ Compliance: ● Passed / ✗ 2 issues    │
│                  │                                       │
│ [Generate Draft] │ [Check Compliance]  [Export / Copy]  │
└──────────────────┴───────────────────────────────────────┘
```

**Modification meter:** Visual progress bar.
- `modificationPct = Math.round((1 - modificationScore) * 100)`
- 0–50%: red bar, label "Not enough changes"
- 51–79%: amber bar, label "Getting there"
- 80–100%: green bar, label "Good — ready to check compliance"

**Export button states:**
- Disabled (grey): compliance not checked, or failed, or not modified enough
- Enabled (green): `complianceStatus === "passed" && modifiedEnough`
- After click: shows "Copied to clipboard ✓" for 3 seconds

**Compliance flags display:**
If `flags.length > 0`, show each flag as a red chip with icon + message.
Group by layer: "Layer 1 (Keywords)", "Layer 2 (Numbers)", "Layer 3 (AI Review)", "Layer 4 (Disclosure)".

### Component: `app/(app)/content/_components/platform-selector.tsx`
Horizontal pill selector. Shows platform icon (emoji) + label.
Icons: 📘 Facebook, 📸 Instagram, 💬 WhatsApp, 🎬 TikTok Script, 🤝 Invitation

### Component: `app/(app)/content/_components/content-type-selector.tsx`
Dropdown (`<select>`). Options change when platform changes.
Label mapping:
```typescript
const CONTENT_TYPE_LABELS: Record<string, string> = {
  lifestyle_story:      "Lifestyle Story",
  product_experience:   "Product Experience",
  team_culture:         "Team & Community",
  results_journey:      "My Journey (Results)",
  caption_lifestyle:    "Lifestyle Caption",
  caption_product:      "Product Caption",
  caption_results:      "Results Caption",
  caption_invitation:   "Invitation Caption",
  personal_message:     "Personal Message",
  group_announcement:   "Group Announcement",
  follow_up:            "Follow-up Message",
  day_in_life:          "Day in My Life",
  transformation_story: "Transformation Story",
  product_demo_script:  "Product Demo Script",
  why_i_joined:         "Why I Joined",
  event_invite:         "Event Invitation",
  zoom_call_invite:     "Zoom Call Invite",
  coffee_chat_invite:   "Coffee Chat Invite",
};
```

### Component: `app/(app)/content/_components/compliance-flag-list.tsx`
Shows compliance flags as a list of alert boxes.
Each flag: red border left, code badge, excerpt (monospace, truncated), message.

### Component: `app/(app)/content/_components/draft-list.tsx`
Shows last 10 drafts. Each row: platform icon, content type, compliance status badge,
modification score pill, date, "Load Draft" button (loads into studio state).

---

## 10. Compliance Keywords CSV

Create `lib/compliance/keywords.csv` with the entries from Section 5, Layer 1.
Write a loader in `lib/compliance/keyword-loader.ts`:

```typescript
import fs from "fs";
import path from "path";

interface KeywordEntry {
  category: string;
  pattern: RegExp;
  message: string;
}

let _cache: KeywordEntry[] | null = null;

export function loadKeywords(): KeywordEntry[] {
  if (_cache) return _cache;
  const csv = fs.readFileSync(
    path.join(process.cwd(), "lib/compliance/keywords.csv"),
    "utf-8"
  );
  _cache = csv
    .split("\n")
    .slice(1)               // skip header
    .filter(Boolean)
    .map(line => {
      const [category, rawPattern, message] = line.split(",");
      return {
        category: category?.trim() ?? "",
        pattern: new RegExp(rawPattern?.replace(/^"|"$/g, "").trim(), "i"),
        message: message?.replace(/^"|"$/g, "").trim() ?? "",
      };
    });
  return _cache;
}
```

---

## 11. Additional Packages to Install

```bash
npm install @anthropic-ai/sdk
```

If already installed (check package.json first), skip. Do not install any other packages
without checking if they already exist in package.json.

---

## 12. Rules & Constraints — READ BEFORE CODING

### R1: Account Isolation (absolute)
```typescript
// ❌ FORBIDDEN
const drafts = await db.select().from(contentDrafts)

// ✅ REQUIRED
const drafts = await scopedDb(accountId).content.listDrafts()
```

### R2: Export is server-enforced
The export guard (compliance passed + modified enough) MUST be in the API route,
not just in the UI. A user who disables JavaScript should still be blocked.
The UI disabling the button is UX — the API is the gate.

### R3: Compliance logs are append-only
`content_compliance_logs` has no UPDATE or DELETE route.
The `logCompliance` scoped helper only INSERT-s.
No RLS DELETE policy → database enforces this too.

### R4: Voice Profile parse failures are soft
If `voiceProfileJsonSchema.safeParse(profileJson)` fails → log to console, set
`voiceProfile = null`, continue generation with Layer 7 as "No profile available".
Never throw. Never block the user from generating content.

### R5: Haiku timeout is silent
Layer 3 has an 8-second timeout. If it times out → log `[compliance:layer3] timeout`
to console, skip Layer 3, mark it as "skipped" in the log (result = "skipped"),
continue to Layer 4. Never surface timeout errors to the user.

### R6: No auto-posting
The export endpoint returns `{ content: string }`.
There is NO social media API integration.
The client copies the content to clipboard using `navigator.clipboard.writeText()`.
Do not add any fetch to Facebook/Instagram/TikTok/WhatsApp APIs.

### R7: TypeScript strict
- No `any` types — use `unknown` with narrowing or Zod parse
- `noUncheckedIndexedAccess` is ON — always use `?.[0]` for array access
- All new Zod schemas go in `lib/validators/content.ts`

### R8: Compliance keywords are externally maintained
The CSV file `lib/compliance/keywords.csv` is the single source of truth for
regex blacklist keywords. Never hardcode keyword patterns inside filter.ts itself.
Steven can update the CSV without touching TypeScript code.

---

## 13. Tests Required

Create `tests/content-studio.test.ts`:

1. **Prompt builder — Layer 7 absent**: `voiceProfile = null` → Layer 7 contains "No Voice Profile"
2. **Prompt builder — all 9 layers present**: All layer markers appear in output string
3. **Compliance Layer 1 — income claim caught**: "I earned RM3000 last month" → INCOME_CLAIM flag
4. **Compliance Layer 1 — clean text passes**: Standard lifestyle post → no flags
5. **Compliance Layer 2 — numeric weight claim**: "lost 15kg" → NUMERIC flag
6. **Compliance Layer 4 — missing disclosure**: Text with "results" but no disclosure → MISSING_DISCLOSURE flag
7. **Compliance Layer 4 — no trigger words**: Text with no product mentions → passes Layer 4
8. **Modification Rule — identical text**: similarity = 1.0, `isModifiedEnough` = false
9. **Modification Rule — 50% changed**: similarity ≈ 0.5, `isModifiedEnough` = true
10. **Modification Rule — empty strings**: edge case — should return similarity 0, `isModifiedEnough` = true
11. **Jaccard similarity — known example**: tokenize("hello world foo") vs tokenize("hello world bar") → 0.5
12. **Export guard — not compliant**: API returns 403 if `complianceStatus !== "passed"`
13. **Export guard — not modified**: API returns 403 if `modification_score > 0.80`
14. **Account isolation — draft belongs to correct account**: getDraft with wrong accountId returns undefined

Target: all 14 tests + all previous 23 tests pass. Total: 37 tests.

---

## 14. File Checklist

```
lib/
  db/
    schema/
      content.ts                        ← NEW
      index.ts                          ← UPDATE (add content export)
    scoped.ts                           ← UPDATE (add content namespace)
  content/
    prompt-builder.ts                   ← NEW (9-layer prompt, PLATFORMS, CONTENT_TYPES, PLATFORM_NORMS)
  compliance/
    filter.ts                           ← NEW (runComplianceFilter, 4 layers)
    modification.ts                     ← NEW (computeSimilarity, isModifiedEnough, MODIFICATION_THRESHOLD)
    keywords.csv                        ← NEW (keyword blacklist)
    keyword-loader.ts                   ← NEW (CSV parser + cache)
  validators/
    content.ts                          ← NEW (Zod schemas for all content routes)

drizzle/
  0003_content_studio.sql               ← NEW

app/
  (app)/
    content/
      page.tsx                          ← NEW (server component, locked state)
      _components/
        content-studio-client.tsx       ← NEW (main client UI, state machine)
        platform-selector.tsx           ← NEW
        content-type-selector.tsx       ← NEW
        compliance-flag-list.tsx        ← NEW
        draft-list.tsx                  ← NEW
  api/
    content/
      generate/route.ts                 ← NEW
      check/route.ts                    ← NEW
      export/route.ts                   ← NEW
      drafts/route.ts                   ← NEW
      drafts/[draftId]/route.ts         ← NEW

tests/
  content-studio.test.ts                ← NEW
```

---

## 15. Definition of Done

- [ ] `npx tsc --noEmit` → 0 errors
- [ ] `npx vitest run` → 37 tests pass (23 existing + 14 new)
- [ ] `npx drizzle-kit generate` → generates 0003 migration without errors
- [ ] `npx next build` → build succeeds (no missing imports, no RSC boundary violations)
- [ ] `/content` page renders locked state when `voiceCaptureCompletedAt` is null
- [ ] `/content` page renders studio UI when Voice Capture is complete
- [ ] Export API returns 403 if compliance not passed (tested without UI)
- [ ] Export API returns 403 if modification score > 0.80 (tested without UI)
- [ ] `lib/compliance/keywords.csv` exists and is readable by the loader
- [ ] No direct `db.select().from(contentDrafts)` outside `scoped.ts`
- [ ] No social media API calls anywhere in the codebase
- [ ] `content_compliance_logs` has no DELETE route and no `delete` in scoped helper
- [ ] Claude Haiku timeout (8s) is caught and does NOT block the compliance result

---

## 16. Start Order (Recommended Sequence)

1. `lib/db/schema/content.ts` (schema first)
2. `lib/db/schema/index.ts` (add export)
3. `drizzle/0003_content_studio.sql`
4. `lib/validators/content.ts` (Zod schemas)
5. `lib/db/scoped.ts` (add content namespace)
6. `lib/compliance/keywords.csv` + `lib/compliance/keyword-loader.ts`
7. `lib/compliance/modification.ts` (pure functions, no deps)
8. `lib/compliance/filter.ts` (imports keyword-loader + Anthropic)
9. `lib/content/prompt-builder.ts` (pure function, no DB deps)
10. API routes: generate → check → export → drafts → drafts/[draftId]
11. UI components: platform-selector → content-type-selector → compliance-flag-list → draft-list → content-studio-client
12. `app/(app)/content/page.tsx`
13. Update `app/(app)/_components/app-sidebar.tsx` → set `available: true` for Content Studio
14. `tests/content-studio.test.ts`
15. Final: `tsc --noEmit` + `vitest run` + `next build`
