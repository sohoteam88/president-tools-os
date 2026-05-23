# Codex Task Brief — Admin Panel + Production Polish
# President Tools OS — Phase 11 (Final)
#
# HOW TO RUN:
#   codex --model o3 --approval-mode auto-edit "$(cat CODEX_ADMIN_POLISH.md)"
#
# PREREQUISITES: All previous phases (1–10) complete.
# This is the final phase. It completes the Admin Panel and polishes the entire app
# for internal rollout to 50 downline members.
# IMPORTANT: Read every section before writing any code.

---

## 1. Mission

This phase does two things:

**A. Complete the Admin Panel** — Steven needs a fully functional admin dashboard
to manage invites, accounts, monitor usage, and keep the team healthy.
The admin shell already exists (Phase 1). Some admin pages were built in earlier
phases (magnets, webinars, objections). This phase fills in what's missing:
invite management, account oversight, and a usage/cost dashboard.

**B. Production Polish** — Before rolling out to 50 members, the app needs:
- Consistent loading skeletons on every list page (no blank flashes)
- Empty states with clear CTAs on every list page
- Toast notifications for all async mutations
- A global error boundary
- Mobile layout check on all public pages (funnel, magnet, webinar, objection copy)
- Final `next build` clean run

This phase does NOT add any new modules or schema changes (no new migrations).
It is purely completing and polishing what's already built.

---

## 2. Part A — Admin Panel Completion

### 2a. Invite Management

The invite system already exists (`lib/auth/invite.ts`, `POST /api/accounts/invite`).
What's missing is a UI for Steven to manage invites.

#### Page: `app/(admin)/admin/invites/page.tsx`
Server Component.

```
Invites

[+ Send Invite]

── Pending (3) ──────────────────────────────────────────────────────

┌────────────────────────────────────────────────────────────────────┐
│ sherry@gmail.com          Sent 2 days ago      Expires in 5 days   │
│ Account: Sherry Lim                                                │
│ [Revoke]  [Copy Link]                                              │
└────────────────────────────────────────────────────────────────────┘

── Accepted (47) ────────────────────────────────────────────────────

┌────────────────────────────────────────────────────────────────────┐
│ ali@gmail.com             Accepted 5 days ago                      │
│ Account: Ali Bin Ahmad    Role: owner                              │
└────────────────────────────────────────────────────────────────────┘
```

**[+ Send Invite] modal:**
- Email address (required)
- Account name (required — pre-creates the account record)
- Herbalife ID (optional)
- Role: owner (default, non-changeable — all distributors are owners of their account)
- [Send Invite] → calls existing `POST /api/accounts/invite`

**[Copy Link]:** copies the invite URL `{origin}/invite/{token}` to clipboard.

**[Revoke]:** `DELETE /api/accounts/invite/[token]`

#### New API: `DELETE /api/accounts/invite/[token]`
**Auth:** `requireAdmin()`

Logic:
1. Load invite token from `inviteTokens` table
2. If `usedAt IS NOT NULL` → return 400 `{ error: "Invite already used." }`
3. Delete from `inviteTokens`
4. Audit log: `"invite.revoked"`
5. Return `{ ok: true }`

#### New API: `GET /api/admin/invites`
**Auth:** `requireAdmin()`

Returns all invite tokens with account info joined.

Response:
```typescript
{
  pending: InviteWithAccount[];   // usedAt IS NULL AND expiresAt > now
  expired: InviteWithAccount[];   // usedAt IS NULL AND expiresAt <= now
  accepted: InviteWithAccount[];  // usedAt IS NOT NULL
}
```

---

### 2b. Account Management

The accounts list page already exists at `app/(admin)/admin/accounts/page.tsx` (Phase 1).
It's currently a stub. Flesh it out.

#### Updated: `app/(admin)/admin/accounts/page.tsx`

```
Accounts (50 total — 48 active, 2 inactive)

[Search by name or email]                    [Filter: Active ▼]

┌────────────────────────────────────────────────────────────────────┐
│ Sherry Lim              sherry@gmail.com           Active          │
│ slug: sherry  |  Funnel: 1 published  |  CRM: 23 contacts          │
│ Joined: 15 May 2026  |  Last login: today                          │
│ [View]  [Deactivate]                                               │
└────────────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────────┐
│ Ali Bin Ahmad           ali@gmail.com              ○ Inactive       │
│ slug: —  |  Setup: incomplete                                      │
│ Joined: 18 May 2026  |  Last login: 3 days ago                    │
│ [View]  [Reactivate]                                               │
└────────────────────────────────────────────────────────────────────┘
```

**[View]** → `app/(admin)/admin/accounts/[accountId]/page.tsx` — account detail.

#### New: `app/(admin)/admin/accounts/[accountId]/page.tsx`
Account detail view for admin. Shows:
- Account info (name, email, slug, seniority, onboarding path)
- Module activation status (which modules the distributor has used)
- Key counts: contacts, voice captures, content drafts, funnels, magnet downloads, webinar registrations
- Audit log (last 20 entries for this account)
- [Deactivate / Reactivate] toggle
- [Reset Setup] — clears `setup_wizard_completed_at` so they go through setup again

#### New API: `GET /api/admin/accounts/[accountId]`
**Auth:** `requireAdmin()`

Returns detailed account info with cross-table counts.

Response:
```typescript
{
  account: Account;
  stats: {
    voiceCaptures: number;
    contentDrafts: number;
    funnels: number;
    contacts: number;
    magnetDownloads: number;
    webinarRegistrations: number;
    adEntries: number;
  };
  recentAuditLogs: AuditLog[];  // last 20
}
```

Use `adminDb` for all cross-table queries. Mark each with `// ADMIN: cross-account query intentional`.

#### New API: `PATCH /api/admin/accounts/[accountId]`
**Auth:** `requireAdmin()`

Body:
```typescript
z.object({
  isActive: z.boolean().optional(),
  resetSetup: z.boolean().optional(),   // if true → clears setup_wizard_completed_at
})
```

---

### 2c. Usage & Cost Dashboard

#### Page: `app/(admin)/admin/usage/page.tsx`
Server Component. Gives Steven visibility into AI token usage and feature adoption.

```
Usage & Costs — May 2026

── AI Token Usage (this month) ──────────────────────────────────────

  Voice Profiles (Claude Sonnet):   ~42,000 tokens   ≈ RM X
  Content Studio (Claude Sonnet):   ~38,000 tokens   ≈ RM X
  Follow-up Coach (Claude Haiku):   ~12,000 tokens   ≈ RM X
  Objection Drafts (Claude Haiku):  ~3,000 tokens    ≈ RM X
  Ad Analysis (Claude Haiku):       ~8,000 tokens    ≈ RM X
  OCR Screenshots (GPT-4o):         ~6,000 tokens    ≈ RM X
  ─────────────────────────────────────────────────────
  Total estimated:                                   ≈ RM X

── Feature Adoption ─────────────────────────────────────────────────

  Voice Capture:     38 / 50 members used (76%)
  Content Studio:    31 / 50 members used (62%)
  Funnels:           24 / 50 members published (48%)
  Lead Magnets:      19 / 50 members activated (38%)
  Webinar:           22 / 50 members activated (44%)
  CRM:               41 / 50 members have contacts (82%)
  Follow-up Coach:   35 / 50 members have tasks today (70%)
  Ad Insights:       12 / 50 members logged posts (24%)
  Objections:        28 / 50 members have favourites (56%)

── Recent Activity ──────────────────────────────────────────────────

  [Audit log — last 50 entries across all accounts]
```

**Token cost queries:** Read from `coach_generations` (prompt_tokens + completion_tokens),
`ad_analyses` (prompt_tokens + completion_tokens), and voice profile + content draft tables
if they store token counts. If token counts aren't stored in those tables, show "—" for
those rows rather than adding columns retroactively.

**Feature adoption:** Simple COUNT DISTINCT queries per module table, filtered to
the current month or all-time. Use `adminDb` raw queries.

#### New API: `GET /api/admin/usage`
**Auth:** `requireAdmin()`

Returns aggregated usage stats. All counts from `adminDb`.

---

### 2d. Admin Navigation

Update `app/(admin)/layout.tsx` — the admin topbar already exists.
Ensure navigation links are complete:

```typescript
const ADMIN_NAV = [
  { label: "Dashboard",  href: "/admin" },
  { label: "Accounts",   href: "/admin/accounts" },
  { label: "Invites",    href: "/admin/invites" },
  { label: "Lead Magnet",href: "/admin/magnets" },
  { label: "Webinar",    href: "/admin/webinars" },
  { label: "Objections", href: "/admin/objections" },
  { label: "Usage",      href: "/admin/usage" },
];
```

---

## 3. Part B — Production Polish

### 3a. Toast Notifications

Install `sonner` (lightweight toast library compatible with Next.js App Router):
```bash
npm install sonner
```

Add to `app/layout.tsx`:
```tsx
import { Toaster } from "sonner";
// Inside <body>:
<Toaster position="bottom-right" richColors />
```

**Apply toasts to all async mutations across the app:**

Every client component that calls a mutating API should show:
- Success: `toast.success("Saved")` / `toast.success("Done")`
- Error: `toast.error("Something went wrong. Please try again.")`

Pages/components that need toasts added (search for `fetch(` calls in client components):
- All funnel editor save/publish actions
- Lead magnet activate/deactivate/regenerate
- Webinar activate/deactivate
- CRM stage move, archive, note save
- Coach task status updates
- Objection favourite toggle, personal response save
- Ad entry save, OCR trigger, analysis generate

Pattern to use:
```typescript
import { toast } from "sonner";

async function handleSave() {
  try {
    const res = await fetch("/api/...", { method: "POST", ... });
    if (!res.ok) throw new Error();
    toast.success("Saved");
  } catch {
    toast.error("Something went wrong. Please try again.");
  }
}
```

---

### 3b. Loading Skeletons

Every page that fetches data should show a skeleton while loading,
not a blank screen. Use Tailwind's `animate-pulse` for consistency.

Create `app/(app)/_components/skeleton.tsx`:
```tsx
/**
 * Generic skeleton components for loading states.
 * Use these in Suspense fallbacks and loading.tsx files.
 */
export function SkeletonCard() {
  return (
    <div className="rounded-lg border border-border bg-card p-4 animate-pulse space-y-3">
      <div className="h-4 w-2/3 bg-muted rounded" />
      <div className="h-3 w-full bg-muted rounded" />
      <div className="h-3 w-4/5 bg-muted rounded" />
    </div>
  );
}

export function SkeletonList({ count = 3 }: { count?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonCard key={i} />
      ))}
    </div>
  );
}

export function SkeletonKanban() {
  return (
    <div className="flex gap-4 overflow-x-auto">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="w-48 flex-shrink-0 space-y-3">
          <div className="h-5 w-24 bg-muted rounded animate-pulse" />
          <SkeletonCard />
          <SkeletonCard />
        </div>
      ))}
    </div>
  );
}
```

Add `loading.tsx` files for the following routes (Next.js shows these automatically
while the Server Component fetches data):

```
app/(app)/dashboard/loading.tsx       → <SkeletonList count={2} />
app/(app)/voice/loading.tsx           → <SkeletonList count={3} />
app/(app)/content/loading.tsx         → <SkeletonList count={3} />
app/(app)/funnels/loading.tsx         → <SkeletonList count={2} />
app/(app)/magnets/loading.tsx         → <SkeletonCard />
app/(app)/webinars/loading.tsx        → <SkeletonCard />
app/(app)/contacts/loading.tsx        → <SkeletonKanban />
app/(app)/coach/loading.tsx           → <SkeletonList count={5} />
app/(app)/analytics/loading.tsx       → <SkeletonList count={3} />
app/(app)/objections/loading.tsx      → <SkeletonList count={4} />
app/(admin)/admin/loading.tsx         → <SkeletonList count={3} />
app/(admin)/admin/accounts/loading.tsx → <SkeletonList count={5} />
app/(admin)/admin/invites/loading.tsx  → <SkeletonList count={3} />
```

---

### 3c. Empty States

Every list page should show a helpful empty state instead of nothing.

Create `app/(app)/_components/empty-state.tsx`:
```tsx
interface EmptyStateProps {
  icon: string;
  title: string;
  description: string;
  action?: { label: string; href?: string; onClick?: () => void };
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center space-y-3">
      <span className="text-4xl">{icon}</span>
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      <p className="text-xs text-muted-foreground max-w-xs">{description}</p>
      {action && (
        action.href
          ? <a href={action.href} className="text-xs text-primary underline">{action.label}</a>
          : <button onClick={action.onClick} className="text-xs text-primary underline">{action.label}</button>
      )}
    </div>
  );
}
```

Apply to each module:

| Page | Empty state message | CTA |
|------|-------------------|-----|
| Voice | "No recordings yet" | "Record your Why Story →" |
| Content | "No drafts yet" | "Create your first draft →" |
| Funnels | "No funnels yet" | "Build your first funnel →" |
| Contacts | "No contacts yet" | "Sync from your funnels →" |
| Coach | "You're all caught up!" | — |
| Analytics | "No posts logged yet" | "Log your first post →" |
| Objections | "No responses available" | — |
| Webinar registrations | "No registrations yet" | — |
| Lead magnet downloads | "No downloads yet" | — |
| CRM contacts/[id] activities | "No activity recorded yet" | — |
| Admin accounts | "No accounts found" | — |
| Admin invites pending | "No pending invites" | "Send an invite →" |

---

### 3d. Global Error Boundary

Create `app/(app)/error.tsx`:
```tsx
"use client";

import { useEffect } from "react";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log to Sentry in production
    console.error(error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-4 text-center px-4">
      <h2 className="text-lg font-semibold text-foreground">Something went wrong</h2>
      <p className="text-sm text-muted-foreground max-w-sm">
        An unexpected error occurred. Please try refreshing the page.
        If the problem persists, contact your upline.
      </p>
      <button
        onClick={reset}
        className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
      >
        Try again
      </button>
    </div>
  );
}
```

Also create `app/(admin)/error.tsx` with the same structure but add:
```
If you're seeing this as admin, check the server logs.
```

---

### 3e. Not-Found Pages

Ensure `app/not-found.tsx` (global 404) exists and is styled:
```tsx
export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen space-y-3 text-center px-4">
      <h1 className="text-2xl font-semibold text-foreground">Page not found</h1>
      <p className="text-sm text-muted-foreground">
        The page you're looking for doesn't exist.
      </p>
      <a href="/dashboard" className="text-sm text-primary underline">
        Back to Dashboard
      </a>
    </div>
  );
}
```

---

### 3f. Dashboard Completion

The dashboard (`app/(app)/dashboard/page.tsx`) currently shows a module grid
and the Follow-up Coach task widget. Complete it with:

**Quick stats bar:**
```
┌──────────────┬──────────────┬──────────────┬──────────────┐
│ 23 Contacts  │ 3 Tasks today│ 1 Funnel live│ 47 Downloads │
└──────────────┴──────────────┴──────────────┴──────────────┘
```

Fetch these counts in the Server Component using `scopedDb`:
- Contacts: `userDb.crm.countByStage()` → sum all stages
- Tasks today: `userDb.coach.countPendingToday(todayMyt)`
- Published funnels: `userDb.funnels.list()` → filter `status === "published"`
- Magnet downloads: `userDb.magnets.listDownloads(1)` → total count via separate count query

**Module grid (already exists — update available states):**
All 11 modules should now be shown. Modules with `available: true` are clickable cards.
Add `Objections` card to the grid if not already present.

---

### 3g. Mobile Responsiveness — Public Pages

All public pages (funnel, magnet, webinar registration, webinar replay) are already
designed mobile-first. Do a final pass to confirm:

- Max-width container is `max-w-[500px]` or `max-w-[640px]` with `mx-auto px-4`
- Buttons are at least `44px` tall (touch target)
- Font size: body text minimum `text-base` (16px) on mobile
- Form inputs have `text-base` to prevent iOS auto-zoom on focus
- iframe (webinar replay) uses `padding-top: 56.25%` aspect-ratio trick

Fix any that don't meet these criteria. No layout changes needed for authenticated
pages — this is a desktop-first internal tool used on laptop/desktop.

---

### 3h. Security Headers

Update `next.config.ts` to add security headers:

```typescript
const securityHeaders = [
  { key: "X-DNS-Prefetch-Control", value: "on" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(self), geolocation=()",
    // microphone=(self) allows Voice Capture on the app's own origin
  },
];

// In nextConfig:
async headers() {
  return [
    {
      source: "/(.*)",
      headers: securityHeaders,
    },
  ];
},
```

Note: `X-Frame-Options: SAMEORIGIN` allows the Bunny.net iframe embed to work
(it's loaded from an external domain in the visitor's browser, not framed by us).
Actually Bunny.net loads in the visitor's browser directly — our app is not
inside an iframe, the iframe is inside our app. `SAMEORIGIN` is correct.

---

## 4. Validators

No new validator files needed. This phase uses existing validators throughout.

---

## 5. API Routes Summary (new in this phase)

```
GET  /api/admin/invites                 ← NEW (list all invites with account info)
DELETE /api/accounts/invite/[token]     ← NEW (revoke an invite)
GET  /api/admin/accounts/[accountId]   ← NEW (account detail + stats)
PATCH /api/admin/accounts/[accountId]  ← NEW (deactivate/reactivate/reset setup)
GET  /api/admin/usage                  ← NEW (token usage + feature adoption)
```

---

## 6. Tests Required

Create `tests/admin-polish.test.ts`:

1. **Invite revoke — blocks used invite**: invite with `usedAt` set → `DELETE /api/accounts/invite/[token]` returns 400
2. **Invite revoke — removes pending invite**: invite with `usedAt: null` → 200, row deleted
3. **Account deactivate — sets isActive false**: `PATCH /api/admin/accounts/[id]` with `{ isActive: false }` → account updated
4. **Account reset setup — clears completedAt**: `{ resetSetup: true }` → `setup_wizard_completed_at` set to null
5. **Usage stats — returns correct shape**: `GET /api/admin/usage` → response has `adoption` and `tokenUsage` keys
6. **Toast — success shown on stage move**: mock `fetch` resolving ok → `toast.success` called (component test)
7. **Toast — error shown on API failure**: mock `fetch` rejecting → `toast.error` called
8. **Empty state — renders when list is empty**: contacts page with empty array → `EmptyState` component rendered
9. **Loading skeleton — renders during suspense**: `loading.tsx` exports a component that renders without error
10. **Security headers — X-Frame-Options present**: `next.config.ts` headers include `X-Frame-Options`
11. **MYT date — coach widget uses MYT date**: dashboard fetches tasks for MYT date, not UTC date
12. **Admin nav — all 7 links present**: admin layout renders all 7 nav items
13. **Not-found — global 404 renders**: `app/not-found.tsx` renders without error
14. **Dashboard stats — counts all pipeline stages**: `countByStage()` summed correctly across all 5 stages

Target: 14 new tests. Total: 135 + 14 = **149 tests**.

---

## 7. File Checklist

```
── New files ─────────────────────────────────────────────────────────

app/
  not-found.tsx                     ← NEW (global 404)
  (app)/
    error.tsx                       ← NEW (app error boundary)
    dashboard/
      loading.tsx                   ← NEW
    voice/loading.tsx               ← NEW
    content/loading.tsx             ← NEW
    funnels/loading.tsx             ← NEW
    magnets/loading.tsx             ← NEW
    webinars/loading.tsx            ← NEW
    contacts/loading.tsx            ← NEW
    coach/loading.tsx               ← NEW
    analytics/loading.tsx           ← NEW
    objections/loading.tsx          ← NEW
    _components/
      skeleton.tsx                  ← NEW
      empty-state.tsx               ← NEW
  (admin)/
    error.tsx                       ← NEW
    admin/
      loading.tsx                   ← NEW
      accounts/
        loading.tsx                 ← NEW
        [accountId]/
          page.tsx                  ← NEW (account detail)
      invites/
        page.tsx                    ← NEW (invite management)
        loading.tsx                 ← NEW
      usage/
        page.tsx                    ← NEW (usage dashboard)

  api/
    admin/
      invites/route.ts              ← NEW (GET all invites)
      accounts/
        [accountId]/route.ts        ← NEW (GET detail, PATCH update)
      usage/route.ts                ← NEW (GET usage stats)
    accounts/
      invite/
        [token]/route.ts            ← NEW (DELETE revoke)

── Updated files ─────────────────────────────────────────────────────

package.json                        ← UPDATE (add "sonner")
app/layout.tsx                      ← UPDATE (add <Toaster />)
next.config.ts                      ← UPDATE (security headers)
app/(admin)/layout.tsx              ← UPDATE (complete nav links)
app/(admin)/admin/accounts/page.tsx ← UPDATE (flesh out from stub)
app/(app)/dashboard/page.tsx        ← UPDATE (quick stats bar)

── Toast additions (client components across all modules) ───────────
  Add toast.success/error to every async mutation handler.
  Files to update: voice, content, funnels, magnets, webinars,
  contacts, coach, analytics, objections client components.

tests/
  admin-polish.test.ts              ← NEW
```

---

## 8. Definition of Done

- [ ] `npx tsc --noEmit` → 0 errors
- [ ] `npx vitest run` → 149 tests pass (135 existing + 14 new)
- [ ] `npx next build` → clean build, 0 errors, 0 warnings
- [ ] All 11 sidebar modules show `available: true`
- [ ] Every list page has a loading skeleton (`loading.tsx`)
- [ ] Every list page has an empty state component
- [ ] Toast appears on success AND error for all async mutations
- [ ] Global error boundary renders without crashing
- [ ] Global 404 page renders correctly
- [ ] Admin nav has all 7 links (Dashboard, Accounts, Invites, Lead Magnet, Webinar, Objections, Usage)
- [ ] Admin can send invite, view pending invites, revoke invite, copy invite link
- [ ] Admin account detail page shows stats + last 20 audit logs
- [ ] Admin can deactivate/reactivate accounts
- [ ] Admin can reset a member's setup wizard
- [ ] Usage dashboard shows feature adoption counts
- [ ] Security headers in `next.config.ts`
- [ ] Public pages pass mobile touch target check (buttons ≥ 44px)
- [ ] `sonner` installed and `<Toaster />` in root layout
- [ ] No `console.log` statements left in production code (search and remove)

---

## 9. Start Order (Recommended Sequence)

1. `npm install sonner` + update `package.json`
2. `app/layout.tsx` — add `<Toaster />`
3. `app/(app)/_components/skeleton.tsx` + `empty-state.tsx`
4. All `loading.tsx` files (copy-paste pattern, fast)
5. `app/not-found.tsx` + `app/(app)/error.tsx` + `app/(admin)/error.tsx`
6. Apply empty states to each list page (search for empty array renders)
7. Apply toasts to all client component mutation handlers (systematic search for `fetch(`)
8. New admin API routes: `GET /api/admin/invites` → `DELETE /api/accounts/invite/[token]` → `GET/PATCH /api/admin/accounts/[accountId]` → `GET /api/admin/usage`
9. `app/(admin)/admin/invites/page.tsx`
10. `app/(admin)/admin/accounts/[accountId]/page.tsx`
11. `app/(admin)/admin/usage/page.tsx`
12. Update `app/(admin)/admin/accounts/page.tsx` (flesh out stub)
13. Update `app/(admin)/layout.tsx` (complete nav)
14. Dashboard quick stats bar
15. `next.config.ts` security headers
16. Mobile responsiveness pass on public pages
17. Remove `console.log` statements
18. `tests/admin-polish.test.ts`
19. Final: `tsc --noEmit` + `vitest run` + `next build`

---

## 10. Post-Build Checklist (Manual Verification Before Rollout)

After `next build` passes, verify manually in a staging environment:

- [ ] Admin can log in and access `/admin`
- [ ] Admin can send an invite to a new email
- [ ] New member receives invite link, clicks it, sets password, completes setup
- [ ] New member lands on dashboard after setup
- [ ] Voice Capture: record a Why Story, check transcript appears
- [ ] Content Studio: generate a draft, run compliance check, export modified version
- [ ] Funnel Builder: create funnel, publish, visit public URL as anonymous user
- [ ] Lead Magnet: admin uploads PDF, distributor activates, visitor downloads
- [ ] Webinar: admin creates (paste Bunny ID), distributor activates, visitor registers + watches
- [ ] CRM: sync contacts, move a contact stage, add notes
- [ ] Coach: tasks appear on dashboard for today
- [ ] Ad Insights: log a post, upload screenshot, run OCR
- [ ] Objection Library: copy a response, add a personal response
- [ ] Sign out and confirm redirect to login
- [ ] Try accessing `/dashboard` without auth → confirm redirect to `/login`
- [ ] Try accessing `/admin` as a non-admin → confirm 403/redirect
