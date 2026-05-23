# Codex Task Brief — Objection Library
# President Tools OS — Phase 10 (Week 11)
#
# HOW TO RUN:
#   codex --model o3 --approval-mode auto-edit "$(cat CODEX_OBJECTION.md)"
#
# PREREQUISITES:
#   - Phase 1 (Foundation) complete
#   - Phase 3 (Content Studio) complete — Compliance Filter reused here
# IMPORTANT: Read every section before writing any code.

---

## 1. Mission

Build the **Objection Library** — a shared bank of compliant, ready-to-use
responses to the most common objections a Herbalife Malaysia distributor faces.

When a prospect says "It's too expensive" or "Is this a pyramid scheme?",
the distributor needs a calm, honest, pre-approved response — one that has
already been checked for compliance. This module gives them that.

**Structure:** 5 fixed objection categories × up to 5 responses each (admin-curated).
Distributors browse by category, preview responses, copy to clipboard,
save favourites, and optionally seed a Content Studio draft from a response.

**What it does:**
- Admin creates and manages the master response library (Haiku can draft options)
- All responses must pass Compliance Filter before publishing
- Distributors browse, search, copy, and favourite responses
- One-click "Turn into content" — seeds a Content Studio draft with the response as context
- Each distributor can also add their own private responses (personal library)

**What it does NOT do:**
- No automated sending — copy to clipboard only, distributor sends manually
- No WhatsApp API integration
- Responses are not editable by distributors (master library is admin-controlled)
- No AI that generates responses on the fly for distributors (Haiku is only for admin drafting)

---

## 2. The 5 Objection Categories

These are fixed. The distributor cannot add or rename categories.
Admin can add responses within each category.

```typescript
export const OBJECTION_CATEGORIES = [
  "price",          // "It's too expensive" / "I can't afford it"
  "skepticism",     // "Does it really work?" / "I've tried supplements before"
  "mlm_concern",   // "Is this a pyramid scheme?" / "Is this MLM?"
  "time",           // "I'm too busy" / "I don't have time for this"
  "loyalty",        // "I already use another brand" / "I'm happy with what I have"
] as const;
export type ObjectionCategory = typeof OBJECTION_CATEGORIES[number];

export const CATEGORY_LABELS: Record<ObjectionCategory, string> = {
  price:        "Price & Affordability",
  skepticism:   "Product Skepticism",
  mlm_concern:  "MLM & Business Concerns",
  time:         "Time & Commitment",
  loyalty:      "Already Using Another Brand",
};

export const CATEGORY_DESCRIPTIONS: Record<ObjectionCategory, string> = {
  price:       "When prospects say it's too expensive or out of budget",
  skepticism:  "When prospects doubt the product works or have had bad experiences",
  mlm_concern: "When prospects are wary about the business model",
  time:        "When prospects say they're too busy to join or try",
  loyalty:     "When prospects are happy with their current supplement or brand",
};
```

---

## 3. Database Schema

### 3a. Create `lib/db/schema/objections.ts`

**`objection_responses`** — Master library. Admin-managed, team-shared.
| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | gen_random_uuid() |
| category | TEXT NOT NULL | One of OBJECTION_CATEGORIES |
| title | TEXT NOT NULL | Short label. e.g. "Focus on value, not cost". Max 80 chars. |
| response_text | TEXT NOT NULL | The actual response copy. 50–500 chars. |
| tone | TEXT NOT NULL DEFAULT 'empathetic' | `'empathetic'` \| `'logical'` \| `'story'` — how the response is framed |
| compliance_status | TEXT NOT NULL DEFAULT 'pending' | `'pending'` \| `'passed'` \| `'flagged'` |
| compliance_flags | TEXT | JSON array of flag messages if `'flagged'`. Null if passed. |
| is_published | BOOLEAN NOT NULL DEFAULT false | Only published responses visible to distributors |
| sort_order | INTEGER NOT NULL DEFAULT 0 | Admin-controlled display order within category |
| created_by | UUID | FK → users.id — which admin created it |
| created_at | TIMESTAMPTZ NOT NULL DEFAULT now() |
| updated_at | TIMESTAMPTZ NOT NULL DEFAULT now() |

Indexes:
- `(category, is_published)` — browse by category
- `(compliance_status)` — admin review queue
- `(category, sort_order)` — ordered display

**`account_objection_favourites`** — Per-distributor saved favourites.
| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| account_id | UUID NOT NULL | FK → accounts.id ON DELETE CASCADE |
| objection_response_id | UUID NOT NULL | FK → objection_responses.id ON DELETE CASCADE |
| saved_at | TIMESTAMPTZ NOT NULL DEFAULT now() |

Unique: `(account_id, objection_response_id)` — can't favourite twice.
Index: `(account_id)`.

**`account_objection_responses`** — Per-distributor private responses (personal library).
| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| account_id | UUID NOT NULL | FK → accounts.id ON DELETE CASCADE |
| category | TEXT NOT NULL | One of OBJECTION_CATEGORIES |
| title | TEXT NOT NULL | Max 80 chars |
| response_text | TEXT NOT NULL | 50–500 chars |
| tone | TEXT NOT NULL DEFAULT 'empathetic' | |
| compliance_status | TEXT NOT NULL DEFAULT 'pending' | Same pattern as master |
| compliance_flags | TEXT | |
| created_at | TIMESTAMPTZ NOT NULL DEFAULT now() |
| updated_at | TIMESTAMPTZ NOT NULL DEFAULT now() |

Indexes: `(account_id, category)`, `(account_id, compliance_status)`.

### 3b. Update `lib/db/schema/index.ts`
Add: `export * from "./objections";`

### 3c. Migration `drizzle/0011_objections.sql`
- All three tables with columns and indexes
- RLS:
  - `objection_responses`:
    - SELECT: any authenticated user WHERE `is_published = true` OR admin (admin sees all)
    - INSERT/UPDATE/DELETE: admin only
  - `account_objection_favourites`:
    - SELECT/INSERT/DELETE: own account OR admin. No UPDATE.
  - `account_objection_responses`:
    - SELECT/INSERT/UPDATE/DELETE: own account OR admin
- Updated-at triggers on `objection_responses` and `account_objection_responses`

### 3d. Seed data — `drizzle/0011_objections_seed.sql`
Create a separate seed file with 15 starter responses (3 per category),
all pre-approved (`compliance_status = 'passed'`, `is_published = true`).
These give the system immediate value on day 1 without admin effort.

**Price category (3 responses):**
```sql
INSERT INTO public.objection_responses (category, title, response_text, tone, compliance_status, is_published, sort_order)
VALUES
(
  'price', 'Compare the daily cost', 
  'I understand — it feels like a big number upfront. When I worked it out, it comes to about RM X per day. I spend more than that on coffee. For me, the question was whether my health was worth less than a cup of coffee a day. That shift in perspective helped me decide.',
  'logical', 'passed', true, 1
),
(
  'price', 'Share your personal ROI',
  'I had the same concern. What I found is that since I started, I''ve actually spent less on other things — fewer takeaways because I''m not craving junk food, fewer visits to the pharmacy. I haven''t done the full maths, but it feels like it balances out for me personally.',
  'story', 'passed', true, 2
),
(
  'price', 'Acknowledge and invite curiosity',
  'That''s a fair point, and I don''t want to pressure you. What I''d suggest is just trying the smallest option to see how your body responds — no big commitment. If you don''t feel a difference after a month, that tells you something too.',
  'empathetic', 'passed', true, 3
);
```

Write similar seed rows for the remaining 4 categories (skepticism, mlm_concern, time, loyalty) — 3 responses each, total 15 rows. All must be:
- Honest and personal-experience framed ("for me", "I found", "in my experience")
- No income claims, no guaranteed results, no health cure claims
- Warm and non-pushy in tone

---

## 4. Extend `scopedDb` — Add to `lib/db/scoped.ts`

Add imports:
```typescript
import {
  accountObjectionFavourites,
  accountObjectionResponses,
} from "@/lib/db/schema/objections";
import type {
  AccountObjectionFavourite,
  AccountObjectionResponse,
  NewAccountObjectionResponse,
} from "@/lib/db/schema/objections";
```

Add `objections` namespace to `scopedDb()`:

```typescript
objections: {
  // ── Favourites ────────────────────────────────────────────────────────
  listFavouriteIds: async () => Promise<string[]>
    // SELECT objection_response_id WHERE account_id = accountId

  addFavourite: async (responseId: string) => Promise<void>
    // INSERT INTO account_objection_favourites
    // ON CONFLICT (account_id, objection_response_id) DO NOTHING

  removeFavourite: async (responseId: string) => Promise<void>
    // DELETE WHERE account_id = accountId AND objection_response_id = responseId

  // ── Personal responses ────────────────────────────────────────────────
  listPersonal: async (category?: ObjectionCategory) => Promise<AccountObjectionResponse[]>
    // WHERE account_id = accountId
    // AND (category = ? if provided)
    // ORDER BY created_at DESC

  createPersonal: async (data: Omit<NewAccountObjectionResponse, "accountId"|"id"|"createdAt"|"updatedAt">)
    => Promise<AccountObjectionResponse | undefined>

  updatePersonal: async (id: string, data: Partial<NewAccountObjectionResponse>)
    => Promise<AccountObjectionResponse | undefined>
    // WHERE id = ? AND account_id = accountId

  deletePersonal: async (id: string) => Promise<void>
    // WHERE id = ? AND account_id = accountId
}
```

Also add to `adminDb`:
```typescript
objections: {
  listAll: async (opts?: { category?: ObjectionCategory; status?: string })
    => Promise<ObjectionResponse[]>
    // Admin sees all including unpublished/flagged

  create: async (data: Omit<NewObjectionResponse, "id"|"createdAt"|"updatedAt">)
    => Promise<ObjectionResponse | undefined>

  update: async (id: string, data: Partial<ObjectionResponse>)
    => Promise<ObjectionResponse | undefined>

  delete: async (id: string) => Promise<void>

  publish: async (id: string) => Promise<void>
    // SET is_published = true WHERE id = ?
    // Guard: compliance_status must be 'passed'

  unpublish: async (id: string) => Promise<void>
    // SET is_published = false WHERE id = ?

  setComplianceResult: async (id: string, status: "passed" | "flagged", flags?: string[]) => Promise<void>
    // UPDATE compliance_status, compliance_flags WHERE id = ?
}
```

---

## 5. Public Objection Responses (Read-Only for Distributors)

The master library is read-only for distributors. No scopedDb wrapper needed —
use a simple public read function:

Create `lib/objections/library.ts`:

```typescript
/**
 * Read the published objection response library.
 * No auth context — any authenticated user can read published responses.
 * RLS enforces is_published = true for non-admin users.
 */
import { db } from "@/lib/db";
import { objectionResponses } from "@/lib/db/schema/objections";
import { and, eq, asc } from "drizzle-orm";
import type { ObjectionCategory } from "@/lib/objections/types";

export async function getPublishedResponses(category?: ObjectionCategory) {
  return db
    .select()
    .from(objectionResponses)
    .where(
      category
        ? and(eq(objectionResponses.isPublished, true), eq(objectionResponses.category, category))
        : eq(objectionResponses.isPublished, true)
    )
    .orderBy(asc(objectionResponses.category), asc(objectionResponses.sortOrder));
}
```

---

## 6. Compliance Check on Responses

Reuse the existing Compliance Filter for all response text before publishing.

Create `lib/objections/check.ts`:

```typescript
import { runComplianceFilter } from "@/lib/compliance/filter";

/**
 * Run compliance filter on an objection response.
 * Uses a dummy accountId and draftId since this is admin content.
 * Returns { passed: boolean, flags: string[] }.
 */
export async function checkResponseCompliance(
  responseText: string,
  title: string
): Promise<{ passed: boolean; flags: string[] }> {
  const combined = `${title}. ${responseText}`;
  // Use a sentinel accountId for admin-level compliance checks
  const result = await runComplianceFilter(combined, "admin", `objection-check-${Date.now()}`);
  return {
    passed: result.passed,
    flags: result.flags.map(f => f.message ?? f.rule ?? "Compliance issue"),
  };
}
```

---

## 7. AI Draft Generation (Admin Only)

Create `lib/objections/draft.ts`:

```typescript
/**
 * Uses Claude Haiku to draft 3 response options for a given objection category.
 * Admin reviews, edits, and then runs compliance check before publishing.
 * Never auto-publishes AI-generated responses.
 */
import Anthropic from "@anthropic-ai/sdk";
import { CATEGORY_LABELS } from "@/lib/objections/types";
import type { ObjectionCategory } from "@/lib/objections/types";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export type DraftedResponse = {
  title: string;
  responseText: string;
  tone: "empathetic" | "logical" | "story";
};

export async function draftObjectionResponses(
  category: ObjectionCategory,
  specificObjection?: string  // e.g. "They said 'I tried Amway before and it didn't work'"
): Promise<DraftedResponse[]> {
  const categoryLabel = CATEGORY_LABELS[category];
  const context = specificObjection
    ? `The specific objection was: "${specificObjection}"`
    : `The general objection category is: ${categoryLabel}`;

  const prompt = `You are helping a Herbalife Malaysia distributor draft 3 response options
for the following objection category: ${categoryLabel}.
${context}

Write 3 different responses — one empathetic, one logical, one story-based.
Each response must:
- Be written in first person ("I", "for me", "in my experience")
- Be honest and non-pushy
- Contain NO income claims or income opportunity language
- Contain NO specific weight loss numbers or before/after claims
- Contain NO guaranteed result language ("you will", "definitely", "guaranteed")
- Contain NO medical claims ("cures", "treats", "heals")
- Be 50–150 words
- Sound like something a real person would say in a WhatsApp message

Output ONLY valid JSON, no markdown:
[
  { "title": "<short label, max 60 chars>", "responseText": "<the response>", "tone": "empathetic" },
  { "title": "<short label, max 60 chars>", "responseText": "<the response>", "tone": "logical" },
  { "title": "<short label, max 60 chars>", "responseText": "<the response>", "tone": "story" }
]`;

  const msg = await client.messages.create({
    model: "claude-haiku-4-5",
    max_tokens: 800,
    messages: [{ role: "user", content: prompt }],
  });

  const raw = msg.content[0]?.type === "text" ? msg.content[0].text.trim() : "[]";
  try {
    const parsed = JSON.parse(raw) as unknown[];
    return parsed
      .filter((item): item is DraftedResponse =>
        typeof item === "object" && item !== null &&
        "title" in item && "responseText" in item && "tone" in item
      )
      .slice(0, 3);
  } catch {
    return [];
  }
}
```

---

## 8. Validators

Create `lib/validators/objections.ts`:

```typescript
import { z } from "zod";
import { OBJECTION_CATEGORIES } from "@/lib/objections/types";

export const TONES = ["empathetic", "logical", "story"] as const;
export type Tone = typeof TONES[number];

export const ResponseSchema = z.object({
  category: z.enum(OBJECTION_CATEGORIES),
  title: z.string().min(3, "Title too short").max(80, "Title too long"),
  responseText: z.string()
    .min(50, "Response must be at least 50 characters")
    .max(500, "Response must be under 500 characters"),
  tone: z.enum(TONES).default("empathetic"),
  sortOrder: z.number().int().nonnegative().optional(),
});

export const DraftRequestSchema = z.object({
  category: z.enum(OBJECTION_CATEGORIES),
  specificObjection: z.string().max(200).optional(),
});
```

Create `lib/objections/types.ts`:

```typescript
export const OBJECTION_CATEGORIES = [
  "price",
  "skepticism",
  "mlm_concern",
  "time",
  "loyalty",
] as const;
export type ObjectionCategory = typeof OBJECTION_CATEGORIES[number];

export const CATEGORY_LABELS: Record<ObjectionCategory, string> = {
  price:       "Price & Affordability",
  skepticism:  "Product Skepticism",
  mlm_concern: "MLM & Business Concerns",
  time:        "Time & Commitment",
  loyalty:     "Already Using Another Brand",
};

export const CATEGORY_DESCRIPTIONS: Record<ObjectionCategory, string> = {
  price:       "When prospects say it's too expensive or out of budget",
  skepticism:  "When prospects doubt the product works",
  mlm_concern: "When prospects are wary about the business model",
  time:        "When prospects say they're too busy",
  loyalty:     "When prospects are happy with their current brand",
};

export const TONE_LABELS: Record<string, string> = {
  empathetic: "Empathetic",
  logical:    "Logical",
  story:      "Story-based",
};
```

---

## 9. API Routes

### GET `/api/objections`
**Auth:** `getAccountFromSession()`
Query: `category?: ObjectionCategory`

Returns master published responses + distributor's personal responses + favourite IDs.

Response:
```typescript
{
  masterResponses: ObjectionResponse[];     // is_published = true only
  personalResponses: AccountObjectionResponse[];
  favouriteIds: string[];                   // IDs of favourited master responses
}
```

Logic:
1. `getPublishedResponses(category)` — master library
2. `userDb.objections.listPersonal(category)` — personal
3. `userDb.objections.listFavouriteIds()` — favourite set
4. Return combined

### POST `/api/objections/favourites`
**Auth:** `getAccountFromSession()`
Body: `{ responseId: z.string().uuid(), action: z.enum(["add", "remove"]) }`

Calls `addFavourite` or `removeFavourite`. Returns `{ ok: true }`.

### GET `/api/objections/personal`
**Auth:** `getAccountFromSession()`
Query: `category?: ObjectionCategory`
Returns: `{ responses: AccountObjectionResponse[] }`

### POST `/api/objections/personal`
**Auth:** `getAccountFromSession()`
Body: `ResponseSchema`

Logic:
1. Validate body
2. Run `checkResponseCompliance(responseText, title)`
3. `userDb.objections.createPersonal({ ...data, complianceStatus: result.passed ? "passed" : "flagged", complianceFlags: result.flags })`
4. If flagged: return 201 but include `{ compliance: { passed: false, flags } }` in response
   (distributor can save a flagged personal response for their own reference, but it stays private)
5. Return `{ response, compliance: result }`

### PUT `/api/objections/personal/[responseId]`
**Auth:** `getAccountFromSession()`
Body: `ResponseSchema.partial()`
Re-runs compliance on updated text. Returns updated response.

### DELETE `/api/objections/personal/[responseId]`
**Auth:** `getAccountFromSession()`
Returns `{ ok: true }`.

### POST `/api/objections/[responseId]/use-as-content`
**Auth:** `getAccountFromSession()`

Seeds a Content Studio draft from an objection response.
Works for both master responses and personal responses.

Body: `{ responseId: z.string().uuid(), responseType: z.enum(["master", "personal"]) }`

Logic:
1. Load the response (from objection_responses or account_objection_responses)
2. Build seed text:
   ```
   Objection handled: {category label}
   My response approach: {tone}
   ---
   {responseText}
   ```
3. Create a content draft with this as the seed (calls Content Studio's create endpoint internally,
   or directly inserts via `scopedDb(session.id).content.create(...)`)
4. Return `{ draftId: string }` — UI navigates to `/content?draftId={id}`

### Admin routes:

### GET `/api/admin/objections`
**Auth:** `requireAdmin()`
Query: `category?: string`, `status?: string`
Returns all responses (including unpublished and flagged).
Response: `{ responses: ObjectionResponse[], countByStatus: Record<string, number> }`

### POST `/api/admin/objections`
**Auth:** `requireAdmin()`
Body: `ResponseSchema`

Logic:
1. Validate
2. `checkResponseCompliance(responseText, title)`
3. `adminDb.objections.create({ ...data, complianceStatus, complianceFlags, isPublished: false })`
4. Return `{ response, compliance: result }`
   (Admin always reviews before publishing — never auto-publish)

### PUT `/api/admin/objections/[responseId]`
**Auth:** `requireAdmin()`
Body: `ResponseSchema.partial()`
Re-runs compliance if `responseText` or `title` changed. Returns updated response.

### DELETE `/api/admin/objections/[responseId]`
**Auth:** `requireAdmin()`
Returns `{ ok: true }`.

### POST `/api/admin/objections/[responseId]/publish`
**Auth:** `requireAdmin()`

Guard: `compliance_status` must be `"passed"` → return 422 if flagged or pending.
`adminDb.objections.publish(responseId)`. Return `{ ok: true }`.

### POST `/api/admin/objections/[responseId]/unpublish`
**Auth:** `requireAdmin()`
`adminDb.objections.unpublish(responseId)`. Return `{ ok: true }`.

### POST `/api/admin/objections/[responseId]/check-compliance`
**Auth:** `requireAdmin()`
Manually re-run compliance check on an existing response.
Logic: load response → `checkResponseCompliance()` → `adminDb.objections.setComplianceResult()`.
Return `{ compliance: { passed, flags } }`.

### POST `/api/admin/objections/draft`
**Auth:** `requireAdmin()`
Body: `DraftRequestSchema`
Calls `draftObjectionResponses()`. Returns `{ drafts: DraftedResponse[] }`.
Does NOT save anything — admin reviews drafts and creates them manually.

---

## 10. Authenticated UI

### Page: `app/(app)/objections/page.tsx`
**Client Component.** The main Objection Library page for distributors.

```
Objection Library

[All] [Price] [Skepticism] [MLM Concerns] [Time] [Loyalty]   [My Responses]

── Price & Affordability ────────────────────────────────────────────

┌────────────────────────────────────────────────────────────────────┐
│ ♡  Compare the daily cost                    Logical               │
│                                                                     │
│ "I understand — it feels like a big number upfront. When I worked  │
│  it out, it comes to about RM X per day. I spend more than that    │
│  on coffee. For me, the question was whether my health was worth    │
│  less than a cup of coffee a day..."                               │
│                                                                     │
│ [Copy]  [Save ♡]  [Use as Content →]                               │
└────────────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────────┐
│ ♥  Share your personal ROI                   Story-based           │
│                                                                     │
│ "I had the same concern. What I found is that since I started,     │
│  I've actually spent less on other things..."                      │
│                                                                     │
│ [Copy]  [Unsave ♥]  [Use as Content →]                             │
└────────────────────────────────────────────────────────────────────┘

── My Responses (private) ───────────────────────────────────────────
[+ Add My Own Response]

┌────────────────────────────────────────────────────────────────────┐
│ Price  ⚠ Flagged                             Empathetic            │
│ "My personal take on affordability..."                             │
│ ⚠ Contains flagged phrase. Review before using.                    │
│ [Edit]  [Delete]                                                   │
└────────────────────────────────────────────────────────────────────┘
```

**[Copy] button:**
1. `navigator.clipboard.writeText(response.responseText)`
2. Button text changes to "Copied!" for 2 seconds
3. No API call — purely client-side

**[Save ♡] / [Unsave ♥]:**
Calls `POST /api/objections/favourites`. Optimistic toggle.

**[Use as Content →]:**
Calls `POST /api/objections/[id]/use-as-content`.
On success: `router.push("/content?draftId=" + draftId)`

**Category filter tabs:**
"All" shows all categories with their responses grouped by category header.
Single category tabs show only that category's responses (no header needed).
"My Responses" tab shows only personal responses.

**Compliance badge on personal responses:**
- `passed` → no badge (clean)
- `flagged` → ⚠ orange badge + flag messages shown below the response text
- `pending` → grey "Checking…" badge (transient — should resolve quickly)

### Component: `app/(app)/objections/_components/response-card.tsx`
Props: `response: ObjectionResponse | AccountObjectionResponse`, `isFavourited: boolean`, `isPersonal: boolean`

### Component: `app/(app)/objections/_components/add-personal-modal.tsx`
Modal for creating a personal response:
- Category (dropdown)
- Title (text input)
- Response text (textarea, 50–500 chars, live char count)
- Tone (3 radio options with descriptions)
- Compliance runs automatically on save — result shown immediately

### Admin Page: `app/(admin)/admin/objections/page.tsx`
Admin library management:

```
Objection Library — Admin

[+ Draft with AI]  [+ Add Manually]  [Filter: All ▼]  [Status: All ▼]

── Review Queue (3 pending compliance) ──────────────────────────────

┌────────────────────────────────────────────────────────────────────┐
│ ⏳ PENDING   Price · Compare the daily cost              Logical   │
│ "I understand — it feels like a big number..."                     │
│ [Check Compliance]  [Edit]  [Delete]                               │
└────────────────────────────────────────────────────────────────────┘

── Published (12) ───────────────────────────────────────────────────

┌────────────────────────────────────────────────────────────────────┐
│ ✓ PUBLISHED  Price · Share your personal ROI           Story       │
│ "I had the same concern..."                                        │
│ [Unpublish]  [Edit]  [Delete]                                      │
└────────────────────────────────────────────────────────────────────┘

── Flagged (1) ──────────────────────────────────────────────────────

┌────────────────────────────────────────────────────────────────────┐
│ ⚠ FLAGGED   MLM Concerns · Business opportunity overview  Logical  │
│ "You can earn a significant income..."                             │
│ Flag: Income claim detected                                        │
│ [Edit & Recheck]  [Delete]                                         │
└────────────────────────────────────────────────────────────────────┘
```

**"Draft with AI" flow:**
1. Modal: pick category + optional specific objection text
2. `POST /api/admin/objections/draft` → 3 draft cards appear
3. Admin reviews each → [Save as Draft] → creates response with `is_published: false`
4. Admin reviews in queue → runs compliance → publishes

### Update sidebar: `app/(app)/_components/app-sidebar.tsx`
Add Objection Library nav item after Daily Coach:
```typescript
{ label: "Objections", href: "/objections", icon: "💬", available: true },
```

---

## 11. Rules & Constraints

### R1: Account Isolation for personal responses
`account_objection_responses` and `account_objection_favourites` MUST use `scopedDb(accountId)`.
Master `objection_responses` is read directly via `getPublishedResponses()` (public to all auth users).

### R2: Compliance before publish (master library)
`POST /api/admin/objections/[id]/publish` MUST check `compliance_status === "passed"`.
Return 422 if pending or flagged. Admin must run compliance check first.

### R3: Personal responses can be flagged but saved
Distributors may save a flagged personal response (it stays private, never shared).
Show a clear warning badge on flagged personal responses.
They cannot be "published" (they're always private).

### R4: Copy is client-side only
`navigator.clipboard.writeText()` — no server call, no audit log for clipboard copies.
This is intentional — we don't track what distributors do with responses after copying.

### R5: "Use as Content" creates a draft, not a published post
`POST /api/objections/[id]/use-as-content` creates a Content Studio draft.
The Modification Rule (Jaccard similarity ≤ 0.80) still applies — the distributor
must substantially edit the seeded content before exporting. This is by design.

### R6: Admin-only creation for master library
Distributors can only READ master responses and create PRIVATE personal responses.
No distributor can add to or edit the shared master library.

### R7: Seed data is pre-approved
`drizzle/0011_objections_seed.sql` inserts with `compliance_status = 'passed'` and
`is_published = true`. These responses have been manually reviewed. The seed runs
after the schema migration — keep it as a separate file so it can be re-run safely
(use `ON CONFLICT DO NOTHING`).

### R8: TypeScript strict
No `any`. All types in `lib/objections/types.ts`. Validators in `lib/validators/objections.ts`.
Category constants as `const` array (single source of truth).

---

## 12. Tests Required

Create `tests/objection-library.test.ts`:

1. **Categories — all 5 defined**: `OBJECTION_CATEGORIES.length === 5`, includes `"mlm_concern"`
2. **ResponseSchema — valid response passes**: 80-char response text → Zod parse succeeds
3. **ResponseSchema — too short rejected**: `responseText: "Short"` (< 50 chars) → Zod parse fails
4. **ResponseSchema — too long rejected**: 501-char responseText → Zod parse fails
5. **Compliance check — income claim flagged**: `"You can earn a significant income"` in response text → compliance returns `passed: false`
6. **Compliance check — clean response passes**: honest personal-story text → `passed: true`
7. **Publish guard — blocked if not passed**: `POST /api/admin/objections/[id]/publish` when `compliance_status = 'pending'` → 422
8. **Publish guard — allowed if passed**: `compliance_status = 'passed'` → publish succeeds
9. **Favourite toggle — add**: `POST /api/objections/favourites` action "add" → inserted, no duplicate error
10. **Favourite toggle — remove**: action "remove" → removed
11. **Personal response — saved even if flagged**: create personal with income claim text → 201 returned, `complianceStatus: "flagged"` on row
12. **Account isolation — personal responses scoped**: `listPersonal()` via `scopedDb("acct-A")` returns empty for acct-B data
13. **Use as content — creates draft**: `POST /api/objections/[id]/use-as-content` → `draftId` returned in response
14. **AI draft — returns 3 options**: mock Haiku returning valid JSON → 3 `DraftedResponse` objects returned
15. **Category filter — only returns requested category**: `getPublishedResponses("price")` returns only price responses

Target: 15 new tests. Total: 120 + 15 = **135 tests**.

---

## 13. File Checklist

```
lib/
  db/
    schema/
      objections.ts           ← NEW (objection_responses, account_objection_favourites,
                                     account_objection_responses)
      index.ts                ← UPDATE (add objections export)
    scoped.ts                 ← UPDATE (add objections namespace + adminDb.objections)
  objections/
    types.ts                  ← NEW (OBJECTION_CATEGORIES, CATEGORY_LABELS, TONE_LABELS)
    library.ts                ← NEW (getPublishedResponses — read-only public function)
    check.ts                  ← NEW (checkResponseCompliance — wraps runComplianceFilter)
    draft.ts                  ← NEW (draftObjectionResponses — Haiku drafting, admin only)
  validators/
    objections.ts             ← NEW (ResponseSchema, DraftRequestSchema, TONES)

drizzle/
  0011_objections.sql         ← NEW (schema + RLS)
  0011_objections_seed.sql    ← NEW (15 seed responses, all passed + published)

app/
  (app)/
    objections/
      page.tsx                ← NEW (distributor library — client component)
      _components/
        response-card.tsx     ← NEW
        add-personal-modal.tsx ← NEW
    _components/
      app-sidebar.tsx         ← UPDATE (add Objections nav, available: true)

  (admin)/
    admin/
      objections/
        page.tsx              ← NEW (admin management — review queue + published + flagged)

  api/
    objections/
      route.ts                ← NEW (GET — master + personal + favourite IDs)
      favourites/route.ts     ← NEW (POST toggle)
      personal/
        route.ts              ← NEW (GET list, POST create)
        [responseId]/route.ts ← NEW (PUT update, DELETE)
      [responseId]/
        use-as-content/route.ts ← NEW (POST)
    admin/
      objections/
        route.ts              ← NEW (GET all, POST create)
        draft/route.ts        ← NEW (POST AI draft)
        [responseId]/
          route.ts            ← NEW (PUT update, DELETE)
          publish/route.ts    ← NEW (POST)
          unpublish/route.ts  ← NEW (POST)
          check-compliance/route.ts ← NEW (POST)

tests/
  objection-library.test.ts  ← NEW
```

---

## 14. Definition of Done

- [ ] `npx tsc --noEmit` → 0 errors
- [ ] `npx vitest run` → 135 tests pass (120 existing + 15 new)
- [ ] `npx drizzle-kit generate` → generates 0011 without errors
- [ ] `npx next build` → build succeeds
- [ ] Seed data present: 15 published responses across all 5 categories
- [ ] Copy button works (clipboard) — no server call
- [ ] Favourite toggle is optimistic (instant UI, API in background)
- [ ] Compliance check runs on create + update for both master and personal
- [ ] Publish blocked if compliance not passed
- [ ] Personal flagged responses saved but clearly marked ⚠
- [ ] "Use as Content" creates a Content Studio draft and redirects
- [ ] Admin AI draft returns 3 options without auto-saving
- [ ] Category filter tabs work (All + 5 categories + My Responses)
- [ ] Objections nav item added to sidebar, `available: true`
- [ ] Seed file uses `ON CONFLICT DO NOTHING` (safe to re-run)

---

## 15. Start Order (Recommended Sequence)

1. `lib/objections/types.ts` (constants first)
2. `lib/db/schema/objections.ts`
3. `lib/db/schema/index.ts` (add export)
4. `drizzle/0011_objections.sql`
5. `drizzle/0011_objections_seed.sql` (15 seed responses)
6. `lib/db/scoped.ts` (add objections namespace)
7. `lib/validators/objections.ts`
8. `lib/objections/library.ts` (read-only, no auth)
9. `lib/objections/check.ts` (wraps compliance filter)
10. `lib/objections/draft.ts` (Haiku, admin only)
11. Admin API routes: `GET/POST /api/admin/objections` → `PUT/DELETE` → `publish/unpublish` → `check-compliance` → `draft`
12. Distributor API routes: `GET /api/objections` → `POST favourites` → personal CRUD → `use-as-content`
13. `app/(admin)/admin/objections/page.tsx`
14. `app/(app)/objections/_components/response-card.tsx`
15. `app/(app)/objections/_components/add-personal-modal.tsx`
16. `app/(app)/objections/page.tsx`
17. Update sidebar (`app-sidebar.tsx`)
18. `tests/objection-library.test.ts`
19. Final: `tsc --noEmit` + `vitest run` + `next build`
