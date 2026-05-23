# Codex Task Brief — Manual CRM
# President Tools OS — Phase 7 (Week 8)
#
# HOW TO RUN:
#   codex --model o3 --approval-mode auto-edit "$(cat CODEX_CRM.md)"
#
# PREREQUISITES:
#   - Phase 1 (Foundation) complete
#   - Phase 4 (Funnel Builder) complete — funnel leads auto-populate CRM
#   - Phase 5 (Lead Magnet) complete — magnet downloads auto-populate CRM
#   - Phase 6 (Webinar) complete — webinar registrations auto-populate CRM
# IMPORTANT: Read every section before writing any code.

---

## 1. Mission

Build the **Manual CRM** — a Kanban-style contact pipeline that gives each
distributor a single place to track every prospect and customer they're
nurturing, with one-tap WhatsApp deep links for follow-up.

This is a **manual tool**. There is no automation, no auto-emailing, no
scoring algorithm, no API integration with any social platform. The value is
clarity: every contact in one view, next action always visible.

**What it does:**
- Displays all contacts (from funnels, lead magnets, webinars, and manually
  added) in a 5-stage Kanban pipeline
- Each card shows name, WhatsApp button, source, last-contacted date, and notes
- Distributor drags cards between stages (or uses a dropdown)
- All writes go through `scopedDb` — contacts from other accounts are never visible

**What it does NOT do:**
- No automated messaging of any kind
- No integration with WhatsApp, Meta, or any external API
- No lead scoring or AI prioritisation (contacts are sorted by last-contacted date)
- No email sending

---

## 2. Project Context

### Stack (do not change — already installed)
- Next.js 14 App Router + TypeScript strict + Tailwind + shadcn/ui
- Drizzle ORM + Supabase (PostgreSQL)
- `lib/funnels/whatsapp.ts` — `buildWaLink()` already exists, reuse it

### Already built — do not re-implement
```
lib/db/scoped.ts               scopedDb(accountId) + adminDb
lib/auth/session.ts            getAccountFromSession()
lib/funnels/whatsapp.ts        buildWaLink(), normaliseWhatsAppNumber()
```

### Contact sources (already in DB — read-only references)
These tables exist and already have contact data. The CRM reads from them
to auto-create contact records, but does NOT write back to them.

| Table | Key columns | Source label |
|-------|-------------|--------------|
| `funnel_leads` | name, whatsapp_number, account_id, funnel_id, submitted_at | "Funnel" |
| `lead_magnet_downloads` | name, whatsapp_number, account_id, downloaded_at | "Lead Magnet" |
| `webinar_registrations` | name, whatsapp_number, account_id, registered_at | "Webinar" |

---

## 3. The 5-Stage Pipeline

Every contact lives in exactly one stage at a time. Stages are fixed — the
distributor cannot add or rename them. This is intentional: simplicity over
flexibility.

```
┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐
│  NEW     │  │ WARM     │  │ HOT      │  │ CUSTOMER │  │ TEAM     │
│          │  │          │  │          │  │          │  │ MEMBER   │
│ Just     │  │ Showed   │  │ Ready    │  │ Bought   │  │ Joined   │
│ entered  │  │ interest │  │ to buy   │  │ product  │  │ as dist. │
│ pipeline │  │          │  │          │  │          │  │          │
└──────────┘  └──────────┘  └──────────┘  └──────────┘  └──────────┘
```

```typescript
export const PIPELINE_STAGES = [
  "new",
  "warm",
  "hot",
  "customer",
  "team_member",
] as const;
export type PipelineStage = typeof PIPELINE_STAGES[number];
```

Stage labels (for display):
```typescript
export const STAGE_LABELS: Record<PipelineStage, string> = {
  new: "New",
  warm: "Warm",
  hot: "Hot",
  customer: "Customer",
  team_member: "Team Member",
};
```

---

## 4. Database Schema

### 4a. Create `lib/db/schema/crm.ts`

**`contacts`** — One row per unique person per account.
| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | gen_random_uuid() |
| account_id | UUID NOT NULL | FK → accounts.id ON DELETE CASCADE |
| name | TEXT NOT NULL | |
| whatsapp_number | TEXT NOT NULL | Normalised digits (e.g. `60123456789`) |
| email | TEXT | Optional |
| stage | TEXT NOT NULL DEFAULT 'new' | One of PIPELINE_STAGES values |
| source | TEXT NOT NULL DEFAULT 'manual' | `'funnel'` \| `'lead_magnet'` \| `'webinar'` \| `'manual'` |
| source_id | TEXT | UUID of the originating row (funnel_lead.id, download.id, etc.) — nullable for manual contacts |
| notes | TEXT | Distributor's private notes. Max 2000 chars. |
| last_contacted_at | TIMESTAMPTZ | Set manually by distributor. Null = never contacted. |
| is_archived | BOOLEAN NOT NULL DEFAULT false | Soft delete. Archived contacts hidden from Kanban. |
| created_at | TIMESTAMPTZ NOT NULL DEFAULT now() |
| updated_at | TIMESTAMPTZ NOT NULL DEFAULT now() |

Indexes:
- `(account_id)` — list all contacts
- `(account_id, stage)` — filter by stage
- `(account_id, is_archived)` — exclude archived
- `(account_id, source, source_id)` — deduplication check on import
- `(whatsapp_number, account_id)` — dedup by phone within account

Unique constraint: `(account_id, whatsapp_number)` — one contact per phone per account.
If the same person submits two different funnels, they get ONE contact card (deduped by WhatsApp).

**`contact_activities`** — Append-only log of distributor actions.
| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| account_id | UUID NOT NULL | FK → accounts.id ON DELETE CASCADE |
| contact_id | UUID NOT NULL | FK → contacts.id ON DELETE CASCADE |
| activity_type | TEXT NOT NULL | `'stage_change'` \| `'note_added'` \| `'whatsapp_sent'` \| `'manual_contact'` |
| payload | TEXT | JSON string. For `stage_change`: `{ from, to }`. For `note_added`: `{ note }`. |
| created_at | TIMESTAMPTZ NOT NULL DEFAULT now() |

Indexes: `(contact_id)`, `(account_id, contact_id)`,
`(account_id, created_at DESC)` — recent activity feed.

### 4b. Update `lib/db/schema/index.ts`
Add: `export * from "./crm";`

### 4c. Migration `drizzle/0008_crm.sql`
Full migration:
- Both tables with all columns, indexes, unique constraint
- RLS enabled on both:
  - `contacts`: SELECT/INSERT/UPDATE: own account OR admin. DELETE: admin only (use `is_archived` instead).
  - `contact_activities`: SELECT: own account OR admin. INSERT: own account OR admin. UPDATE/DELETE: admin only (append-only).
- Updated-at trigger on `contacts`

---

## 5. Extend `scopedDb` — Add to `lib/db/scoped.ts`

Add imports:
```typescript
import { contacts, contactActivities } from "@/lib/db/schema/crm";
import type {
  Contact, NewContact, ContactActivity, NewContactActivity
} from "@/lib/db/schema/crm";
```

Add `crm` namespace to `scopedDb()`:

```typescript
crm: {
  // ── Contacts ──────────────────────────────────────────────────────────
  list: async (opts?: {
    stage?: PipelineStage;
    includeArchived?: boolean;
    limit?: number;
  }) => Promise<Contact[]>
    // WHERE account_id = accountId
    // AND (is_archived = false unless includeArchived = true)
    // AND (stage = opts.stage if provided)
    // ORDER BY last_contacted_at ASC NULLS FIRST, created_at DESC
    // LIMIT opts.limit ?? 500

  get: async (contactId: string) => Promise<Contact | undefined>
    // WHERE id = ? AND account_id = accountId

  getByWhatsApp: async (whatsappNumber: string) => Promise<Contact | undefined>
    // WHERE whatsapp_number = ? AND account_id = accountId LIMIT 1

  create: async (data: Omit<NewContact, "accountId"|"id"|"createdAt"|"updatedAt">)
    => Promise<Contact | undefined>

  update: async (contactId: string, data: Partial<Pick<Contact,
    "name" | "whatsappNumber" | "email" | "stage" | "notes" | "lastContactedAt" | "isArchived"
  >>) => Promise<Contact | undefined>
    // WHERE id = ? AND account_id = accountId

  moveStage: async (contactId: string, toStage: PipelineStage) => Promise<Contact | undefined>
    // UPDATE SET stage = toStage WHERE id = ? AND account_id = accountId
    // After update → log activity: { type: 'stage_change', payload: { from, to } }

  archive: async (contactId: string) => Promise<void>
    // UPDATE SET is_archived = true WHERE id = ? AND account_id = accountId

  unarchive: async (contactId: string) => Promise<void>
    // UPDATE SET is_archived = false WHERE id = ? AND account_id = accountId

  countByStage: async () => Promise<Record<PipelineStage, number>>
    // SELECT stage, COUNT(*) GROUP BY stage WHERE account_id = accountId AND is_archived = false

  // ── Import from source tables ─────────────────────────────────────────
  importFromSource: async (opts: {
    sourceId: string;
    source: "funnel" | "lead_magnet" | "webinar";
    name: string;
    whatsappNumber: string;
    email?: string;
  }) => Promise<{ contact: Contact; created: boolean }>
    // Dedup by whatsapp_number within account:
    //   If contact exists → return existing, created: false
    //   If not → insert with stage: 'new', source, source_id
    // Use INSERT ... ON CONFLICT (account_id, whatsapp_number) DO NOTHING
    // then SELECT to return the existing or new row

  // ── Activity log ──────────────────────────────────────────────────────
  logActivity: async (data: Omit<NewContactActivity, "accountId"|"id"|"createdAt">)
    => Promise<void>

  listActivities: async (contactId: string, limit?: number) => Promise<ContactActivity[]>
    // WHERE contact_id = ? AND account_id = accountId
    // ORDER BY created_at DESC LIMIT limit ?? 20
}
```

---

## 6. Auto-Import: Sync from Source Tables

When a distributor opens the CRM for the first time (or clicks "Sync Contacts"),
the system sweeps their source tables and imports any contacts not yet in the CRM.

Create `lib/crm/sync.ts`:

```typescript
/**
 * Syncs contacts from funnel_leads, lead_magnet_downloads, and webinar_registrations
 * into the contacts table for the given account.
 *
 * Idempotent — running multiple times is safe (dedup by whatsapp_number).
 * Returns counts of new vs. existing contacts found.
 */
import { db } from "@/lib/db";
import { funnelLeads } from "@/lib/db/schema/funnels";
import { leadMagnetDownloads } from "@/lib/db/schema/magnets";
import { webinarRegistrations } from "@/lib/db/schema/webinars";
import { eq } from "drizzle-orm";
import { scopedDb } from "@/lib/db/scoped";
import { normaliseWhatsAppNumber } from "@/lib/funnels/whatsapp";

export type SyncResult = {
  funnelLeads: { imported: number; skipped: number };
  magnetDownloads: { imported: number; skipped: number };
  webinarRegs: { imported: number; skipped: number };
};

export async function syncContactsFromSources(accountId: string): Promise<SyncResult> {
  const userDb = scopedDb(accountId);
  const result: SyncResult = {
    funnelLeads: { imported: 0, skipped: 0 },
    magnetDownloads: { imported: 0, skipped: 0 },
    webinarRegs: { imported: 0, skipped: 0 },
  };

  // 1. Funnel leads
  const leads = await db.select().from(funnelLeads).where(eq(funnelLeads.accountId, accountId));
  for (const lead of leads) {
    const { created } = await userDb.crm.importFromSource({
      sourceId: lead.id,
      source: "funnel",
      name: lead.name,
      whatsappNumber: normaliseWhatsAppNumber(lead.whatsappNumber),
      email: lead.email ?? undefined,
    });
    if (created) result.funnelLeads.imported++;
    else result.funnelLeads.skipped++;
  }

  // 2. Lead magnet downloads
  const downloads = await db.select().from(leadMagnetDownloads).where(eq(leadMagnetDownloads.accountId, accountId));
  for (const dl of downloads) {
    const { created } = await userDb.crm.importFromSource({
      sourceId: dl.id,
      source: "lead_magnet",
      name: dl.name,
      whatsappNumber: normaliseWhatsAppNumber(dl.whatsappNumber),
      email: dl.email ?? undefined,
    });
    if (created) result.magnetDownloads.imported++;
    else result.magnetDownloads.skipped++;
  }

  // 3. Webinar registrations
  const regs = await db.select().from(webinarRegistrations).where(eq(webinarRegistrations.accountId, accountId));
  for (const reg of regs) {
    const { created } = await userDb.crm.importFromSource({
      sourceId: reg.id,
      source: "webinar",
      name: reg.name,
      whatsappNumber: normaliseWhatsAppNumber(reg.whatsappNumber),
      email: reg.email ?? undefined,
    });
    if (created) result.webinarRegs.imported++;
    else result.webinarRegs.skipped++;
  }

  return result;
}
```

---

## 7. Validators

Create `lib/validators/crm.ts`:

```typescript
import { z } from "zod";
import { PIPELINE_STAGES } from "@/lib/crm/types";

export const CreateContactSchema = z.object({
  name: z.string().min(1, "Name required").max(100),
  whatsappNumber: z.string().min(8, "WhatsApp number too short").max(20),
  email: z.string().email().optional().or(z.literal("")),
  notes: z.string().max(2000).optional().or(z.literal("")),
  stage: z.enum(PIPELINE_STAGES).default("new"),
});

export const UpdateContactSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  whatsappNumber: z.string().min(8).max(20).optional(),
  email: z.string().email().optional().or(z.literal("")),
  notes: z.string().max(2000).optional().or(z.literal("")),
  lastContactedAt: z.string().datetime().optional().nullable(),
});

export const MoveStageSchema = z.object({
  stage: z.enum(PIPELINE_STAGES),
});
```

Create `lib/crm/types.ts`:

```typescript
export const PIPELINE_STAGES = [
  "new",
  "warm",
  "hot",
  "customer",
  "team_member",
] as const;
export type PipelineStage = typeof PIPELINE_STAGES[number];

export const STAGE_LABELS: Record<PipelineStage, string> = {
  new: "New",
  warm: "Warm",
  hot: "Hot",
  customer: "Customer",
  team_member: "Team Member",
};

export const STAGE_COLORS: Record<PipelineStage, string> = {
  new: "bg-slate-100 text-slate-700",
  warm: "bg-amber-100 text-amber-700",
  hot: "bg-orange-100 text-orange-700",
  customer: "bg-green-100 text-green-700",
  team_member: "bg-purple-100 text-purple-700",
};

export const SOURCE_LABELS: Record<string, string> = {
  funnel: "Funnel",
  lead_magnet: "Lead Magnet",
  webinar: "Webinar",
  manual: "Manual",
};
```

---

## 8. API Routes

All routes are auth-protected. No public endpoints in this module.

### GET `/api/crm/contacts`
**Auth:** `getAccountFromSession()`

Query params:
- `stage?: PipelineStage` — filter by stage
- `includeArchived?: "true"` — include archived contacts
- `limit?: number` — default 500

Returns: `{ contacts: Contact[], countByStage: Record<PipelineStage, number> }`

### POST `/api/crm/contacts`
**Auth:** `getAccountFromSession()`

Body: `CreateContactSchema`

Logic:
1. Normalise WhatsApp: `normaliseWhatsAppNumber(data.whatsappNumber)`
2. Check for existing contact by WhatsApp: `userDb.crm.getByWhatsApp(normalised)` → return 409 if exists
3. `userDb.crm.create({ name, whatsappNumber: normalised, email, notes, stage, source: "manual" })`
4. Log activity: `{ type: "manual_contact", payload: { note: "Contact created manually." } }`
5. Return `{ contact }` with 201

### GET `/api/crm/contacts/[contactId]`
**Auth:** `getAccountFromSession()`
Returns contact + recent activities (last 20).
Response: `{ contact: Contact, activities: ContactActivity[] }`

### PUT `/api/crm/contacts/[contactId]`
**Auth:** `getAccountFromSession()`
Body: `UpdateContactSchema`
Updates name/email/notes/lastContactedAt.
If `lastContactedAt` updated → log activity: `{ type: "manual_contact" }`
Returns updated contact.

### POST `/api/crm/contacts/[contactId]/stage`
**Auth:** `getAccountFromSession()`
Body: `MoveStageSchema`

Logic:
1. Load contact: `userDb.crm.get(contactId)` → 404 if not found
2. If `stage === contact.stage` → return 200 (no-op)
3. `userDb.crm.moveStage(contactId, stage)` — this also logs the stage_change activity
4. Return `{ contact: updatedContact }`

### POST `/api/crm/contacts/[contactId]/whatsapp-sent`
**Auth:** `getAccountFromSession()`
No body needed.

Marks that the distributor tapped the WhatsApp button for this contact.
Logic:
1. `userDb.crm.update(contactId, { lastContactedAt: new Date() })`
2. `userDb.crm.logActivity({ contactId, activityType: "whatsapp_sent", payload: null })`
3. Return `{ ok: true }`

This is a lightweight signal — just for tracking last-contacted recency.
The actual WhatsApp conversation happens outside the app.

### POST `/api/crm/contacts/[contactId]/archive`
**Auth:** `getAccountFromSession()`
`userDb.crm.archive(contactId)`. Return `{ ok: true }`.

### POST `/api/crm/contacts/[contactId]/unarchive`
**Auth:** `getAccountFromSession()`
`userDb.crm.unarchive(contactId)`. Return `{ ok: true }`.

### POST `/api/crm/sync`
**Auth:** `getAccountFromSession()`
Triggers `syncContactsFromSources(session.id)`.
Returns `{ result: SyncResult }`.
This may take a few seconds for large contact lists — that's acceptable.

---

## 9. Authenticated UI

### Page: `app/(app)/contacts/page.tsx`
**Server Component.** Fetches initial data, renders Kanban.

On first load: if `contacts` is empty, auto-trigger sync
(call `POST /api/crm/sync` in a `useEffect` on the client — or better,
run sync server-side in the page itself before rendering and redirect with fresh data).

**Layout — Kanban view (default):**
```
Contacts                  [+ Add Contact]  [Sync]  [List View]

┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌───────────┐
│ NEW   3  │ │ WARM  7  │ │ HOT   2  │ │CUSTOMER 5│ │TEAM MBR 1 │
├──────────┤ ├──────────┤ ├──────────┤ ├──────────┤ ├───────────┤
│ ┌──────┐ │ │ ┌──────┐ │ │ ┌──────┐ │ │ ┌──────┐ │ │ ┌───────┐ │
│ │Ali   │ │ │ │Siti  │ │ │ │Muthu │ │ │ │Jenny │ │ │ │Farah  │ │
│ │WhatsA│ │ │ │WhatsA│ │ │ │WhatsA│ │ │ │WhatsA│ │ │ │WhatsA │ │
│ │Funnel│ │ │ │Webinar│ │ │ │Manual│ │ │ │Magnet│ │ │ │Manual │ │
│ │3d ago│ │ │ │1d ago│ │ │ │Today │ │ │ │5d ago│ │ │ │2w ago │ │
│ └──────┘ │ │ └──────┘ │ │ └──────┘ │ │ └──────┘ │ │ └───────┘ │
│          │ │          │ │          │ │          │ │           │
└──────────┘ └──────────┘ └──────────┘ └──────────┘ └───────────┘
```

**Kanban is read-only on mobile** (drag-drop only on desktop ≥ 1024px).
On mobile: use the contact detail page to change stages via dropdown.

**Contact card (minimum info):**
- Name (bold)
- WhatsApp button → calls `POST /api/crm/contacts/[id]/whatsapp-sent` then opens `wa.me` link
- Source badge (Funnel / Lead Magnet / Webinar / Manual)
- Last contacted: "3d ago" / "Today" / "Never" (relative time)
- Stage dropdown (alternative to drag-drop — always available)

**View toggle:** Kanban ↔ List. Preference stored in `localStorage`.

**List view:**
```
Name          WhatsApp  Stage      Source    Last Contacted  Actions
Ali Bin Ahmad [W]       Warm       Funnel    3 days ago      [→] [Archive]
Siti Rahimah  [W]       New        Webinar   Never           [→] [Archive]
```
Sortable by name, stage, last-contacted. Filterable by stage (dropdown).

### Component: `app/(app)/contacts/_components/contact-card.tsx`
The Kanban card. Props: `contact: Contact`.

**WhatsApp button behaviour:**
1. Build wa.me link: `buildWaLink(contact.whatsappNumber, preFilledMessage)` where:
   ```
   preFilledMessage = `Hi ${contact.name}, `
   ```
   (minimal pre-fill — distributor types the rest)
2. On click:
   - Fire `POST /api/crm/contacts/{id}/whatsapp-sent` (non-blocking, fire-and-forget)
   - `window.open(waLink, "_blank")`

**Stage dropdown on card:** `<select>` with all 5 stages. On change → `POST /api/crm/contacts/{id}/stage`. Optimistic update the card immediately.

**Drag-and-drop (desktop only):**
Use the HTML5 Drag and Drop API (no external library). When a card is dropped
onto a column: `POST /api/crm/contacts/{id}/stage` with the target stage.
Revert on API error.

### Page: `app/(app)/contacts/[contactId]/page.tsx`
**Client Component.** Contact detail view.

```
← Back to Contacts

Ali Bin Ahmad
Warm | Funnel | 3 days ago

[WhatsApp Ali]   [Move Stage ▼]   [Archive]

──── Details ────
WhatsApp: +60123456789
Email:    ali@example.com

──── Notes ────
[Textarea — editable, auto-save on blur]
[Last saved: just now]

──── Mark Contacted ────
[✓ Mark as Contacted Today]

──── Activity Log ────
● Stage moved: New → Warm (2 days ago)
● WhatsApp sent (3 days ago)
● Note added (4 days ago)
● Contact created from Funnel (5 days ago)
```

**Auto-save notes:** `PUT /api/crm/contacts/[id]` called 1 second after last keystroke
(debounced). Show "Saving…" / "Saved" indicator.

### Component: `app/(app)/contacts/_components/add-contact-modal.tsx`
Modal form for manual contact creation:
- Name (required)
- WhatsApp number (required)
- Email (optional)
- Initial stage (dropdown, default: New)
- Notes (optional)

On submit: `POST /api/crm/contacts`. On success → close modal, add card to Kanban.

### Component: `app/(app)/contacts/_components/sync-banner.tsx`
Shown at top of Kanban when there are unsynced contacts.
"You have new leads from your funnels. [Sync Now]"
Calls `POST /api/crm/sync`, refreshes the page on completion.

### Update sidebar: `app/(app)/_components/app-sidebar.tsx`
Set `available: true` for Contacts nav item. It's already listed:
```typescript
{ label: "Contacts", href: "/contacts", icon: "👥", available: false },
```
Change to `available: true`.

---

## 10. Rules & Constraints

### R1: Account Isolation (absolute)
Every `contacts` and `contact_activities` query MUST use `scopedDb(accountId)`.
The sync function (`lib/crm/sync.ts`) reads from source tables via direct `db`
but scopes to `accountId` in the WHERE clause — acceptable and intentional.
Mark with comment: `// Sync reads cross-table directly, filtered by accountId`.

### R2: No WhatsApp API
The WhatsApp button opens a `wa.me` deep link in a new tab.
No API call to WhatsApp. No session, no token, no business account integration.
The `whatsapp-sent` endpoint just logs the tap locally — it does not confirm
delivery or that a conversation actually started.

### R3: Deduplication by WhatsApp number
Within one account, `(account_id, whatsapp_number)` is UNIQUE.
If the same person submits a funnel and downloads a magnet, they get ONE contact.
`importFromSource` handles this silently (ON CONFLICT DO NOTHING).
The first source that created the contact is preserved in `source` / `source_id`.

### R4: Archived ≠ deleted
Hard delete of contacts is admin-only. Distributors archive contacts.
Archived contacts are excluded from Kanban and list view by default.
An "Archived" filter or tab lets distributors review and unarchive.

### R5: Activity log is append-only
No UPDATE or DELETE on `contact_activities` from application layer.
Logged activities: `stage_change`, `note_added`, `whatsapp_sent`, `manual_contact`.
`note_added` is logged when `notes` field changes (detect by comparing old vs. new in PUT handler).

### R6: PDPA
WhatsApp numbers are personal data — never log to console.
`ip_address` from source tables is never copied to contacts table.
Contacts page is auth-protected — personal data only visible to the account owner.

### R7: TypeScript strict
- No `any`
- `noUncheckedIndexedAccess` ON
- All types exported from `lib/db/schema/crm.ts`
- Pipeline stage constants in `lib/crm/types.ts` (single source of truth)

### R8: Kanban performance
500 contacts max per default list query.
If a distributor has > 500 contacts, show "Showing first 500. Use search to find more."
(Search is a nice-to-have — add as a basic `WHERE name ILIKE '%query%'` filter if time allows.)

---

## 11. Tests Required

Create `tests/crm.test.ts`:

1. **Pipeline stages — all 5 stages defined**: `PIPELINE_STAGES.length === 5` and includes `"team_member"`
2. **Deduplication — same WhatsApp → one contact**: `importFromSource` called twice with same number → second call returns `created: false`
3. **Account isolation — contacts scoped to account**: `list()` via `scopedDb("acct-A")` does NOT return contacts from `acct-A`'s sister account `"acct-B"` (mock returns empty for wrong account)
4. **Stage move — activity logged**: `moveStage()` → `logActivity` called with `activityType: "stage_change"`
5. **Stage move — same stage is no-op**: `POST /api/crm/contacts/[id]/stage` with current stage → returns 200, no DB update called
6. **WhatsApp button fires log then opens link**: `POST /api/crm/contacts/[id]/whatsapp-sent` → `lastContactedAt` updated + activity logged
7. **Archive — contact hidden from default list**: after `archive()`, `list({ includeArchived: false })` excludes it
8. **Archive — contact visible with includeArchived flag**: `list({ includeArchived: true })` includes it
9. **Manual contact creation — duplicate WhatsApp rejected**: contact exists with number → `POST /api/crm/contacts` returns 409
10. **Sync — funnel leads imported**: `syncContactsFromSources` with 3 funnel leads → result.funnelLeads.imported === 3
11. **Sync — idempotent**: running sync twice → second run: all skipped (imported: 0)
12. **countByStage — returns correct shape**: returns object with all 5 stage keys as numbers
13. **Notes change logs activity**: PUT with new notes value → `note_added` activity logged
14. **wa.me link format**: `buildWaLink("60123456789", "Hi Ali, ")` → `"https://wa.me/60123456789?text=Hi%20Ali%2C%20"`

Target: 14 new tests. Total: 78 + 14 = **92 tests**.

---

## 12. File Checklist

```
lib/
  db/
    schema/
      crm.ts                  ← NEW (contacts, contact_activities)
      index.ts                ← UPDATE (add crm export)
    scoped.ts                 ← UPDATE (add crm namespace)
  crm/
    types.ts                  ← NEW (PIPELINE_STAGES, STAGE_LABELS, STAGE_COLORS, SOURCE_LABELS)
    sync.ts                   ← NEW (syncContactsFromSources)
  validators/
    crm.ts                    ← NEW (CreateContactSchema, UpdateContactSchema, MoveStageSchema)

drizzle/
  0008_crm.sql                ← NEW

app/
  (app)/
    contacts/
      page.tsx                ← NEW (Kanban + List view — client component for interactivity)
      [contactId]/
        page.tsx              ← NEW (contact detail + activity log)
      _components/
        contact-card.tsx      ← NEW (Kanban card with WhatsApp button + stage dropdown)
        contact-kanban.tsx    ← NEW (5-column Kanban board with drag-drop)
        contact-list.tsx      ← NEW (sortable/filterable list view)
        add-contact-modal.tsx ← NEW (manual add form)
        sync-banner.tsx       ← NEW (sync prompt when unsynced leads exist)
    _components/
      app-sidebar.tsx         ← UPDATE (Contacts: available: true)

  api/
    crm/
      contacts/
        route.ts              ← NEW (GET list, POST create)
        [contactId]/
          route.ts            ← NEW (GET detail+activities, PUT update)
          stage/route.ts      ← NEW (POST move stage)
          whatsapp-sent/route.ts ← NEW (POST log tap)
          archive/route.ts    ← NEW (POST)
          unarchive/route.ts  ← NEW (POST)
      sync/route.ts           ← NEW (POST)

tests/
  crm.test.ts                 ← NEW
```

---

## 13. Definition of Done

- [ ] `npx tsc --noEmit` → 0 errors
- [ ] `npx vitest run` → 92 tests pass (78 existing + 14 new)
- [ ] `npx drizzle-kit generate` → generates 0008 without errors
- [ ] `npx next build` → build succeeds
- [ ] Kanban renders all 5 stages with correct contact counts
- [ ] WhatsApp button opens `wa.me` link in new tab
- [ ] `POST /api/crm/contacts/[id]/whatsapp-sent` updates `last_contacted_at`
- [ ] Stage drag-and-drop works on desktop (≥ 1024px), falls back to dropdown on mobile
- [ ] Sync imports funnel leads, magnet downloads, and webinar registrations
- [ ] Sync is idempotent — running twice doesn't duplicate contacts
- [ ] Dedup by WhatsApp within account enforced (409 on manual add, silent on sync)
- [ ] Archived contacts excluded from Kanban and list by default
- [ ] Notes auto-save on blur with debounce
- [ ] Activity log shown on contact detail page
- [ ] Contacts nav item `available: true` in sidebar
- [ ] WhatsApp numbers NOT logged to console anywhere

---

## 14. Start Order (Recommended Sequence)

1. `lib/crm/types.ts` (constants first — everything imports from here)
2. `lib/db/schema/crm.ts`
3. `lib/db/schema/index.ts` (add export)
4. `drizzle/0008_crm.sql`
5. `lib/db/scoped.ts` (add crm namespace)
6. `lib/validators/crm.ts`
7. `lib/crm/sync.ts` (reads from existing source tables)
8. API routes: `contacts` CRUD → `stage` → `whatsapp-sent` → `archive/unarchive` → `sync`
9. `app/(app)/contacts/page.tsx` (Kanban shell — render static columns first)
10. `app/(app)/contacts/_components/contact-card.tsx`
11. `app/(app)/contacts/_components/contact-kanban.tsx` (wire drag-drop)
12. `app/(app)/contacts/_components/contact-list.tsx`
13. `app/(app)/contacts/_components/add-contact-modal.tsx`
14. `app/(app)/contacts/_components/sync-banner.tsx`
15. `app/(app)/contacts/[contactId]/page.tsx` (detail + activity log)
16. Update sidebar (`app-sidebar.tsx`)
17. `tests/crm.test.ts`
18. Final: `tsc --noEmit` + `vitest run` + `next build`
