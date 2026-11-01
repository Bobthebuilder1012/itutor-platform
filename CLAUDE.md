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
- **Email**: Customer.io Transactional API (Resend removed)
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
- `emailService.ts` — sends via Customer.io; the only way mail leaves the app
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
CUSTOMERIO_APP_API_KEY         # The ONLY email credential. Nothing sends
                               # without it. NOT CUSTOMERIO_API_KEY, which is
                               # the Track key and 401s on the send endpoint
NEXT_PUBLIC_APP_URL
CRON_SECRET
NEXT_PUBLIC_VAPID_PUBLIC_KEY   # Web push notifications
TOKEN_ENCRYPTION_KEY           # For encrypting OAuth tokens
PAID_CLASSES_ENABLED           # Feature flag (true/false)
CLASS_MATCH_WEEK_ENABLED       # Class Match Week on/off (default true)
```

### Email senders

`sendEmail()` in `lib/services/emailService.ts` takes a `category`:

- `transactional` (the **default** — anything unmarked) sends as
  `iTutor <noreply@myitutor.com>`: verification codes, receipts, booking
  confirmations, reminders, approval decisions, password resets.
- `promotional` sends as `iTutor <hello@myitutor.com>`: the onboarding drip
  (`/api/cron/send-onboarding-emails`), the welcome mail
  (`/api/send-welcome-email`), and the demand-map class announcement
  (`/api/cron/resolve-demand`). Those three are the whole list.

```
EMAIL_FROM                     # PROMOTIONAL sender only
EMAIL_FROM_TRANSACTIONAL       # Overrides iTutor <noreply@myitutor.com>
EMAIL_FROM_PROMOTIONAL         # Overrides EMAIL_FROM for marketing mail
EMAIL_ALLOWLIST                # Comma list; `@domain` entries match a whole
                               # domain. When set, ONLY these addresses
                               # receive mail. Unset (production) = no filter
CUSTOMERIO_EMAIL_REGION        # us | eu. Falls back to CUSTOMERIO_REGION
```

A transactional send deliberately **ignores `EMAIL_FROM` and
`RESEND_FROM_EMAIL`**. The latter is still set on production and is why every
message used to share one sender; honouring either would have kept password
resets on the marketing address with nothing in the config looking wrong.

**Resend has been removed**, and with it `EMAIL_PROVIDER`, `RESEND_API_KEY`
and `RESEND_FROM_EMAIL`. Those are still set in Vercel and are now inert;
delete them when convenient. Consequences worth knowing:

- There is no second provider to fail over to. `CUSTOMERIO_APP_API_KEY` is a
  single point of failure for all app email. It is a Vercel **team-level
  Shared variable**, so it does **not** appear in `vercel env ls` or the
  project env API, and it only reaches a project that is in its project list
  — a missing key is easy to misdiagnose as "not configured" when it is
  really "not linked".
- A missing key makes `sendEmail()` return `success: false`, deliberately.
  Returning success for a send that did not happen cost three users an
  onboarding stage each on 2026-10-26, because `send-onboarding-emails`
  advances `onboarding_stage` on `result.success`. Do not soften it.
- Customer.io creates a person profile for every address it sends to, so
  transactional mail loads users into the workspace as a side effect, which
  has a billing consequence. `CUSTOMERIO_ALLOWED_EMAILS` does **not** guard
  this path — it gates the Track-API profile sync only. `EMAIL_ALLOWLIST` is
  the guard, and any environment pointed at production data needs it set.

Two senders live outside the service and must move with it: the Supabase auth
hook `send-auth-email` (`AUTH_EMAIL_FROM`, already noreply@) and
`send-payment-receipt` (`RECEIPT_EMAIL_FROM`, moved off receipt@). Both run on
Deno and cannot import the app's code, so set `CUSTOMERIO_APP_API_KEY` as a
Supabase function secret too, not just in Vercel. Unlike the app, the receipt
function throws when the key is absent — correct there, because a Postgres
trigger invokes it and a thrown error is visible and retryable.

`npm run email:senders` proves all of the above without sending anything.

Customer.io (all optional — the integration is inert unless `CUSTOMERIO_ENABLED`
is exactly `true`, and `getCustomerIoConfig()` returns null before any database
read, so an unconfigured environment costs nothing):
```
CUSTOMERIO_ENABLED             # 'true' switches the integration on. Anything else = off
CUSTOMERIO_SITE_ID             # Track API site id
CUSTOMERIO_API_KEY             # Track API key
CUSTOMERIO_REGION              # us | eu (default us)
CUSTOMERIO_ALLOWED_EMAILS      # Comma list. When non-empty ONLY these addresses sync
CUSTOMERIO_INCLUDE_DEV_ACCOUNTS# Sync is_dev_account profiles too (default false)
```
**Set `CUSTOMERIO_ALLOWED_EMAILS` to a single inbox before ever setting
`CUSTOMERIO_ENABLED=true`.** Staging is a Supabase branch of production and
holds real customer addresses; enabling with an empty allow-list loads all of
them into a tool that can mail them. And read the note in `lib/customerio/sync.ts`
before clearing the allow-list again — a skipped profile is recorded as
delivered, so simply removing the list does not bring those profiles back.

Google OAuth and Zoom OAuth credentials are also required for those integrations.
