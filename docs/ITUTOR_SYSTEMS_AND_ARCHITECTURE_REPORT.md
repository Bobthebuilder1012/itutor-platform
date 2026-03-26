# iTutor – Systems & Architecture Report

**Purpose:** Onboarding document for new software engineers.  
**Last updated:** February 2025  
**Codebase:** iTutor Caribbean Education Platform (Next.js 14 + Supabase).

---

## 1. Executive summary

iTutor is a **full‑stack web app** for connecting students, parents, and tutors in the Caribbean. It provides:

- **Roles:** Student, Parent, Tutor, Admin, Reviewer  
- **Core flows:** Tutor discovery, booking, sessions (video), payments (WiPay/TTD), messaging, notifications, communities (school + public), curriculum/syllabuses, tutor verification, and parent–child management.

**Tech stack:**

| Layer        | Technology |
|-------------|------------|
| Frontend    | Next.js 14 (App Router), React 18, TypeScript, Tailwind CSS |
| Backend     | Supabase (PostgreSQL, Auth, Storage, RLS) |
| API         | Next.js Route Handlers (`app/api/`) + server-side code in `lib/` |
| Payments    | WiPay (custom client; no Stripe) |
| Email       | Resend |
| Push        | Firebase Cloud Messaging |
| Video       | Zoom/Google OAuth; meeting links stored in DB |

**Rough scale:**

- **~95** page routes (`app/**/page.tsx`)
- **~38** API route files (`app/api/**/route.ts`)
- **86** SQL migrations (~8,600 lines) in `src/supabase/migrations/`
- **Tens of thousands** of lines of TypeScript/TSX across `app/`, `lib/`, `components/`

---

## 2. Repository layout

```
iTutor Cursor/
├── app/                    # Next.js App Router (pages + API)
├── components/              # React components (shared + role-specific)
├── lib/                     # Services, types, utils, Supabase, hooks
├── src/supabase/migrations/ # Database migrations (ordered 001–084)
├── public/
├── hooks/                   # Additional React hooks
├── data/                    # Static/data files
├── docs/                    # Documentation (this report, etc.)
├── email-templates/         # Email content
├── scripts/                 # One-off or tooling scripts
├── middleware.ts            # Global middleware (e.g. feedback redirect)
├── next.config.js
├── package.json
├── tailwind.config.ts
├── tsconfig.json
├── env.example              # Required env vars (copy to .env.local)
└── Pilot/                   # Separate nested project (excluded from main app)
```

**Path alias:** `@/` → project root (e.g. `@/lib/supabase/client`, `@/components/...`).

---

## 3. Systems overview

### 3.1 Authentication & users

- **Provider:** Supabase Auth (email/password; optional Google OAuth).
- **User record:** One row per user in `profiles` (id = auth.users.id). Roles: `student`, `parent`, `tutor`, `admin`. Reviewer is typically an admin with specific UI.
- **Where it lives:**
  - Client: `lib/supabase/client.ts` (browser client, `createBrowserClient` from `@supabase/ssr`).
  - Server: `lib/supabase/server.ts` (`getServerClient`, `getServiceClient` for service-role).
  - Auth UI: `app/login/`, `app/register/`, `app/signup/`, `app/forgot-password/`, `app/reset-password/`, `app/verify-email/`, `app/verify-code/`, `app/auth/confirmed`.
- **Middleware:** `middleware.ts` does **not** enforce auth globally; it mainly handles feedback pending redirect. Route-level protection is done in layouts/pages and API routes (e.g. redirect if no user or wrong role).

### 3.2 Profiles & roles

- **Table:** `profiles` (see migration `001_complete_schema_with_rls.sql`). Holds role, name, email, school, country, bio, tutor-specific fields (rating, subjects), suspension flags, etc. Later migrations add `username`, `display_name`, `institution_id`, `avatar_url`, terms acceptance, etc.
- **Settings by role:**
  - Student: `app/student/settings/page.tsx`
  - Tutor: `app/tutor/settings/page.tsx`
  - Parent: `app/parent/settings/page.tsx`
  - Reviewer: `app/reviewer/settings/page.tsx`
- **Shared:** `components/EditProfileModal.tsx`, `components/ProfileHeader.tsx`, `lib/hooks/useProfile.ts`, `lib/hooks/useAvatarUpload.ts`. Institution/school: `components/InstitutionAutocomplete.tsx`, `lib/hooks/useInstitutionsSearch.ts`, API `app/api/institutions/search/`.

### 3.3 Messaging (DMs / conversations)

- **Concept:** Two-party conversations (student–tutor, parent–tutor, parent–child after link). Conversation request flow: PENDING → ACCEPTED / DECLINED.
- **Tables:** `conversations`, `messages` (and related, e.g. `conversation_requests` / status in migrations 047, 081). Notifications table for in-app notifications.
- **Service:** `lib/services/notificationService.ts` — `getMessages`, `sendMessage`, `markMessagesAsRead`, `subscribeToMessages`, `getConversationWithStatus`, `acceptConversationRequest`, `declineConversationRequest`, etc.
- **UI:** `components/ConversationView.tsx`, `components/MessagesSidePanel.tsx`, `components/MessageInputBar.tsx`. Used on:
  - `app/student/messages/`, `app/student/messages/[conversationId]/`
  - `app/tutor/messages/`, `app/tutor/messages/[conversationId]/`
  - `app/parent/messages/`, `app/parent/messages/[conversationId]/`
- **Attachments:** Upload via `lib/utils/messageAttachments.ts`; storage in Supabase Storage. Message rows can have `attachment_url`, `attachment_type`, `attachment_name` (migration 083).

### 3.4 Communities (v2 – primary)

- **Concept:** Discord-style communities. Two types: **SCHOOL** (one per institution) and **PUBLIC** (user-created). Users join, post messages, reply in threads, pin/favorite.
- **Tables (migrations 076–084):**
  - `communities_v2` — id, type, school_id (nullable), name, description, avatar_url, created_by.
  - `community_memberships_v2` — community_id, user_id, role (MEMBER/ADMIN), status (ACTIVE/LEFT), muted, muted_until.
  - `community_messages_v2` — community_id, author_id, parent_id (for threads), content, attachment_*, etc.
  - `community_favorites_v2` — user favorites.
  - `community_message_reactions_v2` — message_id, user_id, emoji (084).
- **RLS:** Migrations 077, 079, 082 (recursion fixes for `community_memberships_v2`).
- **Server/data layer:** `lib/communities/index.ts` — `getUserCommunities`, `getCommunityByIdWithClient`, `getMessagesForCommunity`, etc. Avoids heavy embeds that caused 500s; loads institutions separately. `lib/server/ensureSchoolCommunity.ts` — ensure school community and membership on profile save.
- **API:** `app/api/communities/`, `app/api/communities/[communityId]/`, join, reports, moderation, questions/answers; `app/api/communities/ensure-membership`.
- **Pages:** `app/communities/page.tsx` (list), `app/communities/[communityId]/page.tsx` (feed). Legacy v1: `app/community/`, `app/community/[communityId]/`.
- **Components:** `components/communities/` — `MessageFeed`, `MessageComposer`, `ThreadReplies`, `CommunityViewLayout`, `MembersSidebar`, `PinnedSection`, `FavoritesView`, `CreateCommunityModal`, `CommunityJoinGate`, etc. Reactions and attachments are supported in the feed.

### 3.5 Bookings & sessions

- **Bookings:** Request → (parent approval if child) → confirmed. Tables: `bookings` (and related). API: `app/api/bookings/create`, `app/api/bookings/tutor-cancel`. Services: `lib/services/bookingService.ts`.
- **Sessions:** One-to-one lesson slots; link to video provider (Zoom/Google). Tables: `sessions` (migration 018+). API: `app/api/sessions/create-for-booking`, `app/api/sessions/create-missing-meetings`, `app/api/sessions/retry-meeting-link`, `app/api/sessions/migrate-provider`, `app/api/sessions/[id]/mark-no-show`. Services: `lib/services/sessionService.ts`, `lib/services/tutorSessionService.ts`, `lib/services/videoProviders.ts`.
- **UI:** Student/tutor/parent dashboards, `app/*/bookings/`, `app/*/sessions/`, `app/tutor/calendar/`, `app/tutor/availability/`. Components: `components/booking/TutorCalendarWidget.tsx`, `FlexibleTimePicker.tsx`, `components/sessions/SessionJoinButton.tsx`, `MarkNoShowButton.tsx`.

### 3.6 Payments

- **Model:** TTD; WiPay as payment provider (no Stripe in this codebase).
- **Tables:** `payments`, `tutor_earnings`, `tutor_balances`, `commission_ledger`, `payout_requests` (migrations 001, 020, 021, 023).
- **Client:** `lib/payments/wipayClient.ts`. API: `app/api/payments/wipay/initiate`, `app/api/payments/wipay/webhook`. Env: `WIPAY_API_KEY`, `WIPAY_MERCHANT_ID`, `WIPAY_BASE_URL`, `WIPAY_WEBHOOK_SECRET`.
- **Pages:** `app/payments/checkout/page.tsx`, `app/payments/success/page.tsx`. Cron: `app/api/cron/process-charges` (if used).

### 3.7 Tutor verification

- **Flow:** Tutor uploads certificate → reviewer/admin approves or rejects → verified subjects/grades stored (immutable). Optional OCR: `lib/ocr/ocrProvider.ts`.
- **Tables:** `tutor_verifications`, `tutor_verified_subject_grades`, `verified_subjects` (visibility), etc. (migrations 024, 025, 032+).
- **API:** `app/api/verification/`, `app/api/tutor/verification/`, `app/api/admin/verification/`, `app/api/reviewer/verification-requests/`. Gating: `lib/services/verificationGating.ts`.
- **Pages:** `app/tutor/verification/`, `app/reviewer/verification/`, `app/reviewer/verification/queue/`, `app/reviewer/verification/[requestId]/`.

### 3.8 Curriculum & syllabuses

- **Tables:** `syllabuses` (migration 029), seed data (030). Subjects: `subjects`, `user_subjects` (student), `tutor_subjects` (pricing).
- **Service:** `lib/services/curriculumService.ts`. Types: `lib/types/curriculum.ts`. Components: `components/curriculum/SyllabusCard.tsx`.
- **Pages:** `app/student/curriculum/`, `app/tutor/curriculum/`, syllabus detail `[syllabusId]`.

### 3.9 Notifications & push

- **In-app:** Table `notifications`. Service: `lib/services/notificationService.ts` (get, mark read, count). UI: `components/NotificationBell.tsx`, `app/*/notifications/`.
- **Push:** Firebase; `lib/firebase/client.ts`, `lib/services/browserPushService.ts`. API: `app/api/push-notifications/subscribe`, `app/api/push-tokens/register`. Component: `components/push/PushTokenRegistrar.tsx`. Next.js config aliases Firebase to false on server to avoid SSR issues.

### 3.10 Email

- **Provider:** Resend. Service: `lib/services/emailService.ts`. Templates: `lib/email-templates/` (tutor, student, types, index). Env: `RESEND_API_KEY`, `RESEND_FROM_EMAIL`.
- **Cron:** `app/api/cron/send-onboarding-emails` (uses `CRON_SECRET`). Queue: `lib/services/onboardingEmailQueue.ts`. Logs: migration 068 `email_send_logs`.

### 3.11 Parent–child

- **Table:** `parent_child_links`. Child accounts linked to parent; parent can approve bookings, view sessions, etc.
- **Pages:** `app/parent/add-child/`, `app/parent/child/[childId]/`, bookings/sessions/ratings per child. Auto-create conversations: migration 057.

### 3.12 Lesson offers

- **Tables:** Lesson offers (migration 016). Services: `lib/services/lessonOffersService.ts`. Types: `lib/types/lessonOffers.ts`. Components: `components/offers/` (SentOffersList, OffersReceivedList, modals).

### 3.13 Feedback & ratings

- **Post-session:** Student rates tutor; optional tutor feedback. Tables: `ratings`, feedback-related. API: `app/api/feedback/student`, `app/api/feedback/tutor`, `app/api/feedback/pending`. Middleware can redirect to pending feedback. Components: `components/feedback/TutorSessionFeedbackForm.tsx`, `StudentSessionRatingForm.tsx`. Migrations: 067 (mandatory feedback), 069 (feedback lock), 070 (one rating per student–tutor), 051 (rating likes).

### 3.14 Admin & reviewer

- **Admin:** `app/admin/dashboard/page.tsx`, `app/admin/emails/page.tsx`. API: `app/api/admin/` (verification, accounts, suspend/unsuspend, send-email, email-templates, filter-options, payments). Middleware: `lib/middleware/adminAuth.ts`.
- **Reviewer:** `app/reviewer/` (dashboard, verification queue, accounts, payments, settings). API: `app/api/reviewer/`. Middleware: `lib/middleware/tutorAuth.ts` (or role checks in layout).

---

## 4. Database (SQL)

- **Location:** `src/supabase/migrations/`. **86 migration files**, numbered **001–084** (some variants like `016_lesson_offers_system_FIXED.sql`). Total ~8,600 lines of SQL.
- **Execution order:** By filename prefix (001, 002, …). Apply in order when provisioning or resetting DB.
- **Core tables (from 001 and later):**  
  `profiles`, `parent_child_links`, `subjects`, `tutor_subjects`, `tutor_verifications`, `tutor_verified_subject_grades`, `sessions`, `ratings`, `payments`, `tutor_earnings`, `tutor_balances`, `commission_ledger`, `payout_requests`, `institutions`, `user_subjects`, `notifications`, `conversations`, `messages`, `bookings`, lesson offers, verification and support tables, then **communities v1** and **v2** (`communities_v2`, `community_memberships_v2`, `community_messages_v2`, `community_favorites_v2`, attachments, reactions).
- **RLS:** Every table has RLS enabled; policies are defined in migrations (e.g. 001, 023, 025, 046, 077, 079, 082). Avoid policies that select from the same table they protect (recursion); 082 and 075 fix recursion in memberships/profiles.
- **Storage:** Supabase Storage buckets; policies in migrations (e.g. 002, 033, 036). Used for avatars, verification docs, message attachments.

---

## 5. Frontend (TSX / React)

- **Framework:** Next.js 14 App Router. All pages are React Server Components by default; `'use client'` used where state, effects, or browser APIs are needed.
- **Styling:** Tailwind CSS (`tailwind.config.ts`). Design tokens: e.g. `itutor-green` in config.
- **Layout:** Single root `app/layout.tsx` (Inter font, AuthProvider, metadata). Role-based layouts under `app/student/`, `app/tutor/`, `app/parent/`, `app/admin/`, `app/reviewer/` (each can have its own `layout.tsx`).
- **Routing:** File-based. Dynamic segments: `[communityId]`, `[conversationId]`, `[bookingId]`, `[sessionId]`, `[userId]`, `[syllabusId]`, `[questionId]`, etc.
- **Shared UI:** `components/DashboardLayout.tsx`, `ProfileHeader`, `EditProfileModal`, `MessageInputBar`, `ConversationView`, `MessagesSidePanel`, `NotificationBell`, `Modal`, `CountrySelect`, `SubjectMultiSelect`, etc. Role-specific: `components/student/`, `components/tutor/`, `components/parent/`, `components/communities/`, `components/community/` (legacy).

---

## 6. Backend (API & server)

- **API routes:** Next.js Route Handlers in `app/api/**/route.ts`. Methods: GET, POST, PATCH, DELETE as needed. Auth: read session via `getServerClient()` or service role for admin actions.
- **Server-side logic:** Lives in `lib/`: services call Supabase (client or service role), no separate Node server. Server components and API routes import from `lib/`.
- **Errors:** Next.js 14: use digest checks for `NEXT_REDIRECT` / `NEXT_NOT_FOUND` instead of `unstable_rethrow` (not available). In communities pages, 500s were mitigated by simplifying Supabase queries and avoiding RLS recursion.

---

## 7. Key “what goes with what”

| Feature           | Pages (app/)                    | API (app/api/)              | Lib / services              | Components                    | DB tables / migrations      |
|------------------|----------------------------------|-----------------------------|-----------------------------|-------------------------------|-----------------------------|
| Auth              | login, signup, reset-password…   | auth/* (e.g. zoom, google)  | supabase/client, server     | AuthProvider                  | profiles, auth.users        |
| Messaging (DM)    | *\/messages, *\/messages/[id]   | —                           | notificationService         | ConversationView, MessageInputBar, MessagesSidePanel | conversations, messages, 083 (attachments) |
| Communities v2   | communities, communities/[id]   | communities, ensure-membership | communities/index, ensureSchoolCommunity | communities/* (MessageFeed, MessageComposer, etc.) | 076–084 (v2 schema, RLS, attachments, reactions) |
| Bookings          | *\/bookings, *\/bookings/[id]   | bookings/create, tutor-cancel | bookingService              | TutorCalendarWidget, FlexibleTimePicker, modals | bookings                     |
| Sessions          | *\/sessions, *\/sessions/[id]   | sessions/*                  | sessionService, videoProviders | SessionJoinButton, MarkNoShow  | sessions                     |
| Payments          | payments/checkout, success      | payments/wipay/*            | wipayClient                 | —                             | payments, tutor_earnings…   |
| Verification      | tutor/verification, reviewer/*  | verification/*, admin/*, reviewer/* | verificationGating, ocrProvider | VerifiedBadge, modals         | tutor_verifications, verified_subjects… |
| Notifications     | *\/notifications                | —                           | notificationService         | NotificationBell              | notifications               |
| Curriculum        | *\/curriculum, [syllabusId]     | —                           | curriculumService           | SyllabusCard                  | syllabuses, subjects        |
| Email             | —                               | cron/send-onboarding-emails | emailService, onboardingEmailQueue | —                             | email_send_logs, queue       |

---

## 8. Environment variables

- **Required:** `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `CRON_SECRET`.
- **Optional:** `NEXT_PUBLIC_SITE_URL`, `NEXT_TELEMETRY_DISABLED`.
- **WiPay (for payments):** `WIPAY_API_KEY`, `WIPAY_MERCHANT_ID`, `WIPAY_BASE_URL`, `WIPAY_WEBHOOK_SECRET` (not in env.example; add for payment flows).

Copy `env.example` to `.env.local` and fill values.

---

## 9. Scripts & commands

- `npm run dev` — local dev server.
- `npm run build` — production build.
- `npm run start` — run production build.
- `npm run lint` — Next.js ESLint.

---

## 10. Where to start as a new engineer

1. **Run the app:** Copy env from `env.example` to `.env.local`, run `npm run dev`, open `/` and `/login`.
2. **Trace a flow:** e.g. “Send a DM” — `MessagesSidePanel` → `ConversationView` → `notificationService.sendMessage` → `messages` table; or “View community” — `communities/[communityId]/page.tsx` → `lib/communities/index.ts` → `communities_v2` + `community_messages_v2`.
3. **Read migrations in order:** `001_complete_schema_with_rls.sql` for core model; 076–084 for communities v2.
4. **Search by feature:** Use repo search for table names (`community_memberships_v2`), service names (`notificationService`), or route paths (`/api/bookings/create`).

This document is the single place to get the full picture of systems, SQL, TSX, frontend, backend, and how they connect.
