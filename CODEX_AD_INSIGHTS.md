# Codex Task Brief — Ad Insights
# President Tools OS — Phase 9 (Week 10)
#
# HOW TO RUN:
#   codex --model o3 --approval-mode auto-edit "$(cat CODEX_AD_INSIGHTS.md)"
#
# PREREQUISITES:
#   - Phase 1 (Foundation) complete
#   - Phase 3 (Content Studio) complete — content drafts are the "ads" being tracked
#   - Phase 7 (Manual CRM) complete — ad performance correlates to contact pipeline
# IMPORTANT: Read every section before writing any code.

---

## 1. Mission

Build **Ad Insights** — a manual ad performance tracker that lets distributors
log how each piece of content performed, upload screenshots of their stats, and
get an AI read on what's working and what to change.

**What "ads" means here:** In this context, "ads" = any content the distributor
posts organically on social media (Facebook, Instagram, TikTok, WhatsApp status).
This is NOT paid advertising. It's organic attraction-marketing posts. The system
tracks the human-observed results: reach, saves, comments, DMs received.

**Manual-first principle (non-negotiable):** There is NO connection to any social
media API. No Facebook Insights API, no Instagram Graph API, no TikTok API.
The distributor manually reads their phone's screen and types in the numbers —
or uploads a screenshot which GPT-4o Vision reads for them.

**What it does:**
- Distributor logs a post: links to a Content Studio draft (or enters free text),
  picks the platform, records when it was posted
- Distributor enters stats: reach, likes, comments, saves, DMs received, leads generated
  (or uploads a screenshot → GPT-4o Vision extracts the numbers automatically)
- After logging 3+ posts, an AI analysis button appears: "What's working?"
  Claude Haiku reads the log and surfaces patterns (best platform, best content type,
  best time of day, themes that generate DMs vs. just likes)

**What it does NOT do:**
- No API calls to any social platform
- No automated posting or scheduling
- No pixel tracking or UTM parameters
- No competitive analysis of other distributors

---

## 2. Project Context

### Stack (do not change — already installed)
- Next.js 14 App Router + TypeScript strict + Tailwind + shadcn/ui
- **OpenAI GPT-4o Vision** — OCR of screenshot images
  ```typescript
  import OpenAI from "openai";  // install: npm install openai
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  ```
- **Anthropic Claude Haiku** — pattern analysis (already installed)
- **Cloudflare R2** — screenshot storage (already set up in lib/storage/r2.ts)
- Drizzle ORM + Supabase

### Already built — do not re-implement
```
lib/db/scoped.ts               scopedDb(accountId)
lib/auth/session.ts            getAccountFromSession()
lib/storage/r2.ts              generateUploadPresignedUrl(), getPublicUrl(), uploadBytes()
lib/db/schema/content.ts       contentDrafts (link ad entries to existing drafts)
lib/compliance/filter.ts       not used in this module (ad logs are internal data)
```

### New dependency to install
```bash
npm install openai
```
Add to `package.json`: `"openai": "^4.52.0"`

Add to `.env.example`:
```
OPENAI_API_KEY=
```

### R2 key convention for screenshots
```
ad-screenshots/{accountId}/{adEntryId}.jpg
```

---

## 3. The Data Model

### What a distributor logs per post

Each logged post ("ad entry") tracks:

**Identity:**
- Which platform (Facebook / Instagram / TikTok / WhatsApp Status / Other)
- Link to a Content Studio draft (optional — manual text if no draft)
- Post caption preview (first 200 chars — for display in the log)
- Date posted

**Stats (all optional — distributor fills what they know):**
| Metric | Type | Notes |
|--------|------|-------|
| reach | INTEGER | How many people saw it |
| likes | INTEGER | Reactions / likes |
| comments | INTEGER | Comment count |
| saves | INTEGER | Saves / bookmarks |
| shares | INTEGER | Shares / reposts |
| dms_received | INTEGER | DMs triggered by this post |
| leads_generated | INTEGER | People who contacted about the business/product |
| link_clicks | INTEGER | Clicks if post had a link |

**Screenshot:**
- Optional image upload (JPEG/PNG, max 5MB)
- Stored in R2 at `ad-screenshots/{accountId}/{entryId}.jpg`
- GPT-4o Vision extracts stats from the screenshot automatically

**AI analysis field (computed):**
- `ocr_extracted_stats` — JSON string of stats extracted by GPT-4o Vision
- `ocr_confidence` — `"high"` | `"low"` | `null`

---

## 4. Database Schema

### 4a. Create `lib/db/schema/ads.ts`

**`ad_entries`**
| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | gen_random_uuid() |
| account_id | UUID NOT NULL | FK → accounts.id ON DELETE CASCADE |
| platform | TEXT NOT NULL | `'facebook'` \| `'instagram'` \| `'tiktok'` \| `'whatsapp_status'` \| `'other'` |
| content_draft_id | UUID | FK → content_drafts.id ON DELETE SET NULL. Optional. |
| caption_preview | TEXT | First 200 chars of the post text. Shown in list. |
| posted_at | DATE NOT NULL | Date the content was posted (MYT). |
| reach | INTEGER | |
| likes | INTEGER | |
| comments | INTEGER | |
| saves | INTEGER | |
| shares | INTEGER | |
| dms_received | INTEGER | |
| leads_generated | INTEGER | |
| link_clicks | INTEGER | |
| screenshot_key | TEXT | R2 object key. Null if no screenshot uploaded. |
| ocr_extracted_stats | TEXT | JSON string of stats GPT-4o extracted. Null if no screenshot or OCR failed. |
| ocr_confidence | TEXT | `'high'` \| `'low'` \| null |
| notes | TEXT | Distributor's own reflection. Max 500 chars. |
| created_at | TIMESTAMPTZ NOT NULL DEFAULT now() |
| updated_at | TIMESTAMPTZ NOT NULL DEFAULT now() |

Indexes:
- `(account_id)` — list all
- `(account_id, posted_at DESC)` — chronological log
- `(account_id, platform)` — filter by platform
- `(account_id, content_draft_id)` — link back to Content Studio

**`ad_analyses`** — Cached AI analysis results (one per account, refreshed on demand).
| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| account_id | UUID NOT NULL UNIQUE | One row per account |
| analysis_text | TEXT NOT NULL | The full Haiku analysis (markdown-ish plain text) |
| entries_analysed | INTEGER NOT NULL | How many ad entries were included |
| analysed_at | TIMESTAMPTZ NOT NULL | When this analysis was generated |
| prompt_tokens | INTEGER | Cost tracking |
| completion_tokens | INTEGER | Cost tracking |

### 4b. Update `lib/db/schema/index.ts`
Add: `export * from "./ads";`

### 4c. Migration `drizzle/0010_ads.sql`
- Both tables with columns and indexes
- RLS:
  - `ad_entries`: SELECT/INSERT/UPDATE/DELETE: own account OR admin
  - `ad_analyses`: SELECT/INSERT/UPDATE: own account OR admin. DELETE: admin only.
- Updated-at trigger on `ad_entries`

---

## 5. Extend `scopedDb` — Add to `lib/db/scoped.ts`

Add imports:
```typescript
import { adEntries, adAnalyses } from "@/lib/db/schema/ads";
import type { AdEntry, NewAdEntry, AdAnalysis } from "@/lib/db/schema/ads";
```

Add `ads` namespace to `scopedDb()`:

```typescript
ads: {
  // ── Ad Entries ────────────────────────────────────────────────────────
  list: async (opts?: {
    platform?: string;
    limit?: number;
  }) => Promise<AdEntry[]>
    // WHERE account_id = accountId
    // AND (platform = opts.platform if provided)
    // ORDER BY posted_at DESC, created_at DESC
    // LIMIT opts.limit ?? 100

  get: async (entryId: string) => Promise<AdEntry | undefined>
    // WHERE id = ? AND account_id = accountId

  create: async (data: Omit<NewAdEntry, "accountId"|"id"|"createdAt"|"updatedAt">)
    => Promise<AdEntry | undefined>

  update: async (entryId: string, data: Partial<Omit<NewAdEntry, "accountId"|"id"|"createdAt">>)
    => Promise<AdEntry | undefined>
    // WHERE id = ? AND account_id = accountId

  delete: async (entryId: string) => Promise<void>
    // WHERE id = ? AND account_id = accountId
    // Also delete R2 screenshot if screenshot_key is set

  count: async () => Promise<number>
    // COUNT WHERE account_id = accountId

  // ── Analysis ──────────────────────────────────────────────────────────
  getAnalysis: async () => Promise<AdAnalysis | undefined>
    // WHERE account_id = accountId LIMIT 1

  upsertAnalysis: async (data: Omit<AdAnalysis, "id"|"accountId">) => Promise<void>
    // INSERT ... ON CONFLICT (account_id) DO UPDATE SET ...
}
```

---

## 6. GPT-4o Vision OCR

Create `lib/ads/ocr.ts`:

```typescript
/**
 * Extract ad performance stats from a screenshot using GPT-4o Vision.
 * Returns the best-effort JSON of stat values found in the image.
 * Never throws — returns null on failure.
 *
 * Server-side only. OPENAI_API_KEY never reaches the client.
 */
import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export type OcrStats = {
  reach?: number;
  likes?: number;
  comments?: number;
  saves?: number;
  shares?: number;
  dms_received?: number;
  leads_generated?: number;
  link_clicks?: number;
};

export type OcrResult = {
  stats: OcrStats;
  confidence: "high" | "low";
};

const OCR_PROMPT = `You are reading a screenshot of social media post analytics from a mobile app.
Extract any performance numbers you can see. Return ONLY a JSON object with these optional keys
(include only the ones you can clearly read — do NOT guess):

{
  "reach": <integer>,
  "likes": <integer>,
  "comments": <integer>,
  "saves": <integer>,
  "shares": <integer>,
  "dms_received": <integer>,
  "leads_generated": <integer>,
  "link_clicks": <integer>
}

If you can read at least 2 metrics clearly: set confidence to "high".
Otherwise: confidence "low".

Output format — ONLY valid JSON, no explanation:
{
  "stats": { ... },
  "confidence": "high" | "low"
}`;

export async function extractStatsFromScreenshot(
  imageBase64: string,
  mimeType: "image/jpeg" | "image/png" = "image/jpeg"
): Promise<OcrResult | null> {
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      max_tokens: 300,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: OCR_PROMPT },
            {
              type: "image_url",
              image_url: {
                url: `data:${mimeType};base64,${imageBase64}`,
                detail: "low",   // low = cheaper, sufficient for number extraction
              },
            },
          ],
        },
      ],
    });

    const raw = response.choices[0]?.message?.content?.trim() ?? "";
    const parsed = JSON.parse(raw) as { stats: OcrStats; confidence: "high" | "low" };

    // Validate all values are non-negative integers
    const clean: OcrStats = {};
    for (const [key, val] of Object.entries(parsed.stats ?? {})) {
      if (typeof val === "number" && Number.isInteger(val) && val >= 0) {
        (clean as Record<string, number>)[key] = val;
      }
    }

    return {
      stats: clean,
      confidence: parsed.confidence === "high" ? "high" : "low",
    };
  } catch {
    return null;  // OCR failure is non-fatal — distributor fills in manually
  }
}
```

---

## 7. AI Pattern Analysis

Create `lib/ads/analyse.ts`:

```typescript
/**
 * Analyses the distributor's ad log and surfaces patterns using Claude Haiku.
 * Requires at least 3 ad entries to produce a meaningful analysis.
 * Returns plain-text analysis (no markdown headers — just readable paragraphs).
 */
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export type AnalysisInput = {
  accountName: string;
  entries: Array<{
    platform: string;
    captionPreview: string | null;
    postedAt: string;          // YYYY-MM-DD
    reach: number | null;
    likes: number | null;
    comments: number | null;
    saves: number | null;
    dmsReceived: number | null;
    leadsGenerated: number | null;
    notes: string | null;
  }>;
};

export type AnalysisResult = {
  text: string;
  promptTokens: number;
  completionTokens: number;
};

export async function analyseAdPerformance(input: AnalysisInput): Promise<AnalysisResult> {
  const entryLines = input.entries.map((e, i) => {
    const stats = [
      e.reach != null ? `reach ${e.reach}` : null,
      e.likes != null ? `likes ${e.likes}` : null,
      e.comments != null ? `comments ${e.comments}` : null,
      e.saves != null ? `saves ${e.saves}` : null,
      e.dmsReceived != null ? `DMs ${e.dmsReceived}` : null,
      e.leadsGenerated != null ? `leads ${e.leadsGenerated}` : null,
    ].filter(Boolean).join(", ");

    const preview = e.captionPreview ? `"${e.captionPreview.slice(0, 80)}..."` : "(no caption)";
    return `${i + 1}. ${e.platform} | ${e.postedAt} | ${preview} | ${stats || "no stats"}${e.notes ? ` | Note: ${e.notes}` : ""}`;
  }).join("\n");

  const prompt = `You are analysing the organic social media performance log for a Herbalife Malaysia
distributor named ${input.accountName}. They post attraction-marketing content — personal wellness
stories and business journey posts. No paid ads.

Here are their recent posts (${input.entries.length} entries):
${entryLines}

Write a practical 3–4 paragraph analysis covering:
1. Which platform and content style is generating the most DMs and leads
2. What time patterns show (if any data)
3. One specific thing they're doing well
4. One specific thing to try or change next week

Rules:
- Be specific to their actual data, not generic advice
- Do NOT suggest income claim content or guaranteed results language
- Keep it encouraging but honest
- Write in plain paragraphs — no bullet points, no markdown headers
- Address them directly as "you" / "your posts"
- Under 250 words total`;

  const msg = await client.messages.create({
    model: "claude-haiku-4-5",
    max_tokens: 400,
    messages: [{ role: "user", content: prompt }],
  });

  const text = msg.content[0]?.type === "text" ? msg.content[0].text.trim() : "";
  return {
    text,
    promptTokens: msg.usage.input_tokens,
    completionTokens: msg.usage.output_tokens,
  };
}
```

---

## 8. Validators

Create `lib/validators/ads.ts`:

```typescript
import { z } from "zod";

export const PLATFORMS = [
  "facebook",
  "instagram",
  "tiktok",
  "whatsapp_status",
  "other",
] as const;
export type Platform = typeof PLATFORMS[number];

export const PLATFORM_LABELS: Record<Platform, string> = {
  facebook: "Facebook",
  instagram: "Instagram",
  tiktok: "TikTok",
  whatsapp_status: "WhatsApp Status",
  other: "Other",
};

const optionalPositiveInt = z.number().int().nonnegative().optional().nullable();

export const AdEntrySchema = z.object({
  platform: z.enum(PLATFORMS),
  contentDraftId: z.string().uuid().optional().nullable(),
  captionPreview: z.string().max(200).optional().nullable(),
  postedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Must be YYYY-MM-DD"),
  reach: optionalPositiveInt,
  likes: optionalPositiveInt,
  comments: optionalPositiveInt,
  saves: optionalPositiveInt,
  shares: optionalPositiveInt,
  dmsReceived: optionalPositiveInt,
  leadsGenerated: optionalPositiveInt,
  linkClicks: optionalPositiveInt,
  notes: z.string().max(500).optional().nullable(),
});

export const UpdateAdEntrySchema = AdEntrySchema.partial();
```

---

## 9. API Routes

### GET `/api/ads`
**Auth:** `getAccountFromSession()`
Query: `platform?: string`, `limit?: number` (default 50)
Returns: `{ entries: AdEntry[], total: number }`

### POST `/api/ads`
**Auth:** `getAccountFromSession()`
Body: `AdEntrySchema`

Logic:
1. Validate body
2. `userDb.ads.create({ ...data, accountId: session.id })`
3. Return `{ entry }` with 201

### GET `/api/ads/[entryId]`
**Auth:** `getAccountFromSession()`
Returns entry or 404.

### PUT `/api/ads/[entryId]`
**Auth:** `getAccountFromSession()`
Body: `UpdateAdEntrySchema`
Returns updated entry.

### DELETE `/api/ads/[entryId]`
**Auth:** `getAccountFromSession()`

Logic:
1. Load entry → check `screenshot_key`
2. If screenshot exists → `deleteObject(screenshot_key)` from R2
3. `userDb.ads.delete(entryId)`
4. Return `{ ok: true }`

### POST `/api/ads/screenshot-upload-url`
**Auth:** `getAccountFromSession()`

Generates a presigned R2 upload URL for a screenshot.
The client uploads directly to R2, then the key is saved to the ad entry.

Body: `{ entryId: z.string().uuid(), mimeType: z.enum(["image/jpeg", "image/png"]) }`

Logic:
1. Verify `userDb.ads.get(entryId)` exists and belongs to this account
2. Generate key: `ad-screenshots/${session.id}/${entryId}.jpg`
3. `generateUploadPresignedUrl(key, mimeType, 300)` — 5-min expiry
4. Return `{ uploadUrl, key }`

### POST `/api/ads/[entryId]/ocr`
**Auth:** `getAccountFromSession()`

Called after screenshot is uploaded to R2. Triggers GPT-4o Vision extraction.

Body: none — the screenshot key is already on the entry.

Logic:
1. Load entry → if no `screenshot_key` → return 400 `{ error: "No screenshot uploaded yet." }`
2. Download image from R2: `getObjectBytes(entry.screenshot_key)`
3. Convert to base64
4. `extractStatsFromScreenshot(base64, mimeType)`
5. If result is null → return `{ ok: true, extracted: null }` (OCR failed silently)
6. Merge extracted stats into entry (only fill fields that are currently null):
   ```typescript
   const updates: Partial<AdEntry> = {};
   if (result) {
     if (entry.reach == null && result.stats.reach != null) updates.reach = result.stats.reach;
     // ... same for all stat fields
     updates.ocrExtractedStats = JSON.stringify(result.stats);
     updates.ocrConfidence = result.confidence;
   }
   ```
7. `userDb.ads.update(entryId, updates)`
8. Return `{ ok: true, extracted: result?.stats ?? null, confidence: result?.confidence ?? null }`

Note: OCR only pre-fills NULL fields — it never overwrites values the distributor
already entered manually. The distributor reviews and adjusts after OCR.

### POST `/api/ads/[entryId]/confirm-screenshot`
**Auth:** `getAccountFromSession()`

Called after client uploads to presigned URL to store the R2 key on the entry.
Body: `{ key: z.string() }`

Logic:
1. Validate key starts with `ad-screenshots/${session.id}/`
2. `userDb.ads.update(entryId, { screenshotKey: key })`
3. Return `{ ok: true }`

### GET `/api/ads/analysis`
**Auth:** `getAccountFromSession()`
Returns cached analysis or `{ analysis: null }` if none yet.

### POST `/api/ads/analysis`
**Auth:** `getAccountFromSession()`

Generates (or regenerates) the AI pattern analysis.

Logic:
1. `count = await userDb.ads.count()`
2. If `count < 3` → return 400 `{ error: "Log at least 3 posts before running analysis.", count }`
3. Load last 30 entries: `userDb.ads.list({ limit: 30 })`
4. Build `AnalysisInput` from entries
5. `analyseAdPerformance(input)`
6. `userDb.ads.upsertAnalysis({ analysisText, entriesAnalysed: entries.length, analysedAt: new Date(), promptTokens, completionTokens })`
7. Return `{ analysis: AdAnalysis }`

---

## 10. Authenticated UI

### Page: `app/(app)/analytics/page.tsx`
**Client Component.** The Ad Insights dashboard.

Note: the sidebar already has "Analytics" at `/analytics`. This page IS that module.

```
Ad Insights

[+ Log a Post]                              [Filter: All Platforms ▼]

── Recent Posts ─────────────────────────────────────────────────────

┌────────────────────────────────────────────────────────────────────┐
│ 📘 Facebook · 18 May 2026                                          │
│ "I never used to think about what I put in my body, until three   │
│  weeks ago when..."                                                │
│                                                                    │
│ Reach: 1,240  Likes: 87  Comments: 12  Saves: 34  DMs: 5          │
│ [📷 Screenshot]  [Edit]  [Delete]                                  │
└────────────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────────┐
│ 📸 Instagram · 15 May 2026                          ⚠ low OCR      │
│ "Sharing my morning routine..."                                    │
│                                                                    │
│ Reach: —  Likes: 43  Comments: 3  Saves: 8  DMs: 1               │
│ [📷 Screenshot]  [Edit]  [Delete]                                  │
└────────────────────────────────────────────────────────────────────┘

── AI Analysis ──────────────────────────────────────────────────────

[What's Working? →]   (appears after 3+ entries)
Last analysed: 2 days ago

┌────────────────────────────────────────────────────────────────────┐
│ Your Facebook posts are consistently generating more DMs than      │
│ Instagram — particularly posts where you share a personal story    │
│ rather than product information. Your 18 May post reached 1,240    │
│ people and brought in 5 DMs, which is a strong signal...           │
│                                                                    │
│ [Regenerate Analysis]                                              │
└────────────────────────────────────────────────────────────────────┘
```

### Component: `app/(app)/analytics/_components/log-post-modal.tsx`
Modal for creating/editing an ad entry.

**Layout:**
```
Log a Post

Platform:   [Facebook ▼]
Posted on:  [Date picker]
Caption:    [Textarea, max 200 chars — or auto-filled from Content Studio draft]
            [Link to Content Studio draft ▼] (optional)

Stats (fill what you know — all optional):
  Reach       [____]   Likes     [____]
  Comments    [____]   Saves     [____]
  DMs         [____]   Leads     [____]
  Shares      [____]   Clicks    [____]

Screenshot (optional):
  [Upload Screenshot]
  After upload: [Extract Stats with AI] button appears

Notes: [Textarea, max 500 chars]

[Save]  [Cancel]
```

**Screenshot + OCR flow:**
1. Distributor clicks "Upload Screenshot" → file picker (JPEG/PNG, max 5MB)
2. Client calls `POST /api/ads/screenshot-upload-url` → gets presigned URL
3. Client PUTs file to presigned URL
4. Client calls `POST /api/ads/[entryId]/confirm-screenshot`
5. "Extract Stats with AI" button becomes active
6. Distributor clicks it → `POST /api/ads/[entryId]/ocr`
7. Extracted numbers populate the stat fields (null fields only, with yellow highlight indicating "AI-filled")
8. Show confidence: "✓ High confidence" or "⚠ Low confidence — please verify"
9. Distributor reviews and adjusts if needed, then saves

**Pre-fill from Content Studio:** A dropdown showing recent content drafts.
When selected → populates `captionPreview` from the draft's generated text.
This is a UX convenience — content_draft_id is stored as the link.

### Component: `app/(app)/analytics/_components/ad-entry-card.tsx`
Displays one logged post with all stats, screenshot thumbnail, and edit/delete.

### Component: `app/(app)/analytics/_components/analysis-panel.tsx`
Shows the cached AI analysis text with a "Regenerate" button.
Shows a loading state while analysis is running (can take 3–5s).
If < 3 entries: shows "Log 3 or more posts to unlock AI analysis."

### Update sidebar: `app/(app)/_components/app-sidebar.tsx`
Set `available: true` for Analytics nav item:
```typescript
{ label: "Analytics", href: "/analytics", icon: "📊", available: true },
```

---

## 11. Rules & Constraints

### R1: Account Isolation (absolute)
Every `ad_entries` and `ad_analyses` query MUST use `scopedDb(accountId)`.

### R2: No social media API integrations
Zero calls to Facebook Graph API, Instagram API, TikTok API, or any social platform.
The only external API calls are:
- OpenAI (GPT-4o Vision) — for OCR of screenshots
- Anthropic (Claude Haiku) — for pattern analysis

### R3: OCR never overwrites manual entries
In `POST /api/ads/[entryId]/ocr`, only NULL stat fields are populated from OCR.
If the distributor already typed "Reach: 1200", OCR does not change it even if it
reads a different number from the screenshot.

### R4: Screenshot key validation
`POST /api/ads/[entryId]/confirm-screenshot` validates that the key begins with
`ad-screenshots/{session.id}/` before storing it. This prevents one account from
pointing to another account's screenshots.

### R5: Screenshot size limit
Max 5MB enforced at the upload-URL generation step:
```typescript
// In generateUploadPresignedUrl — already exists in r2.ts
// Pass ContentLengthRange condition to the presigned PUT if the SDK supports it.
// If not: validate client-side only (acceptable — R2 will reject oversized files)
```

### R6: Analysis minimum entries
`POST /api/ads/analysis` requires at least 3 entries. Return 400 with count if fewer.

### R7: Analysis is cached, not real-time
The analysis reflects the state of entries at generation time.
Show "Last analysed: X days ago" and a "Regenerate" button.
Regeneration calls Haiku again — remind distributors this costs tokens
(no visible cost to them, but keep it purposeful).

### R8: PDPA
Ad entries contain no personal data (they're about post performance, not contacts).
Screenshots may contain numbers visible on the distributor's own device — no concern.

### R9: TypeScript strict
No `any`. All types from `lib/db/schema/ads.ts`. Validators in `lib/validators/ads.ts`.
Platform constants as `const` array in `lib/validators/ads.ts` (single source of truth).

---

## 12. Tests Required

Create `tests/ad-insights.test.ts`:

1. **Platform constants — all 5 defined**: `PLATFORMS.length === 5` includes `"whatsapp_status"`
2. **AdEntrySchema — valid entry passes**: complete entry with all optional fields → Zod parse succeeds
3. **AdEntrySchema — negative reach rejected**: `reach: -1` → Zod parse fails
4. **AdEntrySchema — invalid date rejected**: `postedAt: "21/05/2026"` → Zod parse fails
5. **OCR — only fills null fields**: entry has `likes: 50`, OCR extracts `likes: 60` → `likes` stays `50`
6. **OCR — populates null field**: entry has `reach: null`, OCR extracts `reach: 1200` → `reach` becomes `1200`
7. **OCR — returns null on GPT failure**: mock OpenAI to throw → `extractStatsFromScreenshot` returns `null`, no throw
8. **Screenshot key validation — own key accepted**: key `ad-screenshots/acct-A/entry-1.jpg` for account `acct-A` → accepted
9. **Screenshot key validation — foreign key rejected**: key `ad-screenshots/acct-B/entry-1.jpg` for account `acct-A` → `POST confirm-screenshot` returns 400
10. **Analysis — blocked with < 3 entries**: `userDb.ads.count()` returns 2 → `POST /api/ads/analysis` returns 400
11. **Analysis — runs with 3+ entries**: `count()` returns 3 → Haiku called → analysis upserted
12. **Analysis — returns cached without re-running Haiku**: `GET /api/ads/analysis` when cache exists → Haiku NOT called
13. **Account isolation — entries scoped**: `list()` via `scopedDb("acct-A")` returns empty for acct-B data
14. **Delete — removes screenshot from R2**: entry with `screenshot_key` → `DELETE /api/ads/[id]` calls `deleteObject(key)`

Target: 14 new tests. Total: 106 + 14 = **120 tests**.

---

## 13. File Checklist

```
lib/
  db/
    schema/
      ads.ts                  ← NEW (ad_entries, ad_analyses)
      index.ts                ← UPDATE (add ads export)
    scoped.ts                 ← UPDATE (add ads namespace)
  ads/
    ocr.ts                    ← NEW (extractStatsFromScreenshot — GPT-4o Vision)
    analyse.ts                ← NEW (analyseAdPerformance — Haiku)
  validators/
    ads.ts                    ← NEW (AdEntrySchema, UpdateAdEntrySchema, PLATFORMS)

drizzle/
  0010_ads.sql                ← NEW

.env.example                  ← UPDATE (add OPENAI_API_KEY)

package.json                  ← UPDATE (add "openai": "^4.52.0")

app/
  (app)/
    analytics/
      page.tsx                ← NEW (Ad Insights dashboard — client component)
      _components/
        log-post-modal.tsx    ← NEW (create/edit ad entry with OCR flow)
        ad-entry-card.tsx     ← NEW (display one logged post)
        analysis-panel.tsx    ← NEW (AI analysis display + regenerate)
    _components/
      app-sidebar.tsx         ← UPDATE (Analytics: available: true)

  api/
    ads/
      route.ts                ← NEW (GET list, POST create)
      [entryId]/
        route.ts              ← NEW (GET, PUT, DELETE)
        ocr/route.ts          ← NEW (POST — trigger GPT-4o Vision)
        confirm-screenshot/route.ts ← NEW (POST — save R2 key)
      screenshot-upload-url/route.ts ← NEW (POST — presigned URL)
      analysis/route.ts       ← NEW (GET cached, POST generate)

tests/
  ad-insights.test.ts         ← NEW
```

---

## 14. Definition of Done

- [ ] `npx tsc --noEmit` → 0 errors
- [ ] `npx vitest run` → 120 tests pass (106 existing + 14 new)
- [ ] `npx drizzle-kit generate` → generates 0010 without errors
- [ ] `npx next build` → build succeeds
- [ ] `openai` package installed and importable
- [ ] Ad entry can be created with all fields optional (just platform + date required)
- [ ] Screenshot upload flow: presigned URL → upload → confirm → OCR → stats populated
- [ ] OCR never overwrites manually-entered stats
- [ ] Screenshot key validated against account ID before saving
- [ ] AI analysis blocked until 3+ entries logged
- [ ] Cached analysis returned from GET without calling Haiku again
- [ ] Delete removes screenshot from R2 if present
- [ ] Analytics nav item `available: true` in sidebar
- [ ] `OPENAI_API_KEY` in `.env.example`
- [ ] No calls to any social media platform API anywhere

---

## 15. Start Order (Recommended Sequence)

1. `npm install openai` + update `package.json`
2. `.env.example` (add OPENAI_API_KEY)
3. `lib/db/schema/ads.ts`
4. `lib/db/schema/index.ts` (add export)
5. `drizzle/0010_ads.sql`
6. `lib/db/scoped.ts` (add ads namespace)
7. `lib/validators/ads.ts` (PLATFORMS + schemas)
8. `lib/ads/ocr.ts` (GPT-4o Vision — no DB deps)
9. `lib/ads/analyse.ts` (Haiku analysis — no DB deps)
10. API routes: `GET/POST /api/ads` → `GET/PUT/DELETE /api/ads/[id]` → `screenshot-upload-url` → `confirm-screenshot` → `ocr` → `analysis`
11. `app/(app)/analytics/_components/ad-entry-card.tsx`
12. `app/(app)/analytics/_components/analysis-panel.tsx`
13. `app/(app)/analytics/_components/log-post-modal.tsx` (OCR flow last — most complex)
14. `app/(app)/analytics/page.tsx`
15. Update sidebar (`app-sidebar.tsx`)
16. `tests/ad-insights.test.ts`
17. Final: `tsc --noEmit` + `vitest run` + `next build`
