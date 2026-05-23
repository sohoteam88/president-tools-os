# Codex Task Brief — Lead Magnet System
# President Tools OS — Phase 5 (Week 6)
#
# HOW TO RUN:
#   codex --model o3 --approval-mode auto-edit "$(cat CODEX_LEAD_MAGNET.md)"
#
# PREREQUISITES:
#   - Phase 1 (Foundation) complete
#   - Phase 2 (Voice Capture) complete — personalisation uses account profile data
#   - Phase 3 (Content Studio) complete — compliance filter reused here
#   - Phase 4 (Funnel Builder) complete — lead magnets integrate with `free_resource` funnel type
# IMPORTANT: Read every section before writing any code.

---

## 1. Mission

Build the **Lead Magnet System** — a tool that lets distributors offer a
downloadable PDF guide to visitors, gated behind a simple contact form.

The flow:
1. **Admin** (Steven) uploads one master PDF template to R2 via the admin panel.
2. **Distributor** activates their lead magnet → system generates a personalised
   PDF with the distributor's name, WhatsApp number, and funnel URL overlaid
   using `pdf-lib`. Stored in R2 under their account prefix.
3. **Visitor** lands on `/magnet/{accountSlug}` (linked from funnel or shared
   directly) → sees a preview and a contact form → submits name + WhatsApp
   → receives a short-lived presigned download URL for the personalised PDF.

**Manual-first principle (non-negotiable):** There is NO email automation.
The download link is delivered as a redirect/button on the thank-you screen.
The visitor's contact info is stored in DB for the distributor to follow up
manually, exactly like funnel leads.

**Compliance principle:** The master PDF content is Steven's responsibility
to keep compliant. The system does NOT run the Compliance Filter on binary PDF
content — only on the metadata (title, description) that displays on the gate page.

---

## 2. Project Context

### Stack (do not change — already installed)
- Next.js 14 App Router + TypeScript strict + Tailwind + Drizzle ORM
- Cloudflare R2 → `lib/storage/r2.ts` already set up (presigned URLs, public CDN)
- `pdf-lib` → add to package.json: `"pdf-lib": "^1.17.1"` and `"@pdf-lib/fontkit": "^1.1.1"`
- Supabase Auth — auth guard for admin/distributor UI; public gate page is unauthenticated
- Compliance Filter → `lib/compliance/filter.ts` (runComplianceFilter) — reuse for metadata

### Already built — do not re-implement
```
lib/db/scoped.ts               scopedDb(accountId) + adminDb
lib/auth/session.ts            getAccountFromSession(), requireAdmin()
lib/storage/r2.ts              generateUploadPresignedUrl(), getPublicUrl(), deleteObject()
lib/compliance/filter.ts       runComplianceFilter() — use on magnet title + description
lib/funnels/whatsapp.ts        normaliseWhatsAppNumber(), buildWaLink()
lib/validators/funnels.ts      accountSlugSchema (reuse for slug validation)
middleware.ts                  PUBLIC_PREFIXES already includes "/api/public/"
```

### Existing R2 key conventions (from lib/storage/r2.ts)
```
Audio:  captures/{accountId}/{captureId}.webm
```
Follow the same pattern for PDFs:
```
magnets/master/{magnetId}.pdf          ← admin-uploaded template
magnets/personalised/{accountId}.pdf   ← distributor's personalised copy
```

---

## 3. How PDF Personalisation Works

The master PDF is a polished guide (nutrition tips, wellness lifestyle, business
mindset — compliant content only). Steven uploads it once.

When a distributor activates their lead magnet, the system uses `pdf-lib` to:
1. Load the master PDF bytes from R2
2. Register fontkit (for custom text embedding)
3. Find the LAST page → draw a "contact block" at the bottom margin:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Your Guide from: {account.name}
WhatsApp: {account.whatsappNumber}
Web:      {account.slug}.yourteam.com
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Independent Herbalife Distributor
```

4. Save the modified PDF bytes
5. Upload to R2 at `magnets/personalised/{accountId}.pdf`
6. Record `personalised_at` in DB

If the distributor has no WhatsApp on their account: use a sensible default
("WhatsApp: Contact via funnel page") — never fail hard, always produce a PDF.

If the master PDF changes (admin uploads a new version), all distributor
personalised PDFs are automatically invalidated (by checking `personalised_at`
< master PDF's `updated_at` — if stale, regenerate on next request or show
"Regenerate" button in UI).

### Dependencies to install
```bash
npm install pdf-lib @pdf-lib/fontkit
```

Add to `package.json` dependencies:
```json
"pdf-lib": "^1.17.1",
"@pdf-lib/fontkit": "^1.1.1"
```

---

## 4. Database Schema

### 4a. Create `lib/db/schema/magnets.ts`

**`lead_magnets`** — One active master per system (admin-managed).
| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | gen_random_uuid() |
| title | TEXT NOT NULL | Shown on gate page. e.g. "Your Free Wellness Starter Guide" |
| description | TEXT NOT NULL | 1–3 sentences. Shown on gate page. |
| thumbnail_url | TEXT | Optional R2 CDN URL for a cover image shown on gate page |
| master_pdf_key | TEXT NOT NULL | R2 object key e.g. `magnets/master/{id}.pdf` |
| version | INTEGER NOT NULL DEFAULT 1 | Increment on each admin re-upload |
| is_active | BOOLEAN NOT NULL DEFAULT true | Only one can be active. Admin UI enforces this. |
| created_at | TIMESTAMPTZ NOT NULL DEFAULT now() |
| updated_at | TIMESTAMPTZ NOT NULL DEFAULT now() |

Index: `(is_active)`.
Only one row where `is_active = true` expected at any time (enforced at app layer).

**`account_lead_magnets`** — Per-distributor activation + personalised PDF.
| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| account_id | UUID NOT NULL UNIQUE | FK → accounts.id ON DELETE CASCADE. One row per account. |
| lead_magnet_id | UUID NOT NULL | FK → lead_magnets.id |
| personalised_pdf_key | TEXT | R2 key `magnets/personalised/{accountId}.pdf`. Null = not yet generated. |
| personalised_at | TIMESTAMPTZ | When personalised PDF was last generated |
| master_version_at_personalisation | INTEGER | `lead_magnets.version` at time of generation — used to detect stale personalised PDFs |
| is_active | BOOLEAN NOT NULL DEFAULT true | Distributor can deactivate their magnet (hides public gate page) |
| created_at | TIMESTAMPTZ NOT NULL DEFAULT now() |
| updated_at | TIMESTAMPTZ NOT NULL DEFAULT now() |

Indexes: `(account_id)`, `(lead_magnet_id)`.

**`lead_magnet_downloads`** — Append-only. Visitor contact captures.
| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| account_id | UUID NOT NULL | FK → accounts.id ON DELETE CASCADE |
| account_lead_magnet_id | UUID NOT NULL | FK → account_lead_magnets.id ON DELETE CASCADE |
| name | TEXT NOT NULL | Visitor's name |
| whatsapp_number | TEXT NOT NULL | Normalised (digits + country code) |
| email | TEXT | Optional |
| ip_address | TEXT | Rate limiting only — never shown to distributor |
| user_agent | TEXT | Debugging |
| downloaded_at | TIMESTAMPTZ NOT NULL DEFAULT now() |

Indexes: `(account_id)`, `(account_lead_magnet_id)`,
`(account_lead_magnet_id, downloaded_at DESC)`,
`(ip_address, account_lead_magnet_id, downloaded_at)` — rate limiting.

### 4b. Update `lib/db/schema/index.ts`
Add: `export * from "./magnets";`

### 4c. Migration `drizzle/0006_lead_magnets.sql`
Full migration:
- All three tables with columns and indexes
- RLS enabled on all three tables
- `lead_magnets` RLS:
  - SELECT: any authenticated user (distributors need to read the active magnet)
  - INSERT/UPDATE/DELETE: admin only
- `account_lead_magnets` RLS:
  - SELECT: own account OR admin
  - INSERT/UPDATE: own account OR admin
  - DELETE: admin only
- `lead_magnet_downloads` RLS:
  - SELECT: own account OR admin
  - INSERT: always allowed from application (`WITH CHECK (true)` — visitor submits without auth)
  - UPDATE/DELETE: admin only
- Updated-at trigger on `lead_magnets` and `account_lead_magnets`

**The `lead_magnet_downloads` INSERT policy allows public inserts.**
Intentional — anonymous visitors submit contact info. App layer enforces rate limiting.

---

## 5. Extend `scopedDb` — Add to `lib/db/scoped.ts`

Add imports at top:
```typescript
import {
  leadMagnets, accountLeadMagnets, leadMagnetDownloads
} from "@/lib/db/schema/magnets";
import type {
  LeadMagnet, AccountLeadMagnet, LeadMagnetDownload,
  NewAccountLeadMagnet, NewLeadMagnetDownload
} from "@/lib/db/schema/magnets";
```

Add `magnets` namespace to `scopedDb()` return object:

```typescript
magnets: {
  // ── Account Lead Magnet (distributor activation) ──────────────────────
  getActivation: async () => Promise<AccountLeadMagnet | undefined>
    // SELECT WHERE account_id = accountId LIMIT 1

  activate: async (leadMagnetId: string) => Promise<AccountLeadMagnet>
    // INSERT OR UPDATE (upsert by account_id)
    // is_active = true, lead_magnet_id = leadMagnetId

  deactivate: async () => Promise<void>
    // UPDATE SET is_active = false WHERE account_id = accountId

  markPersonalised: async (pdfKey: string, masterVersion: number) => Promise<void>
    // UPDATE SET personalised_pdf_key = ?, personalised_at = NOW(),
    //            master_version_at_personalisation = ?
    // WHERE account_id = accountId

  // ── Downloads ─────────────────────────────────────────────────────────
  listDownloads: async (limit?: number) => Promise<LeadMagnetDownload[]>
    // WHERE account_id = accountId ORDER BY downloaded_at DESC LIMIT limit ?? 50

  countDownloadsLastHourByIp: async (ip: string) => Promise<number>
    // COUNT WHERE account_id = accountId AND ip_address = ip
    // AND downloaded_at > NOW() - INTERVAL '1 hour'

  countDownloadsToday: async () => Promise<number>
    // COUNT WHERE account_id = accountId
    // AND DATE(downloaded_at) = today (UTC)
}
```

Also add to `adminDb`:
```typescript
magnets: {
  getActive: async () => Promise<LeadMagnet | undefined>
    // SELECT WHERE is_active = true LIMIT 1

  create: async (data: Omit<NewLeadMagnet, "id"|"createdAt"|"updatedAt">)
    => Promise<LeadMagnet | undefined>

  update: async (id: string, data: Partial<LeadMagnet>) => Promise<LeadMagnet | undefined>

  deactivateAll: async () => Promise<void>
    // UPDATE SET is_active = false WHERE is_active = true

  listAccountActivations: async () => Promise<AccountLeadMagnet[]>
    // All rows — for admin dashboard

  invalidatePersonalisedPdfs: async () => Promise<void>
    // After admin re-uploads: sets personalised_at = null, personalised_pdf_key = null
    // for ALL account_lead_magnets so they regenerate on next request
}
```

---

## 6. PDF Generation

Create `lib/magnets/personalise.ts`:

```typescript
/**
 * Generates a personalised PDF for a distributor.
 * Loads master PDF from R2, overlays distributor contact info on last page,
 * uploads personalised copy to R2.
 *
 * Uses pdf-lib — pure JS, no headless browser required.
 * Compatible with Vercel serverless (no native dependencies).
 */
import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { getObjectBytes, uploadBytes, r2KeyForPersonalisedMagnet } from "@/lib/storage/r2";

export interface PersonaliseOptions {
  masterPdfKey: string;
  accountId: string;
  accountName: string;
  whatsappNumber: string;  // already normalised E.164
  accountSlug: string | null;
}

export async function personaliseMagnetPdf(opts: PersonaliseOptions): Promise<string> {
  // 1. Load master PDF from R2
  const masterBytes = await getObjectBytes(opts.masterPdfKey);
  const pdfDoc = await PDFDocument.load(masterBytes);
  pdfDoc.registerFontkit(fontkit);

  // 2. Embed standard font (Helvetica — no external font files needed)
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  // 3. Get last page
  const pages = pdfDoc.getPages();
  const lastPage = pages[pages.length - 1];
  if (!lastPage) throw new Error("PDF has no pages");

  const { width } = lastPage.getSize();
  const marginX = 40;
  const baseY = 60;  // distance from bottom edge
  const lineHeight = 14;
  const dividerWidth = width - marginX * 2;

  // 4. Draw divider line
  lastPage.drawLine({
    start: { x: marginX, y: baseY + lineHeight * 4 + 8 },
    end:   { x: marginX + dividerWidth, y: baseY + lineHeight * 4 + 8 },
    thickness: 0.5,
    color: rgb(0.7, 0.7, 0.7),
  });

  // 5. Draw contact block text
  const contactLines = [
    { text: `Your Guide from: ${opts.accountName}`, bold: true },
    { text: `WhatsApp: +${opts.whatsappNumber}`, bold: false },
    opts.accountSlug
      ? { text: `Web: ${opts.accountSlug}.yourteam.com`, bold: false }
      : null,
    { text: "Independent Herbalife Distributor", bold: false },
  ].filter(Boolean) as { text: string; bold: boolean }[];

  contactLines.forEach((line, i) => {
    lastPage.drawText(line.text, {
      x: marginX,
      y: baseY + lineHeight * (contactLines.length - 1 - i),
      size: 9,
      font: line.bold ? boldFont : font,
      color: rgb(0.2, 0.2, 0.2),
    });
  });

  // 6. Serialise and upload
  const pdfBytes = await pdfDoc.save();
  const key = r2KeyForPersonalisedMagnet(opts.accountId);
  await uploadBytes(key, pdfBytes, "application/pdf");
  return key;
}
```

### Update `lib/storage/r2.ts` — Add helpers

Add these two functions. Do NOT change any existing functions.

```typescript
/**
 * R2 key for a distributor's personalised lead magnet PDF.
 */
export function r2KeyForPersonalisedMagnet(accountId: string): string {
  return `magnets/personalised/${accountId}.pdf`;
}

/**
 * Download object bytes from R2 (for PDF processing).
 * Uses GetObjectCommand — same credentials as existing functions.
 */
export async function getObjectBytes(key: string): Promise<Uint8Array> {
  const { GetObjectCommand } = await import("@aws-sdk/client-s3");
  const { r2Client, R2_BUCKET } = getR2Config(); // extract from existing r2.ts setup
  const response = await r2Client.send(new GetObjectCommand({
    Bucket: R2_BUCKET,
    Key: key,
  }));
  if (!response.Body) throw new Error(`R2 object not found: ${key}`);
  // @aws-sdk/client-s3 v3 — Body is a readable stream
  const chunks: Uint8Array[] = [];
  for await (const chunk of response.Body as AsyncIterable<Uint8Array>) {
    chunks.push(chunk);
  }
  const total = chunks.reduce((sum, c) => sum + c.length, 0);
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.length;
  }
  return merged;
}

/**
 * Upload raw bytes to R2.
 */
export async function uploadBytes(
  key: string,
  bytes: Uint8Array,
  contentType: string
): Promise<void> {
  const { PutObjectCommand } = await import("@aws-sdk/client-s3");
  const { r2Client, R2_BUCKET } = getR2Config();
  await r2Client.send(new PutObjectCommand({
    Bucket: R2_BUCKET,
    Key: key,
    Body: bytes,
    ContentType: contentType,
  }));
}
```

Note: `getR2Config()` should be a private helper you extract from the existing
`r2.ts` implementation (it already constructs the S3 client and reads env vars —
just refactor into a shared private function called by all exported functions).

---

## 7. Public Magnet Lookup

Create `lib/magnets/public.ts` — for use ONLY in unauthenticated contexts.

```typescript
/**
 * PUBLIC — no account scope. Accessible without authentication.
 * All queries check is_active explicitly.
 */
import { db } from "@/lib/db";
import { accounts } from "@/lib/db/schema/accounts";
import { accountLeadMagnets, leadMagnets, leadMagnetDownloads } from "@/lib/db/schema/magnets";
import { and, eq, gt, sql } from "drizzle-orm";

export type PublicMagnetData = {
  magnetId: string;
  accountLeadMagnetId: string;
  accountId: string;
  accountName: string;
  accountSlug: string;
  title: string;
  description: string;
  thumbnailUrl: string | null;
  // Never expose PDF key or presigned URL here — only after form submission
};

/**
 * Load active lead magnet for a distributor account.
 * Returns null if: account not found/inactive, distributor not activated, magnet not active.
 */
export async function getPublicMagnet(accountSlug: string): Promise<PublicMagnetData | null> {
  const [row] = await db
    .select({
      magnetId: leadMagnets.id,
      accountLeadMagnetId: accountLeadMagnets.id,
      accountId: accounts.id,
      accountName: accounts.name,
      accountSlug: accounts.slug,
      title: leadMagnets.title,
      description: leadMagnets.description,
      thumbnailUrl: leadMagnets.thumbnailUrl,
    })
    .from(accounts)
    .innerJoin(accountLeadMagnets, and(
      eq(accountLeadMagnets.accountId, accounts.id),
      eq(accountLeadMagnets.isActive, true),
    ))
    .innerJoin(leadMagnets, and(
      eq(leadMagnets.id, accountLeadMagnets.leadMagnetId),
      eq(leadMagnets.isActive, true),
    ))
    .where(and(
      eq(accounts.slug, accountSlug),
      eq(accounts.isActive, true),
    ))
    .limit(1);

  if (!row) return null;
  return { ...row, accountSlug: row.accountSlug ?? accountSlug };
}

/**
 * Rate limit check — count downloads from this IP in last hour for this magnet.
 */
export async function countDownloadsLastHourByIp(
  accountLeadMagnetId: string,
  ip: string
): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`COUNT(*)::int` })
    .from(leadMagnetDownloads)
    .where(and(
      eq(leadMagnetDownloads.accountLeadMagnetId, accountLeadMagnetId),
      eq(leadMagnetDownloads.ipAddress, ip),
      gt(leadMagnetDownloads.downloadedAt, sql`NOW() - INTERVAL '1 hour'`),
    ));
  return row?.count ?? 0;
}

/**
 * Insert a download record and return the row ID.
 */
export async function recordDownload(data: {
  accountId: string;
  accountLeadMagnetId: string;
  name: string;
  whatsappNumber: string;
  email?: string;
  ipAddress: string;
  userAgent: string;
}): Promise<{ id: string } | null> {
  const [row] = await db
    .insert(leadMagnetDownloads)
    .values({ ...data, downloadedAt: new Date() })
    .returning({ id: leadMagnetDownloads.id });
  return row ?? null;
}
```

---

## 8. Validators

Create `lib/validators/magnets.ts`:

```typescript
import { z } from "zod";

export const MagnetMetaSchema = z.object({
  title: z.string().min(5, "Title too short").max(120, "Title too long"),
  description: z.string().min(10, "Description too short").max(400, "Description too long"),
  thumbnailUrl: z.string().url().optional().or(z.literal("")),
});

export const MagnetDownloadRequestSchema = z.object({
  accountSlug: z.string().min(3).max(30),
  accountLeadMagnetId: z.string().uuid(),
  name: z.string().min(1, "Name required").max(100),
  whatsappNumber: z.string().min(8, "WhatsApp number too short").max(20),
  email: z.string().email().optional().or(z.literal("")),
});
```

---

## 9. API Routes

### POST `/api/admin/magnets`
**Auth:** `requireAdmin()`

Creates a new lead magnet. Accepts `multipart/form-data` with:
- `title` (string)
- `description` (string)
- `pdf` (File — the master PDF)
- `thumbnail` (File — optional JPEG/PNG cover image)

Logic:
1. Validate `title` + `description` through `MagnetMetaSchema`
2. Run `runComplianceFilter(title + " " + description, adminId, "magnet-meta")` — if flagged → return 422
3. Generate `magnetId = crypto.randomUUID()`
4. Upload PDF to R2 at `magnets/master/{magnetId}.pdf` via presigned URL (server-side upload using `uploadBytes`)
5. If thumbnail provided → upload to R2 at `magnets/thumbnails/{magnetId}.jpg`, get CDN URL
6. `adminDb.magnets.deactivateAll()` (one active at a time)
7. `adminDb.magnets.create({ title, description, masterPdfKey, thumbnailUrl, isActive: true })`
8. `adminDb.magnets.invalidatePersonalisedPdfs()` — clears stale personalised PDFs
9. Audit log: `"magnet.created"`
10. Return `{ magnet }`

### PUT `/api/admin/magnets/[magnetId]`
**Auth:** `requireAdmin()`

Updates title/description/thumbnail only (NOT the PDF itself).
Accepts JSON body: `MagnetMetaSchema`.
Runs compliance filter on updated metadata.
Returns updated magnet.

### POST `/api/admin/magnets/[magnetId]/upload-pdf`
**Auth:** `requireAdmin()`

Re-upload master PDF (new version). No body needed — returns presigned upload URL.

Logic:
1. `requireAdmin()`
2. Verify `magnetId` exists in DB
3. Generate presigned upload URL for `magnets/master/{magnetId}.pdf` with 10-min expiry
4. Return `{ uploadUrl, key }`
5. Caller then: uploads file → calls `POST /api/admin/magnets/[magnetId]/confirm-upload`

### POST `/api/admin/magnets/[magnetId]/confirm-upload`
**Auth:** `requireAdmin()`

Called after client finishes uploading new PDF to presigned URL.

Logic:
1. Increment `version` in DB
2. Update `updated_at`
3. `adminDb.magnets.invalidatePersonalisedPdfs()` — all distributors must regenerate
4. Audit log: `"magnet.pdf_updated"`
5. Return `{ ok: true }`

### POST `/api/magnets/activate`
**Auth:** `getAccountFromSession()`

Distributor activates their lead magnet (or reactivates after deactivating).

Logic:
1. `adminDb.magnets.getActive()` — get the current active master magnet
2. If none → return 404 `{ error: "No lead magnet available yet. Ask your upline." }`
3. `userDb.magnets.activate(leadMagnetId)` — upsert account_lead_magnets row
4. Trigger personalisation (in background or inline):
   - Load `account` data (name, whatsapp, slug) from session
   - Call `personaliseMagnetPdf({ masterPdfKey, accountId, accountName, whatsappNumber, accountSlug })`
   - `userDb.magnets.markPersonalised(pdfKey, masterVersion)`
5. Audit log: `"magnet.activated"`
6. Return `{ ok: true, activation: AccountLeadMagnet }`

Note: personalisation happens synchronously here (pdf-lib is fast, ~200ms for a
typical PDF). If it fails, still return success but log the error — the distributor
can regenerate manually. Do not let PDF generation failure block activation.

### POST `/api/magnets/deactivate`
**Auth:** `getAccountFromSession()`

Sets `is_active = false` on account_lead_magnets. Hides public gate page.
Does NOT delete the personalised PDF.
Return `{ ok: true }`.

### POST `/api/magnets/regenerate`
**Auth:** `getAccountFromSession()`

Manually regenerates the personalised PDF (e.g. after account name/WhatsApp changes,
or after admin uploaded a new master).

Logic: same as personalisation step in `/api/magnets/activate`.
Returns `{ ok: true, personalised_at }`.

### GET `/api/magnets/me`
**Auth:** `getAccountFromSession()`

Returns the distributor's activation status + active master magnet metadata.

Response:
```typescript
{
  masterMagnet: LeadMagnet | null;      // the active master (null if admin hasn't set one)
  activation: AccountLeadMagnet | null; // distributor's row (null if never activated)
  isStale: boolean;                     // true if personalised PDF is outdated (master version changed)
}
```

`isStale = activation.masterVersionAtPersonalisation !== masterMagnet.version`

### GET `/api/magnets/downloads`
**Auth:** `getAccountFromSession()`

Query: `limit?: number` (default 50)
Returns: `{ downloads: LeadMagnetDownload[], total: number }`

### POST `/api/public/magnet-downloads`
**NO AUTH** — public endpoint for gate page form submissions.

Request body: `MagnetDownloadRequestSchema`

Logic:
1. Load magnet data: `getPublicMagnet(accountSlug)` — must match `accountLeadMagnetId` in body
2. Verify `data.accountLeadMagnetId === publicMagnet.accountLeadMagnetId` → return 404 if mismatch
3. Rate limit:
   - `countDownloadsLastHourByIp(accountLeadMagnetId, ip) >= 3` → return 429
4. Normalise WhatsApp: `normaliseWhatsAppNumber(data.whatsappNumber)`
5. `recordDownload({ accountId, accountLeadMagnetId, name, whatsappNumber, email, ipAddress, userAgent })`
6. Generate presigned download URL:
   - Load `account_lead_magnets` row to get `personalised_pdf_key`
   - If `personalised_pdf_key` is null → use master PDF key as fallback (with note)
   - `generateDownloadPresignedUrl(pdfKey, 900)` — 15-minute expiry
7. Return: `{ ok: true, downloadUrl: string, expiresInSeconds: 900 }`

Get IP: `request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown"`

### Add to `lib/storage/r2.ts` — Download presigned URL
```typescript
/**
 * Generate a presigned GET URL for downloading an object.
 * expiresInSeconds: how long the URL is valid (default 900 = 15 min)
 */
export async function generateDownloadPresignedUrl(
  key: string,
  expiresInSeconds: number = 900
): Promise<string> {
  const { GetObjectCommand } = await import("@aws-sdk/client-s3");
  const { getSignedUrl } = await import("@aws-sdk/s3-request-presigner");
  const { r2Client, R2_BUCKET } = getR2Config();
  return getSignedUrl(
    r2Client,
    new GetObjectCommand({ Bucket: R2_BUCKET, Key: key }),
    { expiresIn: expiresInSeconds }
  );
}
```

---

## 10. Public Gate Page

### `app/magnet/[accountSlug]/page.tsx` — Server Component

```typescript
const data = await getPublicMagnet(params.accountSlug);
if (!data) notFound();
```

Renders `<MagnetGatePage magnet={data} />` (client component).

### `app/magnet/[accountSlug]/not-found.tsx`
```
"This guide isn't available right now."
```
No links back to app.

### Component: `app/magnet/_components/magnet-gate-page.tsx`
Client component.

**Layout:**
```
┌─────────────────────────────────────┐
│ [Thumbnail image — optional]        │
├─────────────────────────────────────┤
│ FREE GUIDE                          │
│ {title}                             │
│ {description}                       │
├─────────────────────────────────────┤
│ Get your free copy:                 │
│                                     │
│ [Your Name]                         │
│ [WhatsApp Number]                   │
│ [Email — optional]                  │
│                                     │
│ [Send Me the Guide →]               │
├─────────────────────────────────────┤
│ Thank-you state (replaces form):    │
│ "Your guide is ready! →"            │
│ [Download PDF button]  (opens presigned URL)
├─────────────────────────────────────┤
│ Footer:                             │
│ Shared by {accountName}             │
│ Independent Herbalife Distributor   │
└─────────────────────────────────────┘
```

**Form submission flow:**
1. Client calls `POST /api/public/magnet-downloads`
2. On success → show thank-you state with Download button:
   ```html
   <a href={downloadUrl} target="_blank" rel="noopener noreferrer">
     Download Your Free Guide
   </a>
   ```
   Also show: "Link expires in 15 minutes."
3. On 429 → "You've already requested this recently. Check your WhatsApp — we'll be in touch!"
4. On other error → "Something went wrong. Please try again."

**Styling:** Same as public funnel pages. Clean, mobile-first, max-width 480px,
centered, light mode only, large readable text, generous padding.

---

## 11. Middleware Update

Ensure `/api/public/magnet-downloads` is NOT auth-protected.
In `middleware.ts`, `PUBLIC_PREFIXES` already includes `"/api/public/"` (added in Phase 4).
No change needed — verify it's still there.

Also add `/magnet/` to public prefixes (magnet gate pages have no auth):
```typescript
const PUBLIC_PREFIXES = [
  "/invite/",
  "/funnel/",
  "/magnet/",   // ← ADD THIS
  "/webinar/",
  "/_next/",
  "/api/auth/",
  "/api/public/",
];
```

---

## 12. Authenticated UI

### Page: `app/(app)/magnets/page.tsx`
**Server Component.** The distributor's lead magnet dashboard.

Calls `GET /api/magnets/me`. Shows:

```
My Lead Magnet

┌────────────────────────────────────────────┐
│ [Thumbnail]  {title}                       │
│              {description excerpt}         │
│                                            │
│ Status:  ● Active   / ○ Inactive           │
│ Downloads this week: 12                    │
│ Total downloads: 47                        │
│                                            │
│ [Deactivate]  [Regenerate PDF]  [Preview]  │
└────────────────────────────────────────────┘

⚠ Your PDF is outdated — admin uploaded a new version.
   [Regenerate Now]

Public link: magnet/{accountSlug}
[Copy link]
```

If not yet activated → show "Activate Your Lead Magnet" button.
If admin hasn't set up a master magnet → show "Your upline hasn't set up a
lead magnet template yet. Check back soon."

If account has no slug → show warning: "Set your funnel address first to
activate your lead magnet" with link to `/funnels` (slug setup is there).

### Page: `app/(app)/magnets/downloads/page.tsx`
Downloads table, same pattern as funnels leads page:
- Columns: name, WhatsApp (wa.me link icon), email, date
- Export CSV (client-side)
- Summary: total, this week

### Admin Page: `app/(admin)/admin/magnets/page.tsx`
Admin magnet management:

```
Lead Magnet

Current Master PDF:
  Title: {title}
  Version: v{version}
  Updated: {date}
  [Preview PDF]  [Replace PDF]  [Edit Details]

Distributor Activations: 32 of 50
  [View all]

[+ Upload New Lead Magnet]
```

Upload flow: admin picks PDF file → `POST /api/admin/magnets` (for first time)
or `POST /api/admin/magnets/[id]/upload-pdf` → client uploads to presigned URL
→ `POST /api/admin/magnets/[id]/confirm-upload`.

### Funnel Integration

In the Funnel Builder editor (`app/(app)/funnels/[funnelId]/edit/page.tsx`),
when CTA type is `free_resource`:
- Show label: "This funnel will link to your Lead Magnet page"
- Show the magnet URL: `magnet/{accountSlug}`
- If distributor hasn't activated their lead magnet → show warning:
  "Activate your Lead Magnet first at [Lead Magnets → /magnets]"

When a visitor arrives at a `free_resource` funnel and submits the lead form
(through `/api/public/funnel-leads`), the CTA action should redirect to:
`/magnet/{accountSlug}` instead of a WhatsApp link.

In `POST /api/funnels/[funnelId]/publish` — if `funnelType === "free_resource"`:
- Verify distributor has an active `account_lead_magnets` row → return 400 if not
  `{ error: "Activate your Lead Magnet before publishing a Free Resource funnel." }`

### Update sidebar: `app/(app)/_components/app-sidebar.tsx`
Add Lead Magnets nav item **after** Funnels:
```typescript
{ label: "Lead Magnets", href: "/magnets", icon: "📥", available: true },
```

---

## 13. Rules & Constraints

### R1: Account Isolation (absolute)
Every query touching `account_lead_magnets` or `lead_magnet_downloads` for a
specific distributor MUST go through `scopedDb(accountId)` — EXCEPT:
- `lib/magnets/public.ts` — intentionally public, documented at top of file
  (same `PUBLIC` comment pattern as `lib/funnels/public.ts`)
- `adminDb.magnets.*` — cross-account admin queries, marked at call sites

### R2: Never expose presigned PDF URLs until after form submission
The gate page (`/magnet/{accountSlug}`) renders magnet metadata only.
The presigned download URL is generated and returned ONLY by `POST /api/public/magnet-downloads`
after the visitor submits valid contact information.
Do not add any endpoint that returns a PDF URL without contact capture.

### R3: PDF key is private
`personalised_pdf_key` and `master_pdf_key` are R2 keys — internal server data.
Never include these in any API response that reaches the client.
Only the presigned download URL (short-lived) may be shared.

### R4: One active master magnet
Admin can upload a new master but there is only ONE active at any time.
`deactivateAll()` before creating a new one. Enforce at app layer.
Show "Current version" clearly in admin UI.

### R5: Stale personalised PDF detection
`isStale = activation.masterVersionAtPersonalisation !== masterMagnet.version`
Show warning in distributor UI when stale.
Allow one-click `POST /api/magnets/regenerate`.
Admin panel shows count of stale activations after re-upload.

### R6: No marketing API integrations
- No email sending of PDF — the download URL is displayed on-screen
- No WhatsApp Business API — just wa.me links in the distributor's leads table
- No file size limit enforcement at API level (R2 handles this) — but recommend
  admin keeps PDF < 10MB (note in admin UI)

### R7: Compliance on metadata only
The system runs `runComplianceFilter` on magnet `title + description` (the text
shown on the gate page). It does NOT analyse binary PDF content.
The admin is responsible for PDF content compliance.
Add a checkbox in the admin upload form: "I confirm this PDF content complies
with Herbalife Malaysia distributor guidelines." Required before upload.

### R8: TypeScript strict
- `noUncheckedIndexedAccess` ON — always `?.[0]` for array access
- No `any`
- All validators in `lib/validators/magnets.ts`
- Types exported from `lib/db/schema/magnets.ts`

### R9: PDPA
WhatsApp numbers in `lead_magnet_downloads` are personal data.
- Never log to console
- `ip_address` never shown in distributor UI (rate limiting only)
- Downloads list only shows: name, WhatsApp number (wa.me link), email, date

---

## 14. Tests Required

Create `tests/lead-magnet.test.ts`:

1. **PDF key generation — correct R2 key format**: `r2KeyForPersonalisedMagnet("abc-123")` → `"magnets/personalised/abc-123.pdf"`
2. **PDF personalisation — produces non-empty bytes**: mock `getObjectBytes` + `uploadBytes` → `personaliseMagnetPdf()` resolves without throwing
3. **PDF personalisation — handles missing WhatsApp gracefully**: `whatsappNumber: ""` → does not throw, uses fallback text
4. **Rate limit — blocks > 3 downloads per hour per IP**: `countDownloadsLastHourByIp` returns 3 → `POST /api/public/magnet-downloads` returns 429
5. **Download gate — returns 404 for inactive magnet**: `getPublicMagnet()` returns null → response is 404
6. **Download gate — returns 404 for accountLeadMagnetId mismatch**: body `accountLeadMagnetId` doesn't match account's actual activation → 404
7. **Download gate — presigned URL returned on success**: mock all DB calls + R2 → response has `downloadUrl` string
8. **Stale detection — isStale true when versions differ**: `masterVersionAtPersonalisation: 1`, `masterMagnet.version: 2` → `isStale = true`
9. **Stale detection — isStale false when versions match**: same version → `isStale = false`
10. **Account isolation — downloads query scoped to account**: `listDownloads()` called via `scopedDb("acct-A")` does NOT return rows from `acct-B`
11. **Compliance runs on metadata**: magnet title containing forbidden keyword → `POST /api/admin/magnets` returns 422
12. **Funnel publish guard — free_resource requires active magnet**: funnel with `funnelType: "free_resource"`, no activation → publish returns 400

Target: 12 new tests. Total with previous phases: 52 + 12 = **64 tests**.

---

## 15. File Checklist

```
lib/
  db/
    schema/
      magnets.ts              ← NEW (lead_magnets, account_lead_magnets, lead_magnet_downloads)
      index.ts                ← UPDATE (add magnets export)
    scoped.ts                 ← UPDATE (add magnets namespace to scopedDb + adminDb)
  storage/
    r2.ts                     ← UPDATE (add getObjectBytes, uploadBytes, generateDownloadPresignedUrl,
                                        r2KeyForPersonalisedMagnet, extract getR2Config helper)
  magnets/
    personalise.ts            ← NEW (personaliseMagnetPdf)
    public.ts                 ← NEW (getPublicMagnet, countDownloadsLastHourByIp, recordDownload)
  validators/
    magnets.ts                ← NEW (MagnetMetaSchema, MagnetDownloadRequestSchema)

drizzle/
  0006_lead_magnets.sql       ← NEW

middleware.ts                 ← UPDATE (add "/magnet/" to PUBLIC_PREFIXES)

app/
  magnet/
    [accountSlug]/
      page.tsx                ← NEW (public gate page — server component)
      not-found.tsx           ← NEW
    _components/
      magnet-gate-page.tsx    ← NEW (client component — form + download)

  (app)/
    magnets/
      page.tsx                ← NEW (distributor dashboard)
      downloads/
        page.tsx              ← NEW (downloads table)
    _components/
      app-sidebar.tsx         ← UPDATE (add Lead Magnets nav item, available: true)

  (admin)/
    admin/
      magnets/
        page.tsx              ← NEW (admin magnet management)

  api/
    admin/
      magnets/
        route.ts              ← NEW (POST create)
        [magnetId]/
          route.ts            ← NEW (PUT update metadata)
          upload-pdf/route.ts ← NEW (POST → presigned upload URL)
          confirm-upload/route.ts ← NEW (POST → increment version)
    magnets/
      activate/route.ts       ← NEW (POST)
      deactivate/route.ts     ← NEW (POST)
      regenerate/route.ts     ← NEW (POST)
      me/route.ts             ← NEW (GET)
      downloads/route.ts      ← NEW (GET)
    public/
      magnet-downloads/route.ts ← NEW (POST — no auth)

  (app)/
    funnels/
      [funnelId]/
        edit/
          page.tsx            ← UPDATE (add free_resource CTA UI + magnet warning)
    api/
      funnels/
        [funnelId]/
          publish/route.ts    ← UPDATE (add free_resource guard check)

tests/
  lead-magnet.test.ts         ← NEW
```

---

## 16. Definition of Done

- [ ] `npx tsc --noEmit` → 0 errors
- [ ] `npx vitest run` → 64 tests pass (52 existing + 12 new)
- [ ] `npx drizzle-kit generate` → generates 0006 without errors
- [ ] `npx next build` → build succeeds
- [ ] `pdf-lib` + `@pdf-lib/fontkit` in `package.json` and importable
- [ ] `personaliseMagnetPdf()` produces a valid PDF with contact block text
- [ ] Public gate page at `/magnet/test-slug` renders for active magnet
- [ ] Public gate page returns 404 for inactive magnet
- [ ] Gate form submission returns presigned download URL
- [ ] PDF key never appears in any client-facing API response
- [ ] Download rate limit (3/hour/IP) enforced
- [ ] Stale PDF detection works (version mismatch → `isStale: true`)
- [ ] Admin can upload a new master PDF and invalidate all personalised PDFs
- [ ] `free_resource` funnel publish blocked if distributor has no active magnet activation
- [ ] `/magnet/` added to PUBLIC_PREFIXES in middleware
- [ ] `/api/public/magnet-downloads` accessible without auth cookies
- [ ] WhatsApp numbers NOT logged to console anywhere
- [ ] Lead Magnets nav item `available: true` in sidebar

---

## 17. Start Order (Recommended Sequence)

1. Install packages: `npm install pdf-lib @pdf-lib/fontkit`
2. `lib/db/schema/magnets.ts` (types first)
3. `lib/db/schema/index.ts` (add export)
4. `drizzle/0006_lead_magnets.sql`
5. `lib/db/scoped.ts` (add magnets namespace to scopedDb + adminDb)
6. `lib/validators/magnets.ts` (Zod schemas)
7. `lib/storage/r2.ts` (add getObjectBytes, uploadBytes, generateDownloadPresignedUrl, r2KeyForPersonalisedMagnet)
8. `lib/magnets/personalise.ts` (pdf-lib personalisation — no auth deps)
9. `lib/magnets/public.ts` (public DB access — no auth deps)
10. `middleware.ts` (add "/magnet/" to PUBLIC_PREFIXES)
11. Admin API routes: `POST /api/admin/magnets` → `PUT` → `upload-pdf` → `confirm-upload`
12. Distributor API routes: `activate` → `deactivate` → `regenerate` → `me` → `downloads`
13. Public API route: `POST /api/public/magnet-downloads`
14. Update `POST /api/funnels/[funnelId]/publish` (add `free_resource` guard)
15. `app/magnet/` public pages + `magnet-gate-page.tsx` component
16. `app/(app)/magnets/` distributor pages
17. `app/(admin)/admin/magnets/` admin page
18. Update sidebar (`app-sidebar.tsx`)
19. Update funnel editor (`free_resource` CTA UI)
20. `tests/lead-magnet.test.ts`
21. Final: `tsc --noEmit` + `vitest run` + `next build`
