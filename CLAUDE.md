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

Three flags read from env vars:
- `isPaidClassesEnabled()` — `PAID_CLASSES_ENABLED` (currently `false`)
- `isCommunitiesArchived()`
- `isGroupsFeatureEnabled()`

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
```

Google OAuth and Zoom OAuth credentials are also required for those integrations.
