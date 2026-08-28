# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev        # Start development server
npm run build      # Production build
npm run lint       # Run ESLint
npm run start      # Start production server
```

Migration scripts are in `scripts/` and can be run with `npx ts-node scripts/<name>.ts`.

## Tech Stack

- **Framework**: Next.js 14 App Router, React 18, TypeScript
- **Database/Auth**: Supabase (PostgreSQL + Auth with SSR cookie-based sessions)
- **Styling**: TailwindCSS with custom brand colors (`green: #199356`, dark card backgrounds)
- **Client data fetching**: TanStack React Query v5
- **Email**: Resend + `@react-email/components`
- **Push notifications**: Firebase Cloud Messaging (FCM)
- **Video**: Google Meet / Zoom OAuth integration
- **Payments**: WiPay

## Architecture

### App Router structure

All pages live in `app/`. Role-based route groups:
- `/student/` — student dashboard, find tutors, messages
- `/tutor/` — tutor dashboard, find students, messages, groups
- `/parent/` — parent dashboard, messages
- `/admin/` — admin panel
- `/reviewer/` — tutor verification reviewer
- `/communities/` and `/groups/` — community/group session features

Auth flow: `AuthProvider` (in `components/AuthProvider.tsx`) checks Supabase session on mount and redirects based on `profile.role` (student → `/student/dashboard`, tutor → `/tutor/dashboard`, etc.). The reviewer role is a special case that redirects to `/reviewer/dashboard`.

Edge middleware (`middleware.ts`) intercepts navigation to enforce pending-feedback redirects (e.g., after sessions that need ratings). It runs before all page requests but skips `/api/`, `/_next/`, and `/assets/`.

### Supabase client pattern

Two clients — never mix them up:
- `lib/supabase/client.ts` — browser client; supports "Keep me signed in" toggle (localStorage vs. sessionStorage). Use in Client Components.
- `lib/supabase/server.ts` — server-side client using `@supabase/ssr`; uses `SUPABASE_SERVICE_ROLE_KEY` for admin ops. Use in API routes and Server Components.

### Service layer (`lib/services/`)

Business logic lives here, not in components:
- `bookingService.ts` — booking creation, cancellation, counter-offers
- `sessionService.ts` — session status management
- `notificationService.ts` — push notification delivery
- `emailService.ts` — sends via Resend
- `videoProviders.ts` — Google Meet / Zoom meeting link generation
- `commissionCalculator.ts` is in `lib/utils/` — calculates tutor earnings after platform cut

### Data types (`lib/types/`)

Key interfaces: `Profile` (with `role`, `tutor_verification_status`, `billing_mode`, `is_suspended`), `Session`, `Booking`. The `billing_mode` field (`parent_required` | `self_allowed`) controls whether a child account needs parent approval for bookings.

### Feature flags (`lib/featureFlags/`)

Flags read from env vars:
- `isPaidClassesEnabled()` — `PAID_CLASSES_ENABLED` (currently `false`)
- `isCommunitiesArchived()`
- `isGroupsFeatureEnabled()`
- `isClassMatchWeekEnabled()` — `CLASS_MATCH_WEEK_ENABLED`. The campaign kill
  switch. Enforced inside `getLiveCampaign()`, so `false` makes every Class
  Match Week surface — top-bar countdown, dashboard banners, the teacher tab in
  My Classes, the portal pages, all `/api/class-match` routes — behave as if no
  campaign were running. Nothing is deleted; turning it back on restores the
  same campaign, opt-ins, sessions, reservations and coupons.

Check these before adding functionality tied to premium/gated features.

### Cron jobs

API routes under `/api/cron/` handle scheduled tasks: `send-reminders`, `process-charges`, `send-onboarding-emails`. Protected by `CRON_SECRET` env var.

## Key conventions

- **Server vs. client components**: Landing page and static content use Server Components with ISR (`revalidate: 300`). Dashboards are `'use client'` with React Query.
- **Absolute imports**: Use `@/` alias (e.g., `@/lib/supabase/client`, `@/components/DashboardLayout`).
- **TailwindCSS custom tokens**: Use `bg-card` (dark card), `text-muted`, `text-green-brand`, etc. from the custom palette rather than raw hex colors.
- **Firebase is browser-only**: The `next.config.js` excludes Firebase from the server bundle. Never import Firebase in Server Components or API routes.
- **Image domain**: Supabase storage images must come from `nfkrfciozjxrodkusrhh.supabase.co` — already in `next.config.js` allowed domains.

## Environment variables

Required in `.env.local`:
```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
RESEND_API_KEY
RESEND_FROM_EMAIL
NEXT_PUBLIC_APP_URL
CRON_SECRET
NEXT_PUBLIC_VAPID_PUBLIC_KEY   # Web push notifications
TOKEN_ENCRYPTION_KEY           # For encrypting OAuth tokens
PAID_CLASSES_ENABLED           # Feature flag (true/false)
CLASS_MATCH_WEEK_ENABLED       # Class Match Week on/off (default true)
```

Google OAuth and Zoom OAuth credentials are also required for those integrations.

## iTutor AI v2

The tutor-facing AI hub at `/tutor/ai` — Plan a Lesson, Create a Quiz, Study
Sheets, Mark Papers. It replaces the v1 marking tool (`app/api/ai/*`,
`app/tools/ai/page.tsx`), which was shut down on 7 July 2026 and deleted, not
extended.

> **Draft — reconstructed, pending owner review.** The build handoff refers to
> "the six non-negotiable rules" in this section and cites rule 4 by number, but
> no such section existed in the repo. These six are reconstructed from the
> handoff's own definition of done. Correct them before relying on them.

### The six non-negotiable rules

1. **No model call inside a request handler.** Every generation, extraction and
   marking run is an `ai_jobs` row picked up by `/api/cron/process-ai-jobs`. A
   request handler may enqueue and may read a result; it may never hold a
   connection open waiting on a provider.

2. **No usage metered by a lifetime counter.** v1 metered on
   `profiles.ai_uses_count`, an integer that only ever went up. Entitlement is
   `ai_credit_ledger` — append-only, balance derived by summing `delta`, never
   stored as a mutable total. A terminal job failure refunds the ledger.

3. **No unverified curriculum row or generated question is visible to a
   student.** Extraction writes drafts with `verified_at = NULL`. A row reaches
   a learner surface only after a reviewer sets `verified_by` / `verified_at`.
   Low-confidence extractions are flagged for review, never silently dropped.

4. **No past-paper content from an unlicensed source, anywhere in the repo.**
   CXC materials come from CXC Store, with `license_status` recorded on the row.
   Never fetch from unlicensed past-paper sites — not for seeds, not for
   fixtures, not for a local test.

5. **No AI mark reaches a student or parent without tutor review.** "AI finished
   marking" and "Results published" are distinct states, and the gap between
   them is a deliberate safety boundary. Record the tutor's override delta — it
   is the only honest quality metric the system has.

6. **One provider entry point.** Only `lib/ai/provider.ts` imports a model SDK,
   exposing `generateStructured()` and `extractFromImage()`. Grepping for the
   SDK import must return exactly one file.

### Conventions

- **Migrations** for this feature start at **248**. The numbers the handoff
  assigns (217–222) are already shipped, unrelated features.
- **Structured output, not free-form text.** Vision and generation calls pass a
  strict JSON response schema.
- **`ai_messages.structured_payload`** drives the rich message renderer (option
  chips, date pickers, editable summary cards, calendar grids). Build the
  renderer around it from the start; retrofitting rich message types is painful.
- **Questions live in our tables** regardless of delivery. Google Forms is one
  value of `quizzes.delivery_channel`, not the system of record.
- **Images are optimised client-side** via `lib/utils/imageOptimize.ts` (~1600px
  long edge, WebP) before any upload.

### Feature flags

- `NEXT_PUBLIC_AI_FEATURE_MAINTENANCE` — the v1 kill switch, default `true`.
  Retained so the `/tools/ai` stub keeps rendering the maintenance notice.
