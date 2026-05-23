# Codex Task Brief — Recorded Webinar System
# President Tools OS — Phase 6 (Week 7)
#
# HOW TO RUN:
#   codex --model o3 --approval-mode auto-edit "$(cat CODEX_WEBINAR.md)"
#
# PREREQUISITES:
#   - Phase 1 (Foundation) complete
#   - Phase 2 (Voice Capture) complete — webinar AI description uses voice profile
#   - Phase 3 (Content Studio) complete — compliance filter reused on metadata
#   - Phase 4 (Funnel Builder) complete — `event_rsvp` funnel type links here
#   - Phase 5 (Lead Magnet) complete — same registration-gate pattern extended
# IMPORTANT: Read every section before writing any code.

---

## 1. Mission

Build the **Recorded Webinar System** — a tool that lets distributors share a
pre-recorded video training with prospects, gated behind a simple registration form.

This is an **honest evergreen** system. That means:
- The video is clearly presented as a "recorded training" or "replay", never as a
  live event that's about to start.
- No fake countdown timers. No "only 12 seats left." No artificial scarcity.
- Visitors register → they immediately watch the replay → distributor follows up manually.

The flow:
1. **Admin** (Steven) uploads one master webinar video to Bunny.net Stream once.
   Sets the title, description, and chapter markers.
2. **Distributor** activates their webinar → gets a personalised registration page
   at `/webinar/{accountSlug}` with their name and WhatsApp on the confirmation screen.
3. **Visitor** lands on the registration page → fills name + WhatsApp → is redirected
   to the replay page → watches the embedded Bunny.net Stream video.
4. **Distributor** sees registrations in their dashboard and follows up manually via WhatsApp.

**Manual-first principle (non-negotiable):** There is NO email automation, NO
Zoom integration, NO live streaming, NO automated follow-up. The system captures
contact info and provides a watch URL. That is all.

---

## 2. Project Context

### Stack (do not change — already installed)
- Next.js 14 App Router + TypeScript strict + Tailwind + Drizzle ORM
- **Bunny.net Stream** — video hosting CDN. Embed via `<iframe>` player. No SDK needed.
- Supabase Auth — auth guard for distributor/admin UI; registration + replay pages are unauthenticated.
- Compliance Filter → `lib/compliance/filter.ts` — reuse on webinar title + description.

### Already built — do not re-implement
```
lib/db/scoped.ts               scopedDb(accountId) + adminDb
lib/auth/session.ts            getAccountFromSession(), requireAdmin()
lib/compliance/filter.ts       runComplianceFilter()
lib/funnels/whatsapp.ts        normaliseWhatsAppNumber(), buildWaLink()
lib/validators/funnels.ts      accountSlugSchema
lib/validators/magnets.ts      reference pattern for gate page validators
middleware.ts                  PUBLIC_PREFIXES already includes "/funnel/", "/magnet/"
```

### Bunny.net Stream embed pattern
Bunny.net provides an `<iframe>` embed URL per video:
```
https://iframe.mediadelivery.net/embed/{libraryId}/{videoId}?autoplay=false&responsive=true
```

The embed does NOT require any API key on the client side.
Environment variables needed:
```
BUNNY_STREAM_LIBRARY_ID=         # Bunny.net Stream library numeric ID (admin use only)
BUNNY_STREAM_API_KEY=            # Bunny.net API key (server-side admin only — NEVER expose to client)
```

**Admin operations** (upload/delete/list videos) use the Bunny.net Stream API:
- Base URL: `https://video.bunnycdn.com/library/{libraryId}/videos`
- Auth header: `AccessKey: {BUNNY_STREAM_API_KEY}`
- These are standard REST calls — use `fetch()` directly, no SDK needed.

**Visitor playback** — just an `<iframe>` embed. No API key required.

The `videoId` returned by Bunny.net after upload is the identifier stored in DB.

---

## 3. Database Schema

### 3a. Create `lib/db/schema/webinars.ts`

**`webinars`** — One active master per system (admin-managed). Same pattern as `lead_magnets`.
| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | gen_random_uuid() |
| title | TEXT NOT NULL | e.g. "Wellness Lifestyle Training — Replay" |
| description | TEXT NOT NULL | 2–4 sentences shown on registration page |
| bunny_video_id | TEXT NOT NULL | Bunny.net Stream videoId (returned after upload) |
| bunny_library_id | TEXT NOT NULL | Bunny.net Stream libraryId (matches env var) |
| thumbnail_url | TEXT | Optional. Bunny.net auto-generates one; can override. |
| duration_seconds | INTEGER | Video duration in seconds (shown as "90 min training") |
| is_active | BOOLEAN NOT NULL DEFAULT true | Only one active at a time |
| created_at | TIMESTAMPTZ NOT NULL DEFAULT now() |
| updated_at | TIMESTAMPTZ NOT NULL DEFAULT now() |

Index: `(is_active)`.

**`account_webinars`** — Per-distributor activation.
| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| account_id | UUID NOT NULL UNIQUE | FK → accounts.id ON DELETE CASCADE. One row per account. |
| webinar_id | UUID NOT NULL | FK → webinars.id |
| custom_intro | TEXT | Optional personal intro shown above registration form (max 300 chars). Distributor writes this. |
| is_active | BOOLEAN NOT NULL DEFAULT true | |
| created_at | TIMESTAMPTZ NOT NULL DEFAULT now() |
| updated_at | TIMESTAMPTZ NOT NULL DEFAULT now() |

Indexes: `(account_id)`, `(webinar_id)`.

**`webinar_registrations`** — Append-only. Visitor contact captures.
| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| account_id | UUID NOT NULL | FK → accounts.id ON DELETE CASCADE |
| account_webinar_id | UUID NOT NULL | FK → account_webinars.id ON DELETE CASCADE |
| name | TEXT NOT NULL | |
| whatsapp_number | TEXT NOT NULL | Normalised |
| email | TEXT | Optional |
| watch_token | TEXT NOT NULL UNIQUE | Random token giving access to replay page. `nanoid(32)`. |
| watched_at | TIMESTAMPTZ | Set on first replay page load |
| ip_address | TEXT | Rate limiting only |
| user_agent | TEXT | |
| registered_at | TIMESTAMPTZ NOT NULL DEFAULT now() |

Indexes: `(account_id)`, `(account_webinar_id)`,
`(account_webinar_id, registered_at DESC)`,
`(watch_token)` — for replay page lookup,
`(ip_address, account_webinar_id, registered_at)` — rate limiting.

### 3b. Update `lib/db/schema/index.ts`
Add: `export * from "./webinars";`

### 3c. Migration `drizzle/0007_webinars.sql`
Full migration:
- All three tables with columns and indexes
- RLS enabled on all three
- `webinars` RLS:
  - SELECT: any authenticated user (distributors need to read the active webinar)
  - INSERT/UPDATE/DELETE: admin only
- `account_webinars` RLS:
  - SELECT: own account OR admin
  - INSERT/UPDATE: own account OR admin
  - DELETE: admin only
- `webinar_registrations` RLS:
  - SELECT: own account OR admin (distributor sees their registrations)
  - INSERT: `WITH CHECK (true)` — anonymous visitors register without auth
  - UPDATE: own account OR admin (for setting `watched_at`)
  - DELETE: admin only
- Updated-at trigger on `webinars` and `account_webinars`

**The `webinar_registrations` INSERT policy allows public inserts.** Intentional.

---

## 4. Extend `scopedDb` — Add to `lib/db/scoped.ts`

Add imports:
```typescript
import { webinars, accountWebinars, webinarRegistrations } from "@/lib/db/schema/webinars";
import type {
  Webinar, AccountWebinar, WebinarRegistration,
  NewAccountWebinar, NewWebinarRegistration
} from "@/lib/db/schema/webinars";
```

Add `webinars` namespace to `scopedDb()`:

```typescript
webinars: {
  // ── Account Webinar (distributor activation) ──────────────────────────
  getActivation: async () => Promise<AccountWebinar | undefined>
    // SELECT WHERE account_id = accountId LIMIT 1

  activate: async (webinarId: string, customIntro?: string) => Promise<AccountWebinar>
    // Upsert by account_id. Sets is_active = true.

  updateCustomIntro: async (customIntro: string) => Promise<void>
    // UPDATE SET custom_intro = ? WHERE account_id = accountId

  deactivate: async () => Promise<void>
    // UPDATE SET is_active = false WHERE account_id = accountId

  // ── Registrations ─────────────────────────────────────────────────────
  listRegistrations: async (limit?: number) => Promise<WebinarRegistration[]>
    // WHERE account_id = accountId ORDER BY registered_at DESC LIMIT limit ?? 50

  markWatched: async (registrationId: string) => Promise<void>
    // UPDATE SET watched_at = NOW() WHERE id = ? AND account_id = accountId
    // Only if watched_at IS NULL (idempotent first-time mark)

  countRegistrationsLastHourByIp: async (accountWebinarId: string, ip: string) => Promise<number>
    // Count WHERE account_webinar_id = ? AND ip_address = ip
    // AND registered_at > NOW() - INTERVAL '1 hour'

  countRegistrationsToday: async () => Promise<number>
    // Count WHERE account_id = accountId AND DATE(registered_at) = today
}
```

Add to `adminDb`:
```typescript
webinars: {
  getActive: async () => Promise<Webinar | undefined>
    // SELECT WHERE is_active = true LIMIT 1

  create: async (data: Omit<NewWebinar, "id"|"createdAt"|"updatedAt">)
    => Promise<Webinar | undefined>

  update: async (id: string, data: Partial<Webinar>) => Promise<Webinar | undefined>

  deactivateAll: async () => Promise<void>
    // UPDATE SET is_active = false WHERE is_active = true

  listAccountActivations: async () => Promise<AccountWebinar[]>
    // All rows — admin dashboard
}
```

---

## 5. Public Webinar Lookup

Create `lib/webinars/public.ts`:

```typescript
/**
 * PUBLIC — no account scope. Accessible without authentication.
 * Checks is_active on both webinar and account_webinar rows.
 */
import { db } from "@/lib/db";
import { accounts } from "@/lib/db/schema/accounts";
import { webinars, accountWebinars, webinarRegistrations } from "@/lib/db/schema/webinars";
import { and, eq, gt, sql } from "drizzle-orm";
import { nanoid } from "nanoid";

export type PublicWebinarData = {
  webinarId: string;
  accountWebinarId: string;
  accountId: string;
  accountName: string;
  accountSlug: string;
  whatsappNumber: string | null;  // for post-watch CTA
  title: string;
  description: string;
  thumbnailUrl: string | null;
  durationSeconds: number | null;
  customIntro: string | null;
  // Do NOT expose bunny_video_id here — only after registration
};

/**
 * Load active webinar for a distributor account.
 * Returns null if: account not found/inactive, no activation, webinar not active.
 */
export async function getPublicWebinar(accountSlug: string): Promise<PublicWebinarData | null> {
  // NOTE: accounts table has no whatsappNumber column — derive from session data.
  // The distributor's WhatsApp comes from accounts.metadata or a separate column.
  // For now, return null for whatsappNumber and let the replay page use a generic CTA.
  // (See Section 11 — Distributor WhatsApp on Replay Page)
  const [row] = await db
    .select({
      webinarId: webinars.id,
      accountWebinarId: accountWebinars.id,
      accountId: accounts.id,
      accountName: accounts.name,
      accountSlug: accounts.slug,
      title: webinars.title,
      description: webinars.description,
      thumbnailUrl: webinars.thumbnailUrl,
      durationSeconds: webinars.durationSeconds,
      customIntro: accountWebinars.customIntro,
    })
    .from(accounts)
    .innerJoin(accountWebinars, and(
      eq(accountWebinars.accountId, accounts.id),
      eq(accountWebinars.isActive, true),
    ))
    .innerJoin(webinars, and(
      eq(webinars.id, accountWebinars.webinarId),
      eq(webinars.isActive, true),
    ))
    .where(and(
      eq(accounts.slug, accountSlug),
      eq(accounts.isActive, true),
    ))
    .limit(1);

  if (!row) return null;
  return { ...row, accountSlug: row.accountSlug ?? accountSlug, whatsappNumber: null };
}

/**
 * Register a visitor and return their unique watch token.
 * Returns null if rate limit exceeded (check before calling).
 */
export async function registerForWebinar(data: {
  accountId: string;
  accountWebinarId: string;
  name: string;
  whatsappNumber: string;
  email?: string;
  ipAddress: string;
  userAgent: string;
}): Promise<{ watchToken: string } | null> {
  const watchToken = nanoid(32);
  const [row] = await db
    .insert(webinarRegistrations)
    .values({ ...data, watchToken, registeredAt: new Date() })
    .returning({ watchToken: webinarRegistrations.watchToken });
  return row ? { watchToken: row.watchToken } : null;
}

/**
 * Load a registration by watch token (for the replay page).
 * Also returns the Bunny.net embed URL — ONLY exposed after valid token lookup.
 */
export type ReplayData = {
  registrationId: string;
  accountWebinarId: string;
  accountId: string;
  accountName: string;
  accountSlug: string;
  webinarTitle: string;
  bunnyEmbedUrl: string;  // constructed from bunny_video_id + bunny_library_id
  watchedAt: Date | null;
};

export async function getReplayByToken(watchToken: string): Promise<ReplayData | null> {
  const [row] = await db
    .select({
      registrationId: webinarRegistrations.id,
      accountWebinarId: webinarRegistrations.accountWebinarId,
      accountId: webinarRegistrations.accountId,
      accountName: accounts.name,
      accountSlug: accounts.slug,
      webinarTitle: webinars.title,
      bunnyVideoId: webinars.bunnyVideoId,
      bunnyLibraryId: webinars.bunnyLibraryId,
      watchedAt: webinarRegistrations.watchedAt,
    })
    .from(webinarRegistrations)
    .innerJoin(accountWebinars, eq(accountWebinars.id, webinarRegistrations.accountWebinarId))
    .innerJoin(webinars, eq(webinars.id, accountWebinars.webinarId))
    .innerJoin(accounts, eq(accounts.id, webinarRegistrations.accountId))
    .where(eq(webinarRegistrations.watchToken, watchToken))
    .limit(1);

  if (!row) return null;

  const bunnyEmbedUrl =
    `https://iframe.mediadelivery.net/embed/${row.bunnyLibraryId}/${row.bunnyVideoId}` +
    `?autoplay=false&responsive=true&captions=false`;

  return {
    registrationId: row.registrationId,
    accountWebinarId: row.accountWebinarId,
    accountId: row.accountId,
    accountName: row.accountName,
    accountSlug: row.accountSlug ?? "",
    webinarTitle: row.webinarTitle,
    bunnyEmbedUrl,
    watchedAt: row.watchedAt,
  };
}

/**
 * Rate limit check — registrations from this IP in last hour.
 */
export async function countRegistrationsLastHourByIp(
  accountWebinarId: string,
  ip: string
): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`COUNT(*)::int` })
    .from(webinarRegistrations)
    .where(and(
      eq(webinarRegistrations.accountWebinarId, accountWebinarId),
      eq(webinarRegistrations.ipAddress, ip),
      gt(webinarRegistrations.registeredAt, sql`NOW() - INTERVAL '1 hour'`),
    ));
  return row?.count ?? 0;
}
```

---

## 6. Validators

Create `lib/validators/webinars.ts`:

```typescript
import { z } from "zod";

export const WebinarMetaSchema = z.object({
  title: z.string().min(5).max(120),
  description: z.string().min(10).max(500),
  thumbnailUrl: z.string().url().optional().or(z.literal("")),
  durationSeconds: z.number().int().positive().max(14400).optional(),  // max 4 hours
});

export const WebinarRegistrationSchema = z.object({
  accountSlug: z.string().min(3).max(30),
  accountWebinarId: z.string().uuid(),
  name: z.string().min(1).max(100),
  whatsappNumber: z.string().min(8).max(20),
  email: z.string().email().optional().or(z.literal("")),
});

export const WebinarCustomIntroSchema = z.object({
  customIntro: z.string().max(300).optional().or(z.literal("")),
});
```

---

## 7. Bunny.net Stream Integration

Create `lib/webinars/bunny.ts` — server-side only. Never import on client.

```typescript
/**
 * Bunny.net Stream API client.
 * Server-side only — BUNNY_STREAM_API_KEY must never reach the browser.
 *
 * API docs: https://docs.bunny.net/reference/video_getvideo
 */

const BUNNY_API_BASE = "https://video.bunnycdn.com/library";

function getBunnyConfig() {
  const libraryId = process.env.BUNNY_STREAM_LIBRARY_ID;
  const apiKey = process.env.BUNNY_STREAM_API_KEY;
  if (!libraryId || !apiKey) {
    throw new Error("BUNNY_STREAM_LIBRARY_ID and BUNNY_STREAM_API_KEY must be set");
  }
  return { libraryId, apiKey };
}

function bunnyHeaders(apiKey: string) {
  return {
    "AccessKey": apiKey,
    "Content-Type": "application/json",
  };
}

export type BunnyVideo = {
  videoId: string;
  title: string;
  status: number;     // 0=Queued, 1=Processing, 2=Encoding, 3=Finished, 4=Error, 5=UploadFailed
  length: number;     // duration in seconds
  thumbnailFileName: string | null;
};

/**
 * Create a video entry in Bunny.net and get a TUS upload URL.
 * Returns the videoId and the direct upload URL (for server-side upload via tus or PUT).
 *
 * For simplicity, use the direct upload approach:
 * 1. Create video → get videoId
 * 2. Upload via PUT to: https://video.bunnycdn.com/library/{libraryId}/videos/{videoId}
 *    with body = raw file bytes and header: AccessKey
 */
export async function createBunnyVideo(title: string): Promise<{ videoId: string }> {
  const { libraryId, apiKey } = getBunnyConfig();
  const response = await fetch(`${BUNNY_API_BASE}/${libraryId}/videos`, {
    method: "POST",
    headers: bunnyHeaders(apiKey),
    body: JSON.stringify({ title }),
  });
  if (!response.ok) {
    throw new Error(`Bunny create video failed: ${response.status}`);
  }
  const data = (await response.json()) as { guid: string };
  return { videoId: data.guid };
}

/**
 * Get video upload URL for a given videoId.
 * Admin client uploads the file to this URL via PUT.
 * Returns the upload endpoint — client uses this directly.
 */
export function getBunnyUploadUrl(libraryId: string, videoId: string): string {
  return `${BUNNY_API_BASE}/${libraryId}/videos/${videoId}`;
}

/**
 * Fetch video metadata (status, duration, thumbnail) from Bunny.net.
 * Poll this after upload until status === 3 (Finished).
 */
export async function getBunnyVideo(videoId: string): Promise<BunnyVideo> {
  const { libraryId, apiKey } = getBunnyConfig();
  const response = await fetch(`${BUNNY_API_BASE}/${libraryId}/videos/${videoId}`, {
    headers: { "AccessKey": apiKey },
  });
  if (!response.ok) {
    throw new Error(`Bunny get video failed: ${response.status}`);
  }
  const data = (await response.json()) as {
    guid: string; title: string; status: number; length: number; thumbnailFileName: string | null;
  };
  return {
    videoId: data.guid,
    title: data.title,
    status: data.status,
    length: data.length,
    thumbnailFileName: data.thumbnailFileName,
  };
}

/**
 * Delete a video from Bunny.net.
 */
export async function deleteBunnyVideo(videoId: string): Promise<void> {
  const { libraryId, apiKey } = getBunnyConfig();
  await fetch(`${BUNNY_API_BASE}/${libraryId}/videos/${videoId}`, {
    method: "DELETE",
    headers: { "AccessKey": apiKey },
  });
}

/**
 * Build the public thumbnail CDN URL for a Bunny.net video.
 * Bunny.net auto-generates a thumbnail at this path once encoding is done.
 */
export function getBunnyThumbnailUrl(libraryId: string, videoId: string): string {
  return `https://vz-${libraryId}.b-cdn.net/${videoId}/thumbnail.jpg`;
}
```

Add to `.env.example`:
```
BUNNY_STREAM_LIBRARY_ID=
BUNNY_STREAM_API_KEY=
```

---

## 8. API Routes

### POST `/api/admin/webinars`
**Auth:** `requireAdmin()`

Creates a new webinar. JSON body: `WebinarMetaSchema`.

Logic:
1. Validate body with `WebinarMetaSchema`
2. Run `runComplianceFilter(title + " " + description, adminId, "webinar-meta")` → 422 if flagged
3. Admin confirms compliance checkbox in UI (same as lead magnet)
4. `createBunnyVideo(title)` → get `videoId`
5. `adminDb.webinars.deactivateAll()` (one active at a time)
6. `adminDb.webinars.create({ title, description, bunnyVideoId: videoId, bunnyLibraryId, thumbnailUrl, durationSeconds, isActive: true })`
7. Audit log: `"webinar.created"`
8. Return `{ webinar, uploadUrl: getBunnyUploadUrl(libraryId, videoId) }`

The client then uploads the video file directly to Bunny.net using the `uploadUrl`
with method PUT and header `AccessKey: {BUNNY_STREAM_API_KEY}`.

**Important:** The `BUNNY_STREAM_API_KEY` is needed for the direct upload PUT.
Since we cannot expose the API key to the browser, do one of:
- Option A (simpler): Admin uploads via the Bunny.net dashboard directly,
  then enters the `videoId` manually in the admin panel → skip the upload URL step.
- Option B (server proxy): Admin uploads file → client sends to `POST /api/admin/webinars/[id]/upload-chunk` → server streams to Bunny.net.

**Implement Option A first.** Admin creates the video in Bunny dashboard, copies
the videoId (it's in the video URL), pastes it into the admin form.
This avoids the complexity of streaming large video files through Vercel serverless
(50MB payload limit). Document this clearly in the admin UI.

Update `POST /api/admin/webinars` to accept `bunnyVideoId` directly in the body:
```typescript
const AdminWebinarSchema = WebinarMetaSchema.extend({
  bunnyVideoId: z.string().min(8, "Invalid Bunny.net video ID"),
  durationSeconds: z.number().int().positive().optional(),
});
```

### PUT `/api/admin/webinars/[webinarId]`
**Auth:** `requireAdmin()`
Updates title/description/thumbnail/duration. Re-runs compliance on metadata.
Does NOT change the videoId.

### POST `/api/admin/webinars/[webinarId]/status`
**Auth:** `requireAdmin()`
Polls Bunny.net for video processing status.
Returns `{ status: number, statusLabel: string, durationSeconds: number | null }`.
Used by admin UI to confirm encoding is complete before activating.

### POST `/api/webinars/activate`
**Auth:** `getAccountFromSession()`

Distributor activates their webinar page. Optionally includes `customIntro`.

Logic:
1. `adminDb.webinars.getActive()` → 404 if none
2. `userDb.webinars.activate(webinarId, data.customIntro)`
3. Audit log: `"webinar.activated"`
4. Return `{ ok: true, activation: AccountWebinar }`

### POST `/api/webinars/deactivate`
**Auth:** `getAccountFromSession()`
Sets `is_active = false`. Return `{ ok: true }`.

### PUT `/api/webinars/intro`
**Auth:** `getAccountFromSession()`
Body: `WebinarCustomIntroSchema`
Updates distributor's `custom_intro`. Return `{ ok: true }`.

### GET `/api/webinars/me`
**Auth:** `getAccountFromSession()`
Returns:
```typescript
{
  masterWebinar: Webinar | null;
  activation: AccountWebinar | null;
}
```

### GET `/api/webinars/registrations`
**Auth:** `getAccountFromSession()`
Query: `limit?: number` (default 50)
Returns: `{ registrations: WebinarRegistration[], total: number }`
**Important:** Strip `watchToken` from the response. Tokens are single-use access
credentials — the distributor does not need to see them.

### POST `/api/public/webinar-register`
**NO AUTH** — public endpoint.

Body: `WebinarRegistrationSchema`

Logic:
1. `getPublicWebinar(accountSlug)` — verify active, match `accountWebinarId`
2. Rate limit: `countRegistrationsLastHourByIp(accountWebinarId, ip) >= 5` → 429
3. Normalise WhatsApp: `normaliseWhatsAppNumber(data.whatsappNumber)`
4. `registerForWebinar({ accountId, accountWebinarId, name, whatsappNumber, email, ipAddress, userAgent })`
5. Build replay URL: `/webinar/{accountSlug}/watch/{watchToken}`
6. Return: `{ ok: true, replayUrl: string }`

Get IP: `request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown"`

### POST `/api/public/webinar-watched`
**NO AUTH** — called by the replay page on first load to mark `watched_at`.

Body: `{ watchToken: z.string() }`

Logic:
1. Load registration by `watchToken` — return 404 if not found
2. If `watched_at` is null → `db.update().set({ watchedAt: new Date() }).where(eq(watchToken, ...))`
   (direct DB call — no scopedDb needed, token is the credential)
3. Return `{ ok: true }`

---

## 9. Middleware Update

Add `/webinar/` to PUBLIC_PREFIXES in `middleware.ts`:
```typescript
const PUBLIC_PREFIXES = [
  "/invite/",
  "/funnel/",
  "/magnet/",
  "/webinar/",   // ← ADD THIS
  "/_next/",
  "/api/auth/",
  "/api/public/",
];
```

`/api/public/webinar-register` and `/api/public/webinar-watched` are already covered
by `/api/public/` prefix.

---

## 10. Public Pages

### Registration Page: `app/webinar/[accountSlug]/page.tsx`
Server Component. No auth.

```typescript
const data = await getPublicWebinar(params.accountSlug);
if (!data) notFound();
// Render registration form
```

Renders `<WebinarRegisterPage webinar={data} />` (client component).

### Replay Page: `app/webinar/[accountSlug]/watch/[watchToken]/page.tsx`
Server Component. No auth. The `watchToken` in the URL is the visitor's credential.

```typescript
const replay = await getReplayByToken(params.watchToken);
if (!replay) notFound();
// Mark as watched (non-blocking, fire-and-forget POST to /api/public/webinar-watched)
// Render the video player
```

Renders `<WebinarReplayPage replay={replay} />` (client component).

### `app/webinar/[accountSlug]/not-found.tsx`
```
"This training isn't available right now."
```

---

## 11. Public Page Components

### `app/webinar/_components/webinar-register-page.tsx`
Client component.

**Layout:**
```
┌─────────────────────────────────────┐
│ [Thumbnail image — optional]        │
├─────────────────────────────────────┤
│ RECORDED TRAINING                   │
│ {title}                             │
│ {durationLabel}  e.g. "90 min"     │
│                                     │
│ {description}                       │
│                                     │
│ {customIntro if set}                │
│ — {accountName}, Herbalife Distributor
├─────────────────────────────────────┤
│ Watch the free replay:              │
│                                     │
│ [Your Name]                         │
│ [WhatsApp Number]                   │
│ [Email — optional]                  │
│                                     │
│ [Watch Now →]                       │
└─────────────────────────────────────┘
│ Footer:                             │
│ Shared by {accountName}             │
│ Independent Herbalife Distributor   │
└─────────────────────────────────────┘
```

**"RECORDED TRAINING" label** — this is the "honest evergreen" label.
Always displayed. Non-negotiable. Never say "Live" or "Starting soon."

**Form submission flow:**
1. Client calls `POST /api/public/webinar-register`
2. On success → `router.push(replayUrl)` (client-side navigation to replay page)
3. On 429 → "You've already registered. Check your phone — your replay link was saved."
4. On error → "Something went wrong. Please try again."

**Duration label helper:**
```typescript
function formatDuration(seconds: number | null): string | null {
  if (!seconds) return null;
  const mins = Math.round(seconds / 60);
  if (mins < 60) return `${mins} min training`;
  const hours = Math.floor(mins / 60);
  const rem = mins % 60;
  return rem > 0 ? `${hours}h ${rem}min training` : `${hours}hr training`;
}
```

### `app/webinar/_components/webinar-replay-page.tsx`
Client component. Receives `ReplayData`.

**Layout:**
```
┌─────────────────────────────────────────┐
│ {webinarTitle}                          │
│ Recorded Training                       │
├─────────────────────────────────────────┤
│ ┌─────────────────────────────────────┐ │
│ │                                     │ │
│ │   Bunny.net Stream iframe embed     │ │
│ │   (aspect ratio 16:9, responsive)   │ │
│ │                                     │ │
│ └─────────────────────────────────────┘ │
├─────────────────────────────────────────┤
│ Ready to take the next step?            │
│ [WhatsApp {accountName}]                │
│ (links to wa.me/{distributorWhatsApp}   │
│  if available, else /funnel/{slug})     │
├─────────────────────────────────────────┤
│ Footer: Independent Herbalife Distributor│
└─────────────────────────────────────────┘
```

**iframe embed:**
```html
<div style="position: relative; padding-top: 56.25%;">
  <iframe
    src={replay.bunnyEmbedUrl}
    style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; border: none;"
    allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture;"
    allowfullscreen
  />
</div>
```

**Watched marking:** On component mount (useEffect), call `POST /api/public/webinar-watched`
with `{ watchToken }` (extract from URL). Fire and forget — no await, no error handling.

**CTA after video:** A simple WhatsApp button linking to the distributor.
Since `replayData` does not include the distributor's WhatsApp number (it's personal data
not relevant to the registration), show:
- If `accountSlug` is set: link to `/funnel/{accountSlug}` (their main funnel)
- Alternatively: `https://wa.me/` with a placeholder or omit entirely

For now: show button "Chat with {accountName} on WhatsApp" linking to:
`/funnel/{accountSlug}` — the funnel page will have the distributor's CTA.

**Styling:** Same as funnel and magnet public pages. Clean, mobile-first, light mode.
Max-width 640px (slightly wider to accommodate video player). No navigation.

---

## 12. Authenticated Builder UI

### Page: `app/(app)/webinars/page.tsx`
**Server Component.** Distributor's webinar dashboard.

Calls `GET /api/webinars/me`. Shows:

```
My Webinar Replay Page

┌────────────────────────────────────────────┐
│ [Thumbnail]  {title}                       │
│              {durationLabel}               │
│                                            │
│ Status:  ● Active   / ○ Inactive           │
│ Registrations this week: 8                 │
│ Watched (at least partly): 5               │
│ Total registrations: 31                    │
│                                            │
│ [Deactivate]  [Edit Intro]                 │
└────────────────────────────────────────────┘

Custom Intro (shown on your registration page):
┌────────────────────────────────────────────┐
│ [Textarea — max 300 chars]                 │
│ [Save Intro]                               │
└────────────────────────────────────────────┘

Public link: webinar/{accountSlug}
[Copy link]
```

If not activated → "Activate Your Webinar Page" button.
If admin hasn't set up a webinar → "No webinar available yet."
If account has no slug → "Set your funnel address first."

### Page: `app/(app)/webinars/registrations/page.tsx`
Registrations table:
- Columns: name, WhatsApp (wa.me link), email, registered date, watched (✓/—)
- Export CSV (client-side)
- **Do NOT show `watchToken`** in any UI

### Admin Page: `app/(admin)/admin/webinars/page.tsx`
Admin webinar management:

```
Webinar

Current Webinar:
  Title: {title}
  Bunny.net Video ID: {bunnyVideoId}
  Duration: {durationLabel}
  Status: Finished / Processing
  [Check Status]  [Edit Details]

Distributor Activations: 28 of 50

[+ Add New Webinar]
```

"Add New Webinar" form:
- Title, description, Bunny.net Video ID (admin copies from Bunny dashboard)
- Duration in minutes (manual entry)
- Compliance checkbox: "I confirm this webinar content complies with Herbalife Malaysia guidelines"
- [Create Webinar] button

Show clear instructions: "Upload your video in the Bunny.net Stream dashboard, then copy the
Video ID (it appears in the video URL) and paste it here."

### Update sidebar: `app/(app)/_components/app-sidebar.tsx`
Set `available: true` for Webinars nav item. It's already listed:
```typescript
{ label: "Webinars", href: "/webinars", icon: "🎥", available: false },
```
Change to `available: true`.

### Funnel Integration

When a funnel has `funnelType === "event_rsvp"`, the funnel CTA after lead submission
should redirect to the distributor's webinar registration page: `/webinar/{accountSlug}`.

In the funnel editor (`app/(app)/funnels/[funnelId]/edit/page.tsx`), when CTA type
is implicitly "event_rsvp":
- Show: "This funnel will send prospects to your Webinar registration page"
- Show URL: `webinar/{accountSlug}`
- If no active webinar → warning: "Activate your Webinar first at [Webinars → /webinars]"

In `POST /api/funnels/[funnelId]/publish` — if `funnelType === "event_rsvp"`:
- Verify distributor has an active `account_webinars` row → return 400 if not
  `{ error: "Activate your Webinar before publishing an Event RSVP funnel." }`

In `POST /api/public/funnel-leads` — if the funnel's `ctaType === "custom_url"` and
`ctaValue` starts with `/webinar/` → pass through as-is (it's an internal redirect).

---

## 13. Rules & Constraints

### R1: Account Isolation (absolute)
Every query on `account_webinars` or `webinar_registrations` scoped to a distributor
MUST use `scopedDb(accountId)` — EXCEPT:
- `lib/webinars/public.ts` — public, documented at top of file with `PUBLIC` comment
- `adminDb.webinars.*` — cross-account admin, marked at call sites

### R2: Watch tokens are single-use access credentials
- Never include `watchToken` in any API response that goes to the distributor
  (it belongs to the visitor, not the distributor)
- The token IS in the replay page URL — this is by design (visitor bookmarks/shares it)
- Token is 32 chars of `nanoid()` — sufficiently unguessable
- No expiry: once issued, the token is valid indefinitely (visitor can re-watch)

### R3: Bunny.net API key is server-side only
- `BUNNY_STREAM_API_KEY` must NEVER appear in any client-side code or API response
- `getBunnyConfig()` only callable in server context
- The `bunnyEmbedUrl` uses `iframe.mediadelivery.net` — this URL has no API key
- The `bunny_video_id` and `bunny_library_id` ARE safe to include in embed URLs
  (they're public identifiers, not secrets)

### R4: Honest evergreen — no fake live indicators
- "RECORDED TRAINING" label is mandatory on the registration page. Hard-coded in UI.
- No countdown timers, no "replay expires" messaging, no seat limits
- `description` compliance filter catches phrases like "join us live" if they slip in

### R5: No marketing API integrations
- No Zoom, no YouTube, no Vimeo — Bunny.net Stream only
- No email automation — registrants get the replay URL on screen, that's all
- No SMS — distributor follows up manually via WhatsApp

### R6: Large file upload advisory
Vercel serverless functions have a 50MB body limit.
Webinar videos are typically 100MB–2GB.
This is why admin uploads directly to Bunny.net dashboard (Option A).
Document this prominently in the admin UI — do not attempt to proxy video files
through Vercel API routes.

### R7: Compliance on metadata only
Same as lead magnet system — `runComplianceFilter` runs on title + description only,
not on video content. Admin is responsible for video compliance.

### R8: TypeScript strict
- No `any` — use `unknown` with Zod parse
- `noUncheckedIndexedAccess` ON
- All validators in `lib/validators/webinars.ts`

### R9: PDPA
WhatsApp numbers in `webinar_registrations` are personal data.
- Never log to console
- `ip_address` never shown in distributor UI
- Strip `watchToken` from distributor-facing list endpoints

---

## 14. Tests Required

Create `tests/webinar.test.ts`:

1. **getPublicWebinar — returns null for inactive account_webinar**: mock returns `is_active: false` → result is null
2. **getPublicWebinar — returns data for active webinar**: mock returns active row → PublicWebinarData returned
3. **Bunny embed URL format — correct structure**: `getReplayByToken` constructs URL as `https://iframe.mediadelivery.net/embed/{lib}/{vid}?autoplay=false&responsive=true&captions=false`
4. **registerForWebinar — generates 32-char watch token**: mock DB insert, check token is 32 chars
5. **Rate limit — blocks >5 registrations per hour per IP**: `countRegistrationsLastHourByIp` returns 5 → `POST /api/public/webinar-register` returns 429
6. **getReplayByToken — returns null for unknown token**: DB returns no row → null
7. **getReplayByToken — returns ReplayData for valid token**: DB returns row → ReplayData with bunnyEmbedUrl
8. **watchToken stripped from registrations API**: `GET /api/webinars/registrations` response has no `watchToken` field
9. **Duration formatting — under 60 minutes**: `formatDuration(45 * 60)` → `"45 min training"`
10. **Duration formatting — over 60 minutes**: `formatDuration(90 * 60)` → `"1h 30min training"`
11. **Account isolation — registrations scoped to account**: listRegistrations via `scopedDb("acct-A")` does NOT return rows from `acct-B`
12. **Funnel publish guard — event_rsvp requires active webinar**: funnel `funnelType: "event_rsvp"`, no activation → publish returns 400
13. **Compliance runs on webinar metadata**: webinar title with forbidden keyword → `POST /api/admin/webinars` returns 422
14. **Honest evergreen label — hardcoded in registration page**: component renders "RECORDED TRAINING" text (snapshot or render test)

Target: 14 new tests. Total: 64 + 14 = **78 tests**.

---

## 15. File Checklist

```
lib/
  db/
    schema/
      webinars.ts             ← NEW (webinars, account_webinars, webinar_registrations)
      index.ts                ← UPDATE (add webinars export)
    scoped.ts                 ← UPDATE (add webinars namespace to scopedDb + adminDb)
  webinars/
    bunny.ts                  ← NEW (Bunny.net Stream API client — server only)
    public.ts                 ← NEW (getPublicWebinar, getReplayByToken, registerForWebinar,
                                     countRegistrationsLastHourByIp)
  validators/
    webinars.ts               ← NEW (WebinarMetaSchema, WebinarRegistrationSchema,
                                     WebinarCustomIntroSchema)

drizzle/
  0007_webinars.sql           ← NEW

.env.example                  ← UPDATE (add BUNNY_STREAM_LIBRARY_ID, BUNNY_STREAM_API_KEY)

middleware.ts                 ← UPDATE (add "/webinar/" to PUBLIC_PREFIXES)

app/
  webinar/
    [accountSlug]/
      page.tsx                ← NEW (registration page — server component)
      not-found.tsx           ← NEW
      watch/
        [watchToken]/
          page.tsx            ← NEW (replay page — server component)
    _components/
      webinar-register-page.tsx ← NEW (client component — form)
      webinar-replay-page.tsx   ← NEW (client component — video player + CTA)

  (app)/
    webinars/
      page.tsx                ← NEW (distributor dashboard)
      registrations/
        page.tsx              ← NEW (registrations table)
    _components/
      app-sidebar.tsx         ← UPDATE (Webinars: available: true)

  (admin)/
    admin/
      webinars/
        page.tsx              ← NEW (admin webinar management)

  api/
    admin/
      webinars/
        route.ts              ← NEW (POST create)
        [webinarId]/
          route.ts            ← NEW (PUT update metadata)
          status/route.ts     ← NEW (POST — poll Bunny.net status)
    webinars/
      activate/route.ts       ← NEW (POST)
      deactivate/route.ts     ← NEW (POST)
      intro/route.ts          ← NEW (PUT)
      me/route.ts             ← NEW (GET)
      registrations/route.ts  ← NEW (GET — watchToken stripped)
    public/
      webinar-register/route.ts ← NEW (POST — no auth)
      webinar-watched/route.ts  ← NEW (POST — no auth, marks watched_at)

  (app)/
    funnels/
      [funnelId]/
        edit/
          page.tsx            ← UPDATE (event_rsvp CTA shows webinar link + warning)
        publish/route.ts      ← UPDATE (add event_rsvp guard check)

tests/
  webinar.test.ts             ← NEW
```

---

## 16. Definition of Done

- [ ] `npx tsc --noEmit` → 0 errors
- [ ] `npx vitest run` → 78 tests pass (64 existing + 14 new)
- [ ] `npx drizzle-kit generate` → generates 0007 without errors
- [ ] `npx next build` → build succeeds
- [ ] Registration page at `/webinar/test-slug` renders for active webinar
- [ ] Registration page returns 404 for no activation or inactive webinar
- [ ] "RECORDED TRAINING" label appears on registration page (never "Live")
- [ ] Replay page renders Bunny.net iframe after valid `watchToken`
- [ ] Replay page returns 404 for invalid token
- [ ] `watched_at` is set on first replay page load (fire-and-forget)
- [ ] `watchToken` does NOT appear in `GET /api/webinars/registrations` response
- [ ] `BUNNY_STREAM_API_KEY` does NOT appear in any client response
- [ ] Registration rate limit (5/hour/IP) enforced
- [ ] `event_rsvp` funnel publish blocked if no active webinar
- [ ] `/webinar/` added to PUBLIC_PREFIXES in middleware
- [ ] WhatsApp numbers NOT logged to console anywhere
- [ ] Webinars nav item `available: true` in sidebar
- [ ] `.env.example` updated with Bunny.net vars
- [ ] Admin UI clearly explains: upload video in Bunny.net dashboard, paste Video ID here

---

## 17. Start Order (Recommended Sequence)

1. `lib/db/schema/webinars.ts` (types first)
2. `lib/db/schema/index.ts` (add export)
3. `drizzle/0007_webinars.sql`
4. `lib/db/scoped.ts` (add webinars namespace to scopedDb + adminDb)
5. `lib/validators/webinars.ts` (Zod schemas)
6. `lib/webinars/bunny.ts` (Bunny.net API — no DB deps, pure functions)
7. `lib/webinars/public.ts` (public DB access — no auth deps)
8. `.env.example` update
9. `middleware.ts` (add "/webinar/" to PUBLIC_PREFIXES)
10. Admin API routes: `POST /api/admin/webinars` → `PUT` → `status`
11. Distributor API routes: `activate` → `deactivate` → `intro` → `me` → `registrations`
12. Public API routes: `POST /api/public/webinar-register` → `POST /api/public/webinar-watched`
13. Update `POST /api/funnels/[funnelId]/publish` (add `event_rsvp` guard)
14. `app/webinar/` public pages + components (`webinar-register-page.tsx`, `webinar-replay-page.tsx`)
15. `app/(app)/webinars/` distributor pages (dashboard + registrations)
16. `app/(admin)/admin/webinars/` admin page
17. Update sidebar (`app-sidebar.tsx`)
18. Update funnel editor (`event_rsvp` CTA UI)
19. `tests/webinar.test.ts`
20. Final: `tsc --noEmit` + `vitest run` + `next build`
