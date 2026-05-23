# Codex Remediation Brief — PDPA Compliance Gaps
# President Tools OS — Patch (must apply before ANY user rollout)
#
# HOW TO RUN:
#   codex --model o3 --approval-mode auto-edit "$(cat CODEX_REMEDIATION_PDPA.md)"
#
# CONTEXT:
#   Gate review identified 4 PDPA/legal gaps that block rollout.
#   This patch fixes them without touching any other module.
#   No new migrations needed — only schema additions to existing tables
#   and new/updated application code.
# IMPORTANT: Read every section before writing any code.

---

## Gap 1 — Consent Checkbox on All 3 Public Forms

### Problem
Public forms (funnel lead capture, magnet download gate, webinar registration)
collect WhatsApp numbers and names (personal data under Malaysia's PDPA 2010)
without an explicit consent acknowledgment.

### Fix

#### 1a. Add `pdpa_consent` column to the 3 submission tables

Migration: `drizzle/0012_pdpa_consent.sql`

```sql
-- Add consent tracking to all public submission tables
ALTER TABLE public.funnel_leads
  ADD COLUMN IF NOT EXISTS pdpa_consent BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS consent_text TEXT;  -- stores the exact consent wording at time of submission

ALTER TABLE public.lead_magnet_downloads
  ADD COLUMN IF NOT EXISTS pdpa_consent BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS consent_text TEXT;

ALTER TABLE public.webinar_registrations
  ADD COLUMN IF NOT EXISTS pdpa_consent BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS consent_text TEXT;
```

Default `false` is safe: existing rows were submitted before this requirement.
New submissions MUST have `pdpa_consent = true` (enforced at API layer).

#### 1b. Consent wording (constant — use exactly this)

Create `lib/pdpa/consent.ts`:

```typescript
/**
 * PDPA consent text shown to visitors on all public forms.
 * Must be stored alongside each submission at time of consent.
 * Do NOT change this text without legal review.
 */
export const PDPA_CONSENT_TEXT =
  "I consent to my personal data (name and WhatsApp number) being " +
  "collected and used by the above independent Herbalife distributor " +
  "for the purpose of following up on my enquiry, in accordance with " +
  "Malaysia's Personal Data Protection Act 2010 (PDPA). " +
  "I understand I may withdraw this consent at any time by contacting the distributor.";

export const PDPA_CONSENT_VERSION = "MY-PDPA-2010-v1";
```

#### 1c. Update the 3 public API routes

**`app/api/public/funnel-leads/route.ts`** — add to Zod body schema:
```typescript
pdpaConsent: z.literal(true, {
  errorMap: () => ({ message: "You must consent to data collection to continue." }),
}),
```
Add to the DB insert: `pdpaConsent: true, consentText: PDPA_CONSENT_TEXT`.
Return 400 if `pdpaConsent !== true`.

**`app/api/public/magnet-downloads/route.ts`** — same pattern.

**`app/api/public/webinar-register/route.ts`** — same pattern.

#### 1d. Update the 3 public UI components

**`app/funnel/_components/public-funnel-view.tsx`**
**`app/magnet/_components/magnet-gate-page.tsx`**
**`app/webinar/_components/webinar-register-page.tsx`**

Add to each form, above the submit button:

```tsx
{/* PDPA Consent — required */}
<div className="flex items-start gap-2 text-xs text-muted-foreground">
  <input
    id="pdpa-consent"
    type="checkbox"
    checked={pdpaConsent}
    onChange={(e) => setPdpaConsent(e.target.checked)}
    className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 accent-primary"
    required
  />
  <label htmlFor="pdpa-consent">
    I consent to my personal data (name and WhatsApp number) being collected
    and used by this independent Herbalife distributor for follow-up, in
    accordance with Malaysia's{" "}
    <a href="/privacy" target="_blank" rel="noopener noreferrer"
       className="underline text-foreground">
      Personal Data Protection Act 2010
    </a>.
  </label>
</div>
```

Submit button must be `disabled` when `pdpaConsent === false`.
Include `pdpaConsent: true` in the fetch body.

---

## Gap 2 — Privacy Notice Page

### Problem
No `/privacy` page exists. PDPA requires the data controller to make a
privacy notice available. Middleware allows the route but there is no page.

### Fix

Create `app/privacy/page.tsx` — static Server Component, no auth required.
Add `/privacy` to `PUBLIC_PREFIXES` in `middleware.ts`.

```tsx
// app/privacy/page.tsx
export const metadata = {
  title: "Privacy Notice | President Tools",
};

export default function PrivacyPage() {
  return (
    <main className="max-w-2xl mx-auto px-4 py-12 space-y-6 text-sm text-foreground">
      <h1 className="text-xl font-semibold">Privacy Notice</h1>
      <p className="text-muted-foreground">Last updated: {new Date().getFullYear()}</p>

      <section className="space-y-2">
        <h2 className="font-semibold">1. Who We Are</h2>
        <p>
          This platform is operated by independent Herbalife Nutrition distributors
          in Malaysia. Each distributor is an independent data controller responsible
          for the personal data collected through their individual pages.
          Herbalife Nutrition Ltd is not responsible for the data practices of
          independent distributors.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="font-semibold">2. What Data We Collect</h2>
        <p>When you submit a form on a distributor's page, we may collect:</p>
        <ul className="list-disc pl-5 space-y-1">
          <li>Your name</li>
          <li>Your WhatsApp number</li>
          <li>Your email address (if you provide it)</li>
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="font-semibold">3. How We Use Your Data</h2>
        <p>
          Your data is used solely to allow the distributor to follow up
          with you regarding your enquiry. We do not sell, share, or transfer
          your data to third parties, except as required by law.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="font-semibold">4. Data Storage</h2>
        <p>
          Your data is stored securely on servers hosted by Supabase (PostgreSQL),
          located in Singapore (AWS ap-southeast-1 region), and Cloudflare
          (global CDN for file storage). Both providers maintain appropriate
          technical and organisational security measures.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="font-semibold">5. Your Rights Under PDPA 2010</h2>
        <p>Under Malaysia's Personal Data Protection Act 2010, you have the right to:</p>
        <ul className="list-disc pl-5 space-y-1">
          <li>Access the personal data we hold about you</li>
          <li>Correct inaccurate personal data</li>
          <li>Withdraw your consent to the processing of your data</li>
          <li>Request deletion of your personal data</li>
        </ul>
        <p>
          To exercise any of these rights, contact the distributor whose page
          you submitted your data on, or write to us at the address below.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="font-semibold">6. Contact</h2>
        <p>
          For privacy-related enquiries, contact the distributor directly via
          WhatsApp, or email: <span className="text-foreground font-medium">
            [admin contact email from env — see NEXT_PUBLIC_ADMIN_EMAIL]
          </span>
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="font-semibold">7. Changes to This Notice</h2>
        <p>
          We may update this privacy notice from time to time. Continued use
          of any distributor's page after changes constitutes acceptance of
          the updated notice.
        </p>
      </section>
    </main>
  );
}
```

Add to `.env.example`:
```
NEXT_PUBLIC_ADMIN_EMAIL=
```

Update `middleware.ts` — add `"/privacy"` to `PUBLIC_PREFIXES`:
```typescript
const PUBLIC_PREFIXES = [
  "/invite/",
  "/funnel/",
  "/magnet/",
  "/webinar/",
  "/privacy",    // ← ADD
  "/_next/",
  "/api/auth/",
  "/api/public/",
];
```

---

## Gap 3 — PDPA Deletion / Anonymization API

### Problem
No mechanism for a data subject to request deletion or for an admin to
comply with a PDPA deletion request.

### Fix

Create a PDPA erasure endpoint. Strategy: **anonymize, don't hard-delete**.
Anonymization preserves referential integrity (foreign keys, audit logs)
while removing PII. Audit logs themselves are anonymized (actor name removed,
but the action record is kept for legal purposes).

#### 3a. Anonymization function: `lib/pdpa/erase.ts`

```typescript
/**
 * PDPA Data Erasure
 *
 * Anonymizes all personal data for a given WhatsApp number across all tables
 * that store visitor/lead PII. This covers:
 *   - funnel_leads
 *   - lead_magnet_downloads
 *   - webinar_registrations
 *   - contacts (CRM)
 *
 * Anonymization replaces identifiers with fixed placeholder values.
 * Records are NOT deleted — referential integrity and aggregate stats are preserved.
 *
 * Usage: called by admin on behalf of a data subject request.
 */
import { db } from "@/lib/db";
import { funnelLeads } from "@/lib/db/schema/funnels";
import { leadMagnetDownloads } from "@/lib/db/schema/magnets";
import { webinarRegistrations } from "@/lib/db/schema/webinars";
import { contacts } from "@/lib/db/schema/crm";
import { eq } from "drizzle-orm";

const ANONYMIZED_NAME = "[Deleted]";
const ANONYMIZED_WHATSAPP = "00000000000";
const ANONYMIZED_EMAIL = null;

export type EraseResult = {
  funnelLeads: number;
  magnetDownloads: number;
  webinarRegistrations: number;
  crmContacts: number;
};

/**
 * Erase all records matching a WhatsApp number for a specific account.
 * accountId scopes the erasure — an admin must specify which account's data to erase.
 */
export async function eraseDataByWhatsApp(
  whatsappNumber: string,
  accountId: string
): Promise<EraseResult> {
  const [fl, md, wr, c] = await Promise.all([
    db
      .update(funnelLeads)
      .set({ name: ANONYMIZED_NAME, whatsappNumber: ANONYMIZED_WHATSAPP, email: ANONYMIZED_EMAIL })
      .where(eq(funnelLeads.whatsappNumber, whatsappNumber))
      // Note: also filter by accountId for scoping
      .returning({ id: funnelLeads.id }),

    db
      .update(leadMagnetDownloads)
      .set({ name: ANONYMIZED_NAME, whatsappNumber: ANONYMIZED_WHATSAPP, email: ANONYMIZED_EMAIL })
      .where(eq(leadMagnetDownloads.whatsappNumber, whatsappNumber))
      .returning({ id: leadMagnetDownloads.id }),

    db
      .update(webinarRegistrations)
      .set({ name: ANONYMIZED_NAME, whatsappNumber: ANONYMIZED_WHATSAPP, email: ANONYMIZED_EMAIL })
      .where(eq(webinarRegistrations.whatsappNumber, whatsappNumber))
      .returning({ id: webinarRegistrations.id }),

    db
      .update(contacts)
      .set({ name: ANONYMIZED_NAME, whatsappNumber: ANONYMIZED_WHATSAPP, email: ANONYMIZED_EMAIL })
      .where(eq(contacts.whatsappNumber, whatsappNumber))
      .returning({ id: contacts.id }),
  ]);

  return {
    funnelLeads: fl.length,
    magnetDownloads: md.length,
    webinarRegistrations: wr.length,
    crmContacts: c.length,
  };
}
```

#### 3b. Admin erasure API: `app/api/admin/pdpa/erase/route.ts`

```typescript
/**
 * POST /api/admin/pdpa/erase
 *
 * Admin-only. Anonymizes all PII for a data subject identified by WhatsApp number.
 * Used to comply with PDPA deletion requests.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/session";
import { eraseDataByWhatsApp } from "@/lib/pdpa/erase";
import { adminDb } from "@/lib/db/scoped";
import { normaliseWhatsAppNumber } from "@/lib/funnels/whatsapp";

const BodySchema = z.object({
  whatsappNumber: z.string().min(8).max(20),
  accountId: z.string().uuid(),
  reason: z.string().min(5).max(200),  // required — logged for compliance
});

export async function POST(request: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = BodySchema.safeParse(await request.json());
  if (!body.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  const normalised = normaliseWhatsAppNumber(body.data.whatsappNumber);
  const result = await eraseDataByWhatsApp(normalised, body.data.accountId);

  // Audit log the erasure (required for PDPA compliance record-keeping)
  await adminDb.audit.log({
    actorUserId: admin.userId,
    action: "pdpa.erasure",
    resourceType: "data_subject",
    resourceId: normalised,
    metadata: JSON.stringify({
      reason: body.data.reason,
      accountId: body.data.accountId,
      recordsAnonymized: result,
    }),
  });

  return NextResponse.json({ ok: true, result });
}
```

#### 3c. Admin UI: add PDPA Erasure to admin panel

Add to `app/(admin)/admin/usage/page.tsx` (or a new `app/(admin)/admin/pdpa/page.tsx`):

```
PDPA Erasure Requests

To comply with a data subject's deletion request, enter their WhatsApp
number and the account they submitted data through.

[WhatsApp Number]    [Account ▼]    [Reason for erasure]

[Anonymize Records]

⚠ This action cannot be undone. It will anonymize all records
  matching this number across funnels, lead magnets, webinars, and CRM.
```

Add to admin nav: `{ label: "PDPA", href: "/admin/pdpa" }`.

---

## Gap 4 — Audit Log Coverage for Public Submissions

### Problem
Public lead/download/registration submissions are not audit-logged.
CRM writes (stage moves, notes) are not audit-logged.

### Fix

#### 4a. Audit log for public submissions

In each public submission route, after inserting the record, log to `audit_logs`:

**`app/api/public/funnel-leads/route.ts`** — after successful insert:
```typescript
// Use adminDb.audit.log (public submission — no auth context)
// accountId is the distributor's account, not the visitor's
await adminDb.audit.log({
  accountId: data.funnel.accountId,
  actorUserId: null,          // null = anonymous visitor
  action: "public.funnel_lead.submitted",
  resourceType: "funnel_lead",
  resourceId: lead.id,
  metadata: JSON.stringify({ funnelId: data.funnel.id, source: "public_form" }),
});
```

Same pattern for:
- **`/api/public/magnet-downloads/route.ts`**: action `"public.magnet_download.submitted"`
- **`/api/public/webinar-register/route.ts`**: action `"public.webinar_registration.submitted"`

Note: `actorUserId: null` must be allowed by the `auditLogs` schema (make column nullable).
Check `lib/db/schema/accounts.ts` — if `actorUserId` is `NOT NULL`, add:
```sql
-- In 0012_pdpa_consent.sql:
ALTER TABLE public.audit_logs ALTER COLUMN actor_user_id DROP NOT NULL;
```

#### 4b. Audit log for CRM writes

In `lib/db/scoped.ts`, the `crm` namespace `moveStage()` already logs activity
to `contact_activities` but NOT to `audit_logs`. Add audit logging to:

- `crm.moveStage()` → audit action: `"crm.contact.stage_changed"`
- `crm.archive()` → audit action: `"crm.contact.archived"`
- `crm.create()` → audit action: `"crm.contact.created"`

These use `userDb.audit.log(...)` (same scoped pattern as other modules).

---

## 5. Migration

All schema changes go in one migration: `drizzle/0012_pdpa_consent.sql`

```sql
-- PDPA consent columns on public submission tables
ALTER TABLE public.funnel_leads
  ADD COLUMN IF NOT EXISTS pdpa_consent BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS consent_text TEXT;

ALTER TABLE public.lead_magnet_downloads
  ADD COLUMN IF NOT EXISTS pdpa_consent BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS consent_text TEXT;

ALTER TABLE public.webinar_registrations
  ADD COLUMN IF NOT EXISTS pdpa_consent BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS consent_text TEXT;

-- Allow anonymous actor for public submission audit logs
ALTER TABLE public.audit_logs
  ALTER COLUMN actor_user_id DROP NOT NULL;
```

---

## 6. Tests Required

Add to `tests/pdpa.test.ts` (new file):

1. **Consent required — funnel lead rejected without checkbox**: `POST /api/public/funnel-leads` without `pdpaConsent: true` → 400
2. **Consent stored — consent text saved on submission**: successful submit → `consent_text` equals `PDPA_CONSENT_TEXT`
3. **Erasure — anonymizes funnel leads**: `eraseDataByWhatsApp("60123456789", accountId)` → `funnelLeads` count > 0, name replaced with `"[Deleted]"`
4. **Erasure — anonymizes CRM contacts**: contacts with that number → name + whatsapp anonymized
5. **Erasure — audit logged**: after erasure → audit_logs has `action: "pdpa.erasure"` entry
6. **Privacy page — renders without auth**: `GET /privacy` → 200 (no redirect)
7. **Audit log — null actorUserId accepted**: insert audit log with `actorUserId: null` → no DB error
8. **CRM stage move — audit logged**: `moveStage()` → audit_logs has `"crm.contact.stage_changed"`
9. **Public submission audit — funnel lead logged**: successful lead submit → audit_logs entry with `action: "public.funnel_lead.submitted"`
10. **Consent required — magnet download rejected without checkbox**: same pattern for magnets → 400

Target: 10 tests. Add to existing test suite.

---

## 7. File Checklist

```
lib/
  pdpa/
    consent.ts              ← NEW (PDPA_CONSENT_TEXT constant)
    erase.ts                ← NEW (eraseDataByWhatsApp)

drizzle/
  0012_pdpa_consent.sql     ← NEW

.env.example                ← UPDATE (add NEXT_PUBLIC_ADMIN_EMAIL)

middleware.ts               ← UPDATE (add "/privacy" to PUBLIC_PREFIXES)

app/
  privacy/
    page.tsx                ← NEW (static privacy notice)

  api/
    admin/
      pdpa/
        erase/route.ts      ← NEW

    public/
      funnel-leads/route.ts    ← UPDATE (add pdpaConsent validation + audit log)
      magnet-downloads/route.ts ← UPDATE (add pdpaConsent validation + audit log)
      webinar-register/route.ts ← UPDATE (add pdpaConsent validation + audit log)

  funnel/_components/
    public-funnel-view.tsx   ← UPDATE (add consent checkbox)
  magnet/_components/
    magnet-gate-page.tsx     ← UPDATE (add consent checkbox)
  webinar/_components/
    webinar-register-page.tsx ← UPDATE (add consent checkbox)

  (admin)/admin/
    pdpa/
      page.tsx              ← NEW (erasure request UI)
    layout.tsx              ← UPDATE (add PDPA to admin nav)

lib/db/scoped.ts            ← UPDATE (audit log in crm.moveStage, archive, create)

tests/
  pdpa.test.ts              ← NEW
```

---

## 8. Definition of Done

- [ ] `npx tsc --noEmit` → 0 errors
- [ ] `npx vitest run` → all tests pass (149 existing + 10 new = 159)
- [ ] `npx drizzle-kit generate` → generates 0012 without errors
- [ ] Consent checkbox present on all 3 public forms (funnel, magnet, webinar)
- [ ] Submit disabled when checkbox unchecked
- [ ] `pdpa_consent = true` stored on every new public submission
- [ ] `consent_text` stored verbatim on every new public submission
- [ ] `POST /api/public/funnel-leads` returns 400 if `pdpaConsent !== true`
- [ ] `/privacy` page renders without auth, linked from consent checkbox
- [ ] `POST /api/admin/pdpa/erase` anonymizes across all 4 tables
- [ ] Erasure is audit-logged with reason
- [ ] `actor_user_id` nullable in audit_logs
- [ ] Public submissions create audit log entries
- [ ] CRM stage moves create audit log entries
- [ ] PDPA page added to admin nav
