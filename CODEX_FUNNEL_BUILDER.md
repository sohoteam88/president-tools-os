# Codex Task Brief — Funnel Builder
# President Tools OS — Phase 4 (Week 5)
#
# HOW TO RUN:
#   codex --model o3 --approval-mode auto-edit "$(cat CODEX_FUNNEL_BUILDER.md)"
#
# PREREQUISITES:
#   - Phase 1 (Foundation) complete
#   - Phase 2 (Voice Capture) complete — funnel AI assist needs voice data
#   - Phase 3 (Content Studio) complete — compliance keywords CSV already in place
# IMPORTANT: Read every section before writing any code.

---

## 1. Mission

Build the **Funnel Builder** — a tool for distributors to create personalised
public lead-capture pages hosted on their own subdomain (`{slug}.yourteam.com`).

A "funnel" in this context is a simple, focused single-page site:
a personal story → a lead capture form → a redirect to WhatsApp or a thank-you.

**Manual-first principle (non-negotiable):** There is NO email automation, NO
WhatsApp Business API, NO Facebook Pixel, NO ad integration. The funnel captures
leads into a DB table. The distributor manually follows up. That's it.

**Subdomain routing is already built.** The middleware at `middleware.ts` rewrites:
```
{slug}.yourteam.com/          → /funnel/{slug}/
{slug}.yourteam.com/wellness  → /funnel/{slug}/wellness
```
You must place public funnel pages at `app/funnel/[accountSlug]/...` to match.

---

## 2. Project Context

### Stack (do not change — already installed)
- Next.js 14 App Router + TypeScript strict + Tailwind + Drizzle ORM
- Anthropic Claude Sonnet → AI content assist for funnel copywriting
- Cloudflare R2 → already set up (for cover images, reuse `lib/storage/r2.ts`)
- Supabase Auth — auth guard for the builder UI; public pages are unauthenticated

### Already built — do not re-implement
```
middleware.ts              Subdomain → /funnel/{slug} rewrite (production)
lib/db/scoped.ts           scopedDb(accountId) + adminDb
lib/auth/session.ts        getAccountFromSession(), requireAdmin()
lib/storage/r2.ts          generateUploadPresignedUrl(), getPublicUrl()
lib/compliance/filter.ts   runComplianceFilter() — use on funnel text too
lib/content/prompt-builder.ts  PLATFORMS, buildContentPrompt reference
lib/validators/voice.ts    VoiceProfileJson type
```

### Exact imports available from Voice system
```typescript
// scopedDb voice namespace methods you can call in AI assist:
userDb.voice.getWhyStory()           // VoiceCapture | undefined
userDb.voice.getLatestProfile()      // VoiceProfile | undefined
```

### Anthropic SDK (already installed)
```typescript
import Anthropic from "@anthropic-ai/sdk";
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const msg = await client.messages.create({
  model: "claude-sonnet-4-5",
  max_tokens: 2048,
  messages: [{ role: "user", content: prompt }],
});
const text = msg.content[0]?.type === "text" ? msg.content[0].text : "";
```

---

## 3. The 3-Layer Funnel Structure

Every funnel page has exactly 3 layers. This is the product's design — do not add
more layers or make it more complex:

```
┌──────────────────────────────────────────────┐
│  LAYER 1 — AWARENESS                        │
│  Hero: headline + subheadline + cover image  │
│  Story: personal journey in 2-4 paragraphs  │
│  Social proof: 1-3 short quotes (optional)  │
├──────────────────────────────────────────────┤
│  LAYER 2 — INTEREST                         │
│  Lead capture form                           │
│  Fields: Name + WhatsApp number (required)   │
│  + Email (optional, distributor's choice)    │
│  Heading: "Ready to start your journey?"     │
├──────────────────────────────────────────────┤
│  LAYER 3 — ACTION                           │
│  After form submit, one of:                  │
│  A) WhatsApp redirect (wa.me link)           │
│  B) Custom URL redirect                      │
│  C) Thank-you message on same page           │
└──────────────────────────────────────────────┘
```

### Funnel Types
```typescript
export const FUNNEL_TYPES = [
  "wellness_story",    // Personal product/wellness journey
  "business_story",    // Business opportunity/income story (NO income claims)
  "event_rsvp",        // RSVP for a webinar, workshop, or event
  "free_resource",     // Lead magnet giveaway (links to Phase 5)
] as const;
export type FunnelType = typeof FUNNEL_TYPES[number];
```

### CTA Types (Layer 3)
```typescript
export const CTA_TYPES = ["whatsapp", "custom_url", "thank_you"] as const;
export type CtaType = typeof CTA_TYPES[number];
```

---

## 4. Account Slug

### What it is
A globally unique URL-safe identifier for each account. Used as the subdomain.
`sherry` → `sherry.yourteam.com`

### Schema change — alter `accounts` table
Add to `lib/db/schema/accounts.ts`:
```typescript
slug: text("slug").unique(),  // nullable — set during onboarding or by admin
```

Add unique index to the schema table definition options:
```typescript
slugIdx: uniqueIndex("idx_accounts_slug").on(table.slug),
```

### Migration `drizzle/0004_account_slug.sql`
```sql
-- Add slug column to existing accounts table
ALTER TABLE public.accounts ADD COLUMN IF NOT EXISTS slug TEXT UNIQUE;
CREATE UNIQUE INDEX IF NOT EXISTS idx_accounts_slug ON public.accounts(slug);

-- RLS: slug is public data (needed to look up funnels by subdomain)
-- The existing "accounts_select" policy already covers SELECT for members + admin
-- For public funnel lookup, we use a SECURITY DEFINER function (see below)

-- Helper: find account_id by slug — used by public funnel pages (no auth context)
CREATE OR REPLACE FUNCTION public.get_account_id_by_slug(p_slug TEXT)
RETURNS UUID LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public AS $$
  SELECT id FROM public.accounts WHERE slug = p_slug AND is_active = true LIMIT 1;
$$;
```

### Slug validation rules (Zod schema)
```typescript
export const accountSlugSchema = z
  .string()
  .min(3, "Slug must be at least 3 characters")
  .max(30, "Slug must be 30 characters or less")
  .regex(/^[a-z0-9][a-z0-9-]*[a-z0-9]$/, "Slug must be lowercase letters, numbers, and hyphens only. Cannot start or end with a hyphen.")
  .refine(slug => !RESERVED_SLUGS.has(slug), "That name is reserved");

const RESERVED_SLUGS = new Set([
  "www", "app", "admin", "api", "mail", "ftp", "smtp",
  "support", "help", "blog", "shop", "store", "about",
]);
```

### Where slug is set
- **Admin creates account** → can set slug immediately via `POST /api/accounts`
  (update the existing route to accept `slug` in body)
- **User sets their own slug** → `POST /api/account/slug` (first time only, cannot change after first funnel published)
- **Setup wizard** → add slug step after seniority selection (update `app/setup/page.tsx`)

---

## 5. Database Schema

### 5a. Create `lib/db/schema/funnels.ts`

**`funnels`**
| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | gen_random_uuid() |
| account_id | UUID NOT NULL | FK → accounts.id ON DELETE CASCADE |
| path_slug | TEXT NOT NULL | URL path segment. `""` = root (`{slug}.yourteam.com/`). `"wellness"` = `{slug}.yourteam.com/wellness`. Lowercase, alphanumeric + hyphens only, max 50 chars |
| title | TEXT NOT NULL | Internal label (not shown on page). e.g. "Main Wellness Funnel" |
| funnel_type | TEXT NOT NULL | one of FUNNEL_TYPES values |
| status | TEXT NOT NULL DEFAULT 'draft' | `'draft'` \| `'published'` |
| content_json | TEXT NOT NULL | JSON string — `FunnelContent` shape (see Section 6) |
| cta_type | TEXT NOT NULL DEFAULT 'thank_you' | one of CTA_TYPES values |
| cta_value | TEXT | For `whatsapp`: phone number (e.g. "60123456789"). For `custom_url`: the URL. For `thank_you`: the message text |
| whatsapp_pre_fill | TEXT | Pre-filled message for wa.me link. e.g. "Hi, I saw your wellness page and I'm interested to know more!" |
| published_at | TIMESTAMPTZ | null until first publish |
| created_at | TIMESTAMPTZ NOT NULL DEFAULT now() |
| updated_at | TIMESTAMPTZ NOT NULL DEFAULT now() |

Unique constraint: `(account_id, path_slug)` — one funnel per path per account.

Indexes: `(account_id)`, `(account_id, status)`, unique `(account_id, path_slug)`

**`funnel_leads`** — append-only (no UPDATE after creation, only `notes` is mutable)
| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| account_id | UUID NOT NULL | FK → accounts.id ON DELETE CASCADE |
| funnel_id | UUID NOT NULL | FK → funnels.id ON DELETE CASCADE |
| name | TEXT NOT NULL | Lead's name |
| whatsapp_number | TEXT NOT NULL | E.164-ish format, cleaned on input |
| email | TEXT | Optional |
| ip_address | TEXT | For rate limiting — not shown to distributor |
| user_agent | TEXT | For debugging |
| notes | TEXT | Distributor's manual follow-up notes. Only mutable column |
| contacted_at | TIMESTAMPTZ | When distributor first reached out |
| submitted_at | TIMESTAMPTZ NOT NULL DEFAULT now() |

Indexes: `(account_id)`, `(funnel_id)`, `(funnel_id, submitted_at DESC)`,
`(ip_address, funnel_id, submitted_at)` — for rate limiting query

### 5b. Update `lib/db/schema/index.ts`
Add: `export * from "./funnels";`

### 5c. Migration `drizzle/0005_funnels.sql`
Full migration:
- Both tables with all columns and indexes
- Unique constraint on `(account_id, path_slug)` for funnels
- RLS enabled on both tables
- `funnels` RLS policies:
  - SELECT: `status = 'published'` (anon public access to published funnels) OR own account OR admin
  - INSERT/UPDATE: own account OR admin
  - DELETE: own account OR admin
- `funnel_leads` RLS policies:
  - SELECT: own account OR admin
  - INSERT: always allowed from application (public lead submission — use `WITH CHECK (true)`)
  - UPDATE: own account OR admin (for updating `notes` and `contacted_at`)
  - DELETE: admin only
- Updated-at trigger on `funnels`

**Important: the funnel_leads INSERT policy allows public inserts.**
This is intentional — anonymous visitors submit leads. The application layer
enforces rate limiting and validates phone numbers.

---

## 6. FunnelContent JSON Shape

Define this type in `lib/funnels/types.ts` — this file is the single source of truth
for funnel content structure. Also define the Zod schema for validation.

```typescript
// lib/funnels/types.ts

export type StoryBlock =
  | { type: "paragraph"; text: string }
  | { type: "highlight"; text: string }     // pull-quote / highlighted box
  | { type: "image"; url: string; alt: string };

export type SocialProofItem = {
  name: string;    // first name only
  quote: string;   // max 200 chars
  result?: string; // e.g. "Feeling more energetic after 3 weeks" — no specific claims
};

export type FunnelContent = {
  headline: string;           // max 100 chars — the big hero headline
  subheadline: string;        // max 200 chars — supporting text under headline
  coverImageUrl?: string;     // optional R2 CDN URL
  storyBlocks: StoryBlock[];  // min 1, max 8 blocks
  leadForm: {
    heading: string;          // max 80 chars
    subheading?: string;      // max 150 chars
    fields: ("name" | "whatsapp" | "email")[]; // whatsapp always included
    submitLabel: string;      // max 40 chars
  };
  socialProof?: SocialProofItem[];  // max 3 items
};
```

Zod schema for validation — place in `lib/validators/funnels.ts`:
```typescript
export const funnelContentSchema = z.object({
  headline: z.string().min(5).max(100),
  subheadline: z.string().min(5).max(200),
  coverImageUrl: z.string().url().optional(),
  storyBlocks: z.array(z.discriminatedUnion("type", [
    z.object({ type: z.literal("paragraph"), text: z.string().min(10).max(1000) }),
    z.object({ type: z.literal("highlight"), text: z.string().min(5).max(300) }),
    z.object({ type: z.literal("image"), url: z.string().url(), alt: z.string().max(100) }),
  ])).min(1).max(8),
  leadForm: z.object({
    heading: z.string().min(3).max(80),
    subheading: z.string().max(150).optional(),
    fields: z.array(z.enum(["name", "whatsapp", "email"])).min(1),
    submitLabel: z.string().min(2).max(40),
  }),
  socialProof: z.array(z.object({
    name: z.string().min(1).max(50),
    quote: z.string().min(5).max(200),
    result: z.string().max(100).optional(),
  })).max(3).optional(),
});
```

---

## 7. Extend `scopedDb` — Add to `lib/db/scoped.ts`

Add imports at the top:
```typescript
import { funnels, funnelLeads } from "@/lib/db/schema/funnels";
import type { Funnel, NewFunnel, FunnelLead, NewFunnelLead } from "@/lib/db/schema/funnels";
```

Add `funnels` namespace to `scopedDb()` return object:

```typescript
funnels: {
  // ── Funnel CRUD ──────────────────────────────────────────────────────
  create: async (data: Omit<NewFunnel, "accountId"|"id"|"createdAt"|"updatedAt">)
    => Promise<Funnel | undefined>

  get: async (id: string) => Promise<Funnel | undefined>
    // WHERE id = ? AND account_id = accountId

  getByPathSlug: async (pathSlug: string) => Promise<Funnel | undefined>
    // WHERE path_slug = ? AND account_id = accountId

  update: async (id: string, data: Partial<NewFunnel>) => Promise<Funnel | undefined>
    // WHERE id = ? AND account_id = accountId

  delete: async (id: string) => Promise<void>
    // WHERE id = ? AND account_id = accountId
    // Guard: throw if status = 'published' (must unpublish first)

  list: async () => Promise<Funnel[]>
    // ORDER BY created_at DESC

  publish: async (id: string) => Promise<Funnel | undefined>
    // Sets status = 'published', published_at = NOW() if null
    // WHERE id = ? AND account_id = accountId

  unpublish: async (id: string) => Promise<Funnel | undefined>
    // Sets status = 'draft'
    // WHERE id = ? AND account_id = accountId

  // ── Leads ─────────────────────────────────────────────────────────────
  createLead: async (data: Omit<NewFunnelLead, "accountId"|"id"|"submittedAt">)
    => Promise<FunnelLead | undefined>

  listLeads: async (funnelId: string, limit?: number) => Promise<FunnelLead[]>
    // WHERE funnel_id = ? AND account_id = accountId
    // ORDER BY submitted_at DESC

  updateLeadNotes: async (leadId: string, notes: string, contactedAt?: Date)
    => Promise<void>
    // WHERE id = ? AND account_id = accountId
    // Only updates: notes, contacted_at

  countLeadsToday: async (funnelId: string) => Promise<number>
    // COUNT WHERE funnel_id = ? AND account_id = accountId
    // AND DATE(submitted_at) = today

  countLeadsLastHourByIp: async (funnelId: string, ipAddress: string) => Promise<number>
    // COUNT WHERE funnel_id = ? AND ip_address = ?
    // AND submitted_at > NOW() - INTERVAL '1 hour'
    // Note: no account_id filter needed here — IP rate limit is per funnel
}
```

Also add `slug` methods to the existing `accounts` namespace in `scopedDb()`:
```typescript
// Add to scopedDb accounts namespace:
setSlug: async (slug: string) => Promise<void>
  // UPDATE SET slug = ? WHERE id = accountId
  // Guard: if already has a slug AND has published funnels → throw "Cannot change slug after publishing"
```

---

## 8. Public Funnel Lookup

Create `lib/funnels/public.ts` — for use ONLY in public (unauthenticated) pages.
This is NOT part of scopedDb (no auth context). It reads directly from the DB.
Always explicitly filter `status = 'published'` — never serve draft funnels publicly.

```typescript
import { db } from "@/lib/db";
import { accounts } from "@/lib/db/schema/accounts";
import { funnels } from "@/lib/db/schema/funnels";
import { and, eq } from "drizzle-orm";
import type { Funnel } from "@/lib/db/schema/funnels";
import type { Account } from "@/lib/db/schema/accounts";

export type PublicFunnelData = {
  funnel: Funnel;
  accountName: string;
  accountSlug: string;
};

/**
 * Load a published funnel for public display.
 * Returns null if: account not found, account inactive, funnel not found, funnel is draft.
 */
export async function getPublicFunnel(
  accountSlug: string,
  pathSlug: string = ""  // empty string = root path
): Promise<PublicFunnelData | null> {
  // Step 1: find account by slug
  const [account] = await db
    .select({ id: accounts.id, name: accounts.name, isActive: accounts.isActive, slug: accounts.slug })
    .from(accounts)
    .where(and(eq(accounts.slug, accountSlug), eq(accounts.isActive, true)))
    .limit(1);

  if (!account) return null;

  // Step 2: find published funnel
  const [funnel] = await db
    .select()
    .from(funnels)
    .where(
      and(
        eq(funnels.accountId, account.id),
        eq(funnels.pathSlug, pathSlug),
        eq(funnels.status, "published")  // ALWAYS filter — never serve drafts
      )
    )
    .limit(1);

  if (!funnel) return null;

  return { funnel, accountName: account.name, accountSlug: account.slug ?? accountSlug };
}

/**
 * Submit a lead for a public funnel (no auth).
 * Returns null on rate limit exceeded.
 * Caller is responsible for rate limit check before calling this.
 */
export async function submitPublicLead(data: {
  funnelId: string;
  accountId: string;
  name: string;
  whatsappNumber: string;
  email?: string;
  ipAddress: string;
  userAgent: string;
}): Promise<{ id: string } | null> {
  const [lead] = await db
    .insert(funnelLeads)
    .values({
      ...data,
      submittedAt: new Date(),
    })
    .returning({ id: funnelLeads.id });
  return lead ?? null;
}
```

---

## 9. wa.me URL Generator

Create `lib/funnels/whatsapp.ts`:

```typescript
/**
 * Generate a wa.me link for WhatsApp redirect.
 * No WhatsApp Business API — just a deep link.
 *
 * Phone number normalisation:
 * - Remove all non-digits
 * - If starts with 0 and is Malaysian (10-11 digits after removing 0): prepend 60
 * - If starts with 60: keep as is
 * - Otherwise: keep as is (international numbers)
 */

export function normaliseWhatsAppNumber(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.startsWith("60")) return digits;
  if (digits.startsWith("0") && digits.length >= 10 && digits.length <= 11) {
    return "60" + digits.slice(1);
  }
  return digits;
}

export function buildWaLink(phoneNumber: string, preFillMessage?: string): string {
  const normalised = normaliseWhatsAppNumber(phoneNumber);
  const base = `https://wa.me/${normalised}`;
  if (!preFillMessage) return base;
  return `${base}?text=${encodeURIComponent(preFillMessage)}`;
}

// Validate: Malaysian mobile numbers are 10-11 digits after normalisation
export function isValidMalaysianNumber(normalised: string): boolean {
  return /^60[0-9]{8,10}$/.test(normalised);
}
```

---

## 10. AI Content Assist

Create `lib/funnels/ai-assist.ts`:

```typescript
/**
 * Generate funnel page copy using Claude Sonnet.
 * Uses Voice Profile + Why Story from Voice Capture as source material.
 * Returns a FunnelContent object — user must edit before publishing.
 */
```

The prompt:
```
You are helping a Herbalife Malaysia distributor write a personal story page for
their attraction marketing funnel. The page should feel authentic, warm, and personal
— not like an ad. Use their actual words and experiences from their voice recordings.

COMPLIANCE RULES — never violate these:
- No income amounts or income opportunity claims
- No specific weight loss numbers
- No medical or health cure claims
- No guaranteed results
- Personal experience only, framed as "for me" not "this will happen for you"

Distributor info:
- Name: {accountName}
- Experience level: {distributorSeniority}
- Funnel type: {funnelType}

Their Why Story (from voice recording):
---
{whyStoryTranscript ?? "Not yet recorded — write based on funnel type and seniority."}
---

Their communication style:
{voiceProfile ? JSON.stringify(voiceProfile, null, 2) : "Warm, conversational Malaysian English."}

Generate a FunnelContent JSON object. Output ONLY valid JSON matching this exact schema
(no markdown, no explanation):
{
  "headline": "...",          // max 100 chars, first-person hook
  "subheadline": "...",       // max 200 chars, what they offer/share
  "storyBlocks": [
    { "type": "paragraph", "text": "..." },
    { "type": "highlight", "text": "..." },  // a memorable quote or moment
    { "type": "paragraph", "text": "..." }
  ],
  "leadForm": {
    "heading": "...",
    "subheading": "...",
    "fields": ["name", "whatsapp"],
    "submitLabel": "..."
  },
  "socialProof": []  // leave empty — user fills this manually
}
```

Parse Claude's response with `funnelContentSchema.safeParse()`.
If parse fails → return a sensible default `FunnelContent` skeleton with placeholder text.
Never throw — always return something the user can edit.

---

## 11. API Routes

### POST `/api/account/slug`
**Auth:** `getAccountFromSession()`

Request body:
```typescript
z.object({ slug: accountSlugSchema })
```

Logic:
1. Check if slug already taken: `db.select().from(accounts).where(eq(accounts.slug, slug))`
2. Check if account already has a published funnel (cannot change slug then)
3. `userDb.accounts.setSlug(slug)`
4. Return `{ ok: true, slug }`

### GET `/api/funnels`
**Auth:** `getAccountFromSession()`
Returns: `{ funnels: Funnel[] }` — all funnels for this account

### POST `/api/funnels`
**Auth:** `getAccountFromSession()`

Request body (Zod):
```typescript
z.object({
  title: z.string().min(1).max(100),
  funnelType: z.enum(FUNNEL_TYPES),
  pathSlug: z.string().max(50).regex(/^[a-z0-9-]*$/).default(""),
  contentJson: funnelContentSchema,
  ctaType: z.enum(CTA_TYPES),
  ctaValue: z.string().max(500).optional(),
  whatsappPreFill: z.string().max(300).optional(),
})
```

Guards:
- `pathSlug` uniqueness per account: check `userDb.funnels.getByPathSlug(pathSlug)` — return 409 if exists
- If `ctaType === "whatsapp"` → validate `ctaValue` is a valid phone number
- Run `runComplianceFilter()` on all text content extracted from `contentJson` (headline + subheadline + story blocks concatenated). If flagged → return 422 with flags. **Compliance check is mandatory before creation.**

Returns: `{ funnel: Funnel }` with 201

### GET `/api/funnels/[funnelId]`
**Auth:** `getAccountFromSession()`
Returns funnel or 404.

### PUT `/api/funnels/[funnelId]`
**Auth:** `getAccountFromSession()`

Same body schema as POST (all fields optional).
If content is updated → re-run compliance filter on new text.
If funnel is published → compliance must pass before saving.

### DELETE `/api/funnels/[funnelId]`
**Auth:** `getAccountFromSession()`

Guard: if status = 'published' → return 409 `{ error: "Unpublish the funnel before deleting." }`
Then hard-delete (cascades to leads automatically via FK).

### POST `/api/funnels/[funnelId]/publish`
**Auth:** `getAccountFromSession()`

Guards:
1. Account must have a `slug` set → return 400 if not
2. Funnel content must pass compliance filter → return 422 if flagged
3. Required fields present: headline, at least 1 story block, lead form heading

Sets `status = 'published'`, `published_at = NOW()` (if null).
Returns updated funnel.

### POST `/api/funnels/[funnelId]/unpublish`
**Auth:** `getAccountFromSession()`
Sets `status = 'draft'`. Returns updated funnel.

### POST `/api/funnels/[funnelId]/ai-assist`
**Auth:** `getAccountFromSession()`

Request body: `{ funnelType: z.enum(FUNNEL_TYPES) }`

Loads voice data (profile + why story) → calls `generateFunnelContent()` from
`lib/funnels/ai-assist.ts` → returns `{ content: FunnelContent }`.
Does NOT save to DB — user reviews and saves manually via PUT.

### GET `/api/funnels/[funnelId]/leads`
**Auth:** `getAccountFromSession()`
Query: `limit?: number` (default 50)
Returns: `{ leads: FunnelLead[], total: number }`

### PATCH `/api/funnels/[funnelId]/leads/[leadId]`
**Auth:** `getAccountFromSession()`

Request body:
```typescript
z.object({
  notes: z.string().max(1000).optional(),
  contactedAt: z.string().datetime().optional(),
})
```

Only updates `notes` and `contacted_at`. Returns updated lead.

### POST `/api/public/funnel-leads`
**NO AUTH** — public endpoint for lead form submissions.

Request body:
```typescript
z.object({
  funnelId: z.string().uuid(),
  accountSlug: z.string(),      // for looking up account
  name: z.string().min(1).max(100),
  whatsappNumber: z.string().min(8).max(20),
  email: z.string().email().optional(),
})
```

Logic:
1. Load funnel: `getPublicFunnel(accountSlug, pathSlug)` — must be published
2. Rate limit check via DB:
   - `countLeadsLastHourByIp(funnelId, ipAddress) >= 5` → return 429
   - `countLeadsToday(funnelId) >= 200` → return 429
3. Normalise WhatsApp number: `normaliseWhatsAppNumber(whatsappNumber)`
4. Validate Malaysian number (warn but don't block international): log if invalid
5. Insert lead: `submitPublicLead({ funnelId, accountId, name, whatsappNumber: normalised, email, ipAddress, userAgent })`
6. Build redirect data:
   - `ctaType === "whatsapp"` → `{ action: "redirect", url: buildWaLink(ctaValue, whatsappPreFill) }`
   - `ctaType === "custom_url"` → `{ action: "redirect", url: ctaValue }`
   - `ctaType === "thank_you"` → `{ action: "message", message: ctaValue }`
7. Return: `{ ok: true, cta: { action, url?, message? } }`

Get IP from `request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown"`.

Add to `middleware.ts` matcher — ensure `/api/public/*` is NOT in auth-protected paths.
Check `PUBLIC_PREFIXES` in middleware.ts and add `"/api/public/"` if not present.

---

## 12. Public Funnel Pages (No Auth)

### `app/funnel/[accountSlug]/page.tsx` — Root funnel (`{slug}.yourteam.com/`)
### `app/funnel/[accountSlug]/[pathSlug]/page.tsx` — Sub-path funnel

Both are Server Components with no auth requirement.

**Root page logic:**
```typescript
const data = await getPublicFunnel(params.accountSlug, "");
if (!data) notFound();
```

**Sub-path page logic:**
```typescript
const data = await getPublicFunnel(params.accountSlug, params.pathSlug);
if (!data) notFound();
```

Both render `<PublicFunnelView funnel={data.funnel} accountName={data.accountName} />`

### Component: `app/funnel/_components/public-funnel-view.tsx`
Client component (needs state for form submission).

**Layout:**
```
┌─────────────────────────────────────┐
│ [Cover image — full width, 300px]   │
├─────────────────────────────────────┤
│ Headline                            │
│ Subheadline                         │
├─────────────────────────────────────┤
│ Story Block 1 (paragraph)           │
│                                     │
│ ┌─────────────────────────────────┐ │
│ │ Highlight block (bordered box)  │ │
│ └─────────────────────────────────┘ │
│                                     │
│ Story Block 2 (paragraph)           │
├─────────────────────────────────────┤
│ Social Proof (if any)               │
│ "Name — quote"                      │
├─────────────────────────────────────┤
│ Lead Form                           │
│ Heading                             │
│ [Name input]                        │
│ [WhatsApp number input]             │
│ [Email input — if enabled]          │
│ [Submit button]                     │
├─────────────────────────────────────┤
│ Footer: "Powered by President Tools" │
│ Compliance: "This page is operated  │
│ by an independent Herbalife         │
│ distributor, not Herbalife Ltd."    │
└─────────────────────────────────────┘
```

**Form submission flow:**
1. Client calls `POST /api/public/funnel-leads`
2. On success: handle CTA response
   - `action === "redirect"` → `window.location.href = url`
   - `action === "message"` → show thank-you message in place of form
3. On 429: show "You've already submitted recently. We'll be in touch!"
4. On other error: show "Something went wrong. Please try again."

**Styling:** Clean, mobile-first. Max width 500px, centered. No Tailwind dark mode
(public pages are always light). Large readable fonts (18px body). Generous padding.
No navigation bar. No admin chrome.

### `app/funnel/[accountSlug]/not-found.tsx`
Custom 404 for funnel subdomain:
```
"This page isn't active yet."
```
No link back to app — this is a public page.

---

## 13. Authenticated Builder UI

### Page: `app/(app)/funnels/page.tsx`
Server Component. Lists all user funnels.
If account has no slug → show slug setup prompt before listing funnels.

**Layout:**
```
Funnels                         [+ New Funnel]

┌──────────────────────────────────────────┐
│ Main Wellness Funnel          Published  │
│ yourteam.com/sherry/          2 leads    │
│ [Edit]  [Leads]  [Preview]  [Unpublish]  │
├──────────────────────────────────────────┤
│ Business Story                Draft      │
│ yourteam.com/sherry/business  —          │
│ [Edit]  [Leads]  [Preview]  [Publish]    │
└──────────────────────────────────────────┘

Your funnel address: sherry.yourteam.com
```

### Page: `app/(app)/funnels/new/page.tsx`
Step 1: choose funnel type (4 cards with icons + descriptions).
Step 2: set path slug (empty = root, or type a custom path).
Step 3: "Generate with AI" or "Start from template" → redirects to editor.

### Page: `app/(app)/funnels/[funnelId]/edit/page.tsx`
The main funnel editor. Split-panel on desktop:

```
LEFT: Form controls          RIGHT: Live preview (iframe or re-render)
─────────────────────────────────────────────────────────────────────
Headline [text input]        [Funnel page live preview]
Subheadline [text input]

Story Blocks:
  + Add paragraph
  + Add highlight
  + Add image
  [Drag to reorder]

Lead Form:
  Heading [text]
  Fields: [✓] Name [✓] WhatsApp [ ] Email
  Submit label [text]

Social Proof (optional):
  + Add quote

CTA After Submit:
  ○ WhatsApp redirect  ○ Custom URL  ○ Thank you message
  [CTA value input]
  [Pre-fill message input]

[Generate with AI] (calls /ai-assist → populates fields)
[Check Compliance] [Save Draft] [Publish]
```

### Page: `app/(app)/funnels/[funnelId]/leads/page.tsx`
Leads table with:
- Lead row: name, WhatsApp (with wa.me link icon), email, date, notes field, "Contacted" checkbox
- Export as CSV button (client-side, from fetched data — no API route needed)
- Summary: total leads, leads this week, contacted count

### Component: `app/(app)/funnels/_components/funnel-slug-setup.tsx`
Shown when account has no slug. Input + validate + save.
Shows what the URL will look like: `{input}.yourteam.com`

### Update sidebar: `app/(app)/_components/app-sidebar.tsx`
Set `available: true` for Funnels nav item.

---

## 14. Compliance on Funnel Content

Funnel text must pass compliance before publish. Extract all text from `contentJson`:

```typescript
function extractFunnelText(content: FunnelContent): string {
  const parts = [
    content.headline,
    content.subheadline,
    ...content.storyBlocks
      .filter(b => b.type !== "image")
      .map(b => (b as { text: string }).text),
    content.leadForm.heading,
    content.leadForm.subheading ?? "",
    ...(content.socialProof?.map(s => `${s.quote} ${s.result ?? ""}`) ?? []),
  ];
  return parts.join(" ");
}
```

Pass this to `runComplianceFilter(text, accountId, draftId)` using the funnel ID as
the draftId (the function signature accepts any string ID — it's just for logging).

If compliance fails → do not publish. Return flags to UI for the user to fix.

---

## 15. Rules & Constraints

### R1: Account Isolation (absolute)
Every DB query that touches `funnels` or `funnel_leads` must go through
`scopedDb(accountId)` — EXCEPT:
- `getPublicFunnel()` in `lib/funnels/public.ts` — intentionally public, documented
- `submitPublicLead()` in `lib/funnels/public.ts` — intentionally public, documented

Mark those two files with a top-of-file comment:
```typescript
/**
 * PUBLIC — no account scope. Accessible without authentication.
 * All queries explicitly filter by status = 'published' or use explicit IDs.
 */
```

### R2: Draft funnels are never publicly accessible
`getPublicFunnel()` always includes `AND status = 'published'` in the WHERE clause.
This is defence-in-depth alongside the RLS policy.
Do not add a "preview by ID" route that bypasses this.

Authenticated preview: `app/(app)/funnels/[funnelId]/preview/page.tsx` — renders
the funnel page using the stored `contentJson` but does NOT use `getPublicFunnel()`.
It loads via `userDb.funnels.get(funnelId)` — authenticated, any status.

### R3: No marketing API integrations
- No WhatsApp Business API — only `wa.me` deep links
- No Facebook Pixel, Google Analytics, or any tracking scripts on public pages
- No email automation — leads are stored in DB, manually followed up
- No SMS sending
- `cta_value` for custom_url: validate it starts with `https://` only (no `http://`)

### R4: Compliance before publish (mandatory)
`POST /api/funnels/[funnelId]/publish` MUST run compliance filter.
Cannot be bypassed. If it's already been checked and content hasn't changed,
use the last check result (stored in funnel — add `compliance_checked_at` and
`compliance_status` columns to funnels table, see below).

Add to funnels schema:
```typescript
complianceStatus: text("compliance_status").default("unchecked"),  // 'unchecked'|'passed'|'flagged'
complianceCheckedAt: timestamp("compliance_checked_at", { withTimezone: true }),
```

On content update (PUT) → reset `complianceStatus = 'unchecked'`.
On publish → if `complianceStatus !== 'passed'` → run filter first.

### R5: Phone number handling (PDPA)
WhatsApp numbers are personal data under Malaysia's PDPA.
- Store normalised (digits only with country code)
- Never log phone numbers to console
- Do NOT expose phone numbers in API responses to non-owners
  (the leads API is auth-protected, so this is naturally handled)
- `ip_address` in funnel_leads is for rate limiting only — never display to distributor in UI

### R6: TypeScript strict
- `noUncheckedIndexedAccess` ON — always `?.[0]` for array access
- No `any` — use `unknown` with Zod parse
- All Zod schemas in `lib/validators/funnels.ts`
- All funnel content types in `lib/funnels/types.ts`

### R7: Path slug is immutable after publish
If a funnel has ever been published (`published_at IS NOT NULL`), its `path_slug`
cannot be changed — that would break inbound links.
Guard in PUT handler: if `published_at !== null && data.pathSlug !== funnel.pathSlug` → return 409.

---

## 16. Tests Required

Create `tests/funnel-builder.test.ts`:

1. **Slug validation — valid slugs pass**: `"sherry"`, `"my-team"`, `"wellness2026"` → valid
2. **Slug validation — invalid slugs rejected**: `"Sherry"` (uppercase), `"-start"` (leading hyphen), `"ab"` (too short), `"www"` (reserved) → all invalid
3. **WhatsApp normalisation — Malaysian local**: `"0123456789"` → `"60123456789"`
4. **WhatsApp normalisation — already international**: `"60123456789"` → `"60123456789"`
5. **wa.me URL generation — with pre-fill**: `buildWaLink("60123456789", "Hi!")` → `"https://wa.me/60123456789?text=Hi!"`
6. **wa.me URL generation — without pre-fill**: `buildWaLink("60123456789")` → `"https://wa.me/60123456789"`
7. **getPublicFunnel — returns null for draft**: mock db returns draft funnel → result is null
8. **getPublicFunnel — returns data for published**: mock db returns published funnel → result has funnel data
9. **Lead rate limit — blocks >5 per hour**: `countLeadsLastHourByIp` returns 5 → API returns 429
10. **Lead rate limit — blocks >200 per day**: `countLeadsToday` returns 200 → API returns 429
11. **FunnelContent schema — valid content passes**: complete FunnelContent object → Zod parse succeeds
12. **FunnelContent schema — missing headline rejected**: → Zod parse fails
13. **extractFunnelText — concatenates all text blocks**: all text blocks appear in output
14. **Account isolation — funnel belongs to account**: `get(id)` returns undefined when called with wrong accountId
15. **Compliance blocks publish**: funnel with income claim in story → publish returns 422

Target: 15 new tests. Total with previous: 37 + 15 = **52 tests**.

---

## 17. File Checklist

```
lib/
  db/
    schema/
      accounts.ts         ← UPDATE (add slug column + slugIdx)
      funnels.ts          ← NEW
      index.ts            ← UPDATE (add funnels export)
    scoped.ts             ← UPDATE (add funnels namespace + accounts.setSlug)
  funnels/
    types.ts              ← NEW (FunnelContent, StoryBlock, SocialProofItem types)
    public.ts             ← NEW (getPublicFunnel, submitPublicLead)
    whatsapp.ts           ← NEW (normaliseWhatsAppNumber, buildWaLink, isValidMalaysianNumber)
    ai-assist.ts          ← NEW (generateFunnelContent)
  validators/
    funnels.ts            ← NEW (funnelContentSchema, accountSlugSchema, FUNNEL_TYPES, CTA_TYPES)

drizzle/
  0004_account_slug.sql   ← NEW (ALTER accounts ADD slug)
  0005_funnels.sql        ← NEW (funnels + funnel_leads tables + RLS)

middleware.ts             ← UPDATE (add "/api/public/" to PUBLIC_PREFIXES)

app/
  funnel/
    [accountSlug]/
      page.tsx            ← NEW (root funnel public page)
      not-found.tsx       ← NEW
      [pathSlug]/
        page.tsx          ← NEW (sub-path funnel public page)
    _components/
      public-funnel-view.tsx  ← NEW (client component — the actual funnel UI)

  (app)/
    funnels/
      page.tsx            ← NEW (list funnels)
      new/
        page.tsx          ← NEW (create funnel wizard)
      [funnelId]/
        edit/
          page.tsx        ← NEW (funnel editor)
        preview/
          page.tsx        ← NEW (authenticated preview — any status)
        leads/
          page.tsx        ← NEW (leads table)
      _components/
        funnel-slug-setup.tsx   ← NEW
        funnel-card.tsx         ← NEW (for list page)
        funnel-editor-form.tsx  ← NEW (the edit form)
        lead-table.tsx          ← NEW

  api/
    account/
      slug/route.ts       ← NEW (POST set slug)
    funnels/
      route.ts            ← NEW (GET list, POST create)
      [funnelId]/
        route.ts          ← NEW (GET, PUT, DELETE)
        publish/route.ts  ← NEW
        unpublish/route.ts← NEW
        ai-assist/route.ts← NEW
        leads/
          route.ts        ← NEW (GET leads)
          [leadId]/route.ts← NEW (PATCH notes)
    public/
      funnel-leads/route.ts← NEW (POST — no auth)

  (app)/
    _components/
      app-sidebar.tsx     ← UPDATE (Funnels available: true)

tests/
  funnel-builder.test.ts  ← NEW
```

---

## 18. Definition of Done

- [ ] `npx tsc --noEmit` → 0 errors
- [ ] `npx vitest run` → 52 tests pass (37 existing + 15 new)
- [ ] `npx drizzle-kit generate` → generates 0004 and 0005 without errors
- [ ] `npx next build` → build succeeds
- [ ] Public funnel page at `/funnel/test-slug` renders for a published funnel (verify with curl or browser)
- [ ] Public funnel page returns 404 for draft funnels
- [ ] Lead submission on public page does NOT require auth cookies
- [ ] Lead rate limit (5/hour/IP) enforced at API level
- [ ] Publish blocked if account has no slug
- [ ] Publish blocked if compliance not passed
- [ ] Phone numbers NOT logged to console anywhere
- [ ] `/api/public/funnel-leads` is in PUBLIC_PREFIXES (middleware won't block it)
- [ ] Funnel slug cannot be changed after `published_at` is set
- [ ] Funnels nav item `available: true` in sidebar
- [ ] Footer on public pages: "Independent Herbalife distributor" disclaimer

---

## 19. Start Order (Recommended Sequence)

1. `lib/funnels/types.ts` (types first — everything imports from here)
2. `lib/validators/funnels.ts` (Zod schemas)
3. `lib/db/schema/accounts.ts` (add slug field)
4. `lib/db/schema/funnels.ts`
5. `lib/db/schema/index.ts` (update exports)
6. `drizzle/0004_account_slug.sql`
7. `drizzle/0005_funnels.sql`
8. `lib/db/scoped.ts` (add funnels namespace + setSlug)
9. `lib/funnels/whatsapp.ts` (pure functions, no deps)
10. `lib/funnels/public.ts` (DB access, no auth)
11. `lib/funnels/ai-assist.ts` (Claude integration)
12. `middleware.ts` (add `/api/public/` to PUBLIC_PREFIXES)
13. API routes: account/slug → funnels (CRUD) → publish/unpublish → ai-assist → leads → public/funnel-leads
14. `app/funnel/` public pages + `public-funnel-view.tsx` component
15. `app/(app)/funnels/` builder pages + components
16. Update sidebar
17. `tests/funnel-builder.test.ts`
18. Final: `tsc --noEmit` + `vitest run` + `next build`
