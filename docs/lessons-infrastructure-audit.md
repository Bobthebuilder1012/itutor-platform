# iTutor Lessons & Booking Infrastructure Audit

> Generated: 2026-05-29

---

## 1. DATABASE SCHEMA

### Core Booking Tables — `supabase/migrations/010_create_booking_system.sql`

| Table | Purpose |
|---|---|
| `tutor_availability_rules` | Recurring teaching hours (day of week, start/end time, slot duration, buffer) |
| `tutor_unavailability_blocks` | One-off or recurring blackout overrides |
| `session_types` | Duration/pricing templates per tutor-subject combo |
| `bookings` | Main booking record (request → confirm flow) |
| `booking_messages` | Chat + time proposals between student & tutor |
| `tutor_response_metrics` | Avg response time, booking count (30-day window) |

**Booking status values:** `PENDING` → `COUNTER_PROPOSED` → `CONFIRMED` → `DECLINED` / `CANCELLED` / `COMPLETED` / `NO_SHOW`

**Key `bookings` columns:**
- `requested_start_at / end_at` — student's requested slot
- `confirmed_start_at / end_at` — tutor-confirmed slot
- `payer_id` — who pays (student or parent)
- `payment_status`, `platform_fee_pct / ttd`, `tutor_payout_ttd`
- `billing_mode` — `parent_required` | `self_allowed`

---

### Sessions & Video — `supabase/migrations/018_sessions_system.sql`

| Table | Purpose |
|---|---|
| `tutor_video_provider_connections` | Google Meet / Zoom OAuth tokens per tutor |
| `sessions` | Session record with meeting link, charge tracking, status |
| `session_events` | Audit log of provider events |

**Session status values:** `SCHEDULED` → `JOIN_OPEN` → `COMPLETED_ASSUMED` / `NO_SHOW_STUDENT` / `EARLY_END_SHORT` / `CANCELLED`

**Key `sessions` columns:**
- `booking_id`, `provider`, `meeting_external_id`, `join_url`
- `scheduled_start_at / end_at`, `duration_minutes`
- `charge_scheduled_at`, `charge_amount_ttd`, `payout_amount_ttd`, `platform_fee_ttd`, `charged_at`
- `no_show_wait_minutes` (33% of duration), `min_payable_minutes` (66% of duration)

---

### Payments & Payouts — `supabase/migrations/020_payments_system.sql`

| Table | Purpose |
|---|---|
| `tutor_payout_accounts` | WiPay provider mapping for tutor earnings |
| `payments` | Payment transaction records (booking → payment) |
| `payout_ledger` | Tutor earnings ledger (session → payout, status tracking) |

**Payout ledger statuses:** `in_escrow` → `awaiting_transfer` → `paid` / `reversed`

---

### Lesson Offers — `supabase/migrations/016_lesson_offers_system.sql`

Parallel system for **tutor-initiated** offers to students. Supports counter-offers from both sides. Statuses: `pending`, `accepted`, `declined`, `countered`, `expired`. Triggers fire notifications on status changes. Not fully integrated with main booking flow.

---

### Session Reminders — `supabase/migrations/100_add_session_reminders.sql`

| Table | Purpose |
|---|---|
| `session_reminders` | Email reminder queue (24h and 1h before session) |
| `app_runtime_config` | Cron job configuration storage |

Attempt tracking, statuses: `pending`, `sent`, `failed`, `cancelled`. pg_cron fires every minute.

---

### Supporting Migrations

| Migration | What it adds |
|---|---|
| `012_booking_functions.sql` | Core booking RPCs (create, confirm, decline, counter, cancel) |
| `013_booking_functions_continued.sql` | Additional booking RPCs (student accept counter, add message) |
| `011_booking_system_rls.sql` | Row-Level Security for all booking tables |
| `023_payment_rls_policies.sql` | RLS for payment tables |
| `069_feedback_lock_based_on_end_time.sql` | Post-session feedback window |
| `093_booking_request_community_id.sql` | Optional `community_id` on bookings |
| `072_allow_same_day_bookings_for_testing.sql` | Same-day booking override flag |
| `074_flexible_booking_windows.sql` | Custom advance-notice windows |

---

## 2. DATABASE RPC FUNCTIONS

Defined in `012_booking_functions.sql` + `013_booking_functions_continued.sql`:

| Function | Description |
|---|---|
| `get_tutor_public_calendar(tutor_id, range_start, range_end)` | Available slots + busy blocks (no private reasons) |
| `is_time_slot_available(tutor_id, requested_start, requested_end)` | Conflict check for a specific slot |
| `get_tutor_availability_summary(tutor_id)` | Days with hours, earliest available time |
| `create_booking_request(...)` | Creates PENDING booking (student/parent) |
| `tutor_confirm_booking(booking_id)` | Sets confirmed times |
| `tutor_decline_booking(booking_id, message)` | Decline with optional message |
| `tutor_counter_offer(booking_id, proposed_start, proposed_end, message)` | Propose alternate time |
| `student_accept_counter(booking_id, message_id)` | Accept counter → auto-confirm |
| `student_cancel_booking(booking_id, reason)` | Student cancels |
| `add_booking_message(booking_id, message)` | Text message to booking thread |
| `tutor_cancel_session(...)` | Tutor cancels confirmed session (optional reschedule) |

---

## 3. API ROUTES

### Bookings

| Route | Method | Who calls | Description |
|---|---|---|---|
| `app/api/bookings/create/route.ts` | POST | Student / Parent | Create PENDING booking, validate slot, calculate price, notify tutor |
| `app/api/bookings/direct-book/route.ts` | POST | Student | Skip request phase → CONFIRMED immediately, create session, notify tutor |
| `app/api/bookings/tutor-confirm/route.ts` | POST | Tutor | Confirm booking, health-check video provider, create session + meeting link |
| `app/api/bookings/tutor-cancel/route.ts` | POST | Tutor | Cancel booking + session, cancel reminders, notify student |
| `app/api/bookings/student-cancel/route.ts` | POST | Student | Cancel booking, cancel reminders, notify tutor |
| `app/api/bookings/counter-offer/route.ts` | POST | Tutor | Propose alternate time (RPC wrapper) |
| `app/api/bookings/student-accept-counter/route.ts` | POST | Student | Accept counter-offer → auto-confirm |

### Sessions

| Route | Method | Who calls | Description |
|---|---|---|---|
| `app/api/sessions/create-for-booking/route.ts` | POST | Internal | Manually trigger session creation for a booking |
| `app/api/sessions/[id]/mark-no-show/route.ts` | POST | Tutor | Mark student no-show after wait period, charge 50% |
| `app/api/sessions/tutor-cancel/route.ts` | POST | Tutor | Cancel session (RPC), cancel reminders, notify student |
| `app/api/sessions/reschedule/route.ts` | POST | Tutor | Reschedule session (optional on cancel) |

### Cron

| Route | Trigger | Description |
|---|---|---|
| `app/api/cron/send-reminders/route.ts` | Every minute (pg_cron) | Process `session_reminders` → send 24h & 1h emails via Resend |
| `app/api/cron/process-charges/route.ts` | Every minute (pg_cron) | Charge completed sessions at `charge_scheduled_at` |

All cron routes protected by `CRON_SECRET` env var.

---

## 4. SERVICES

### `lib/services/bookingService.ts`

**Availability:**
- `getTutorPublicCalendar(tutorId, start, end)` — RPC wrapper
- `validateTimeSlotAvailability(tutorId, start, end)` — RPC wrapper
- `getTutorAvailabilitySummary(tutorId)` — RPC wrapper
- `upsertAvailabilityRule(rule)` / `deleteAvailabilityRule(id)`
- `upsertUnavailabilityBlock(block)` / `deleteUnavailabilityBlock(id)`
- `getTutorAvailabilityRules(tutorId)`

**Bookings:**
- `createBookingRequest(...)` → `/api/bookings/create`
- `tutorConfirmBooking(bookingId)` → `/api/bookings/tutor-confirm`
- `tutorHealthCheckBeforeConfirm(bookingId)` — health-check only
- `tutorDeclineBooking(bookingId, message)` — RPC direct
- `tutorCounterOffer(bookingId, start, end, message)` — RPC direct
- `studentAcceptCounter(bookingId, messageId)` — RPC direct
- `studentCancelBooking(bookingId, reason)` → `/api/bookings/student-cancel`
- `addBookingMessage(bookingId, message)` — RPC direct
- `getBooking(id)` / `getStudentBookings(id)` / `getTutorBookings(id)` / `getBookingMessages(id)`
- `subscribeToBooking(id, cb)` / `subscribeToBookingMessages(id, cb)` — Realtime

---

### `lib/services/sessionService.ts`

- `createSessionForBooking(bookingId)` — Creates session, verifies video provider, generates meeting link, schedules reminders
- `markStudentNoShow(sessionId, tutorId)` — Status → `NO_SHOW_STUDENT`, applies 50% charge
- `processScheduledCharges()` — Batch-charges sessions past `charge_scheduled_at`; detects early-end (meeting ended before scheduled end → $0 charge)
- `updateJoinWindowStatus()` — Status → `JOIN_OPEN` when ≤ 5 min before start
- ⚠️ `capturePayment(sessionId)` — **STUB / NOT IMPLEMENTED** (WiPay integration pending)

---

### `lib/services/videoProviders.ts`

- `ensureTutorConnected(tutorId)` — Verifies tutor has OAuth provider
- `createMeeting(session)` — Creates Google Meet or Zoom meeting
- `getMeetingState(session)` — Gets live meeting status from provider
- `healthCheckTutorVideoProvider(tutorId)` — Checks token validity, refreshes if possible, marks `needs_reauth` if expired

---

### `lib/utils/commissionCalculator.ts`

Tiered commission on session charge amount:

| Session Charge | Platform Fee | Tutor Payout |
|---|---|---|
| < TT$100 | 10% | 90% |
| TT$100 – $199 | 15% | 85% |
| TT$200+ | 20% | 80% |

**Exports:** `getCommissionRate(price)`, `calculateCommission(amount)`, `getCommissionRatePercentage(price)`

---

### `lib/reminders/scheduleReminders.ts`

- `scheduleSessionReminders(session)` — Inserts 24h and 1h rows into `session_reminders`
- `cancelSessionReminders(sessionId)` — Marks all pending reminders as cancelled
- `rescheduleSessionReminders(session)` — Cancel old + schedule new (used after reschedule)

---

## 5. TYPES

### `lib/types/booking.ts`

- `BookingStatus` — `PENDING | PENDING_PARENT_APPROVAL | PARENT_APPROVED | PARENT_REJECTED | COUNTER_PROPOSED | CONFIRMED | DECLINED | CANCELLED | COMPLETED | NO_SHOW`
- `MessageType` — `'text' | 'time_proposal' | 'system'`
- `Booking`, `BookingWithDetails`, `BookingMessage`, `BookingMessageWithSender`
- `TutorAvailabilityRule`, `TutorUnavailabilityBlock`, `SessionType`
- `TutorPublicCalendar`, `TimeSlot`, `AvailabilityWindow`, `BusyBlock`
- Helpers: `formatAvgResponseTime()`, `getBookingStatusColor()`, `getBookingStatusLabel()`

### `lib/types/sessions.ts`

- `VideoProvider` — `'google_meet' | 'zoom'`
- `SessionStatus` — `SCHEDULED | JOIN_OPEN | COMPLETED_ASSUMED | NO_SHOW_STUDENT | EARLY_END_SHORT | CANCELLED`
- `Session`, `TutorVideoConnection`, `SessionRules`
- Helpers: `calculateSessionRules()`, `canMarkNoShow()`, `isJoinWindowOpen()`, `getSessionStatusColor()`, `getSessionStatusLabel()`
- ⚠️ `isJoinWindowOpen()` currently returns `true` always (testing mode — production enforcement is commented out)

---

## 6. UI PAGES

### Student

| Page | Path |
|---|---|
| Find tutors | `app/student/find-tutors/page.tsx` |
| Tutor profile + book | `app/student/tutors/[tutorId]/page.tsx` |
| Bookings list | `app/student/bookings/page.tsx` |
| Booking detail + messages | `app/student/bookings/[bookingId]/page.tsx` |
| Sessions list | `app/student/sessions/page.tsx` |

### Tutor

| Page | Path |
|---|---|
| Dashboard (booking stats) | `app/tutor/dashboard/page.tsx` |
| Booking inbox | `app/tutor/bookings/page.tsx` |
| Booking detail (confirm / decline / counter) | `app/tutor/bookings/[bookingId]/page.tsx` |
| Sessions list | `app/tutor/sessions/page.tsx` |
| Session detail (join link, mark no-show) | `app/tutor/sessions/[sessionId]/page.tsx` |
| Availability setup | `app/tutor/availability/page.tsx` |
| Get listed (rate, bio, availability) | `app/tutor/get-listed/page.tsx` |

### Parent

| Page | Path |
|---|---|
| Find / book for child | `app/parent/tutors/[tutorId]/page.tsx` |
| Approve pending bookings | `app/parent/approve-bookings/page.tsx` |
| Child bookings | `app/parent/child/[childId]/bookings/page.tsx` |
| Child sessions | `app/parent/child/[childId]/sessions/page.tsx` |

---

## 7. COMPONENTS

| Component | Path | Purpose |
|---|---|---|
| `TutorCalendarWidget` | `components/booking/TutorCalendarWidget.tsx` | Slot picker for booking |
| `SuggestTimeModal` | `components/booking/SuggestTimeModal.tsx` | Counter-offer time modal |
| `FlexibleTimePicker` | `components/booking/FlexibleTimePicker.tsx` | Alternative time picker |
| `MarkNoShowButton` | `components/sessions/MarkNoShowButton.tsx` | Tutor no-show action |
| `CancelSessionModal` | `components/tutor/CancelSessionModal.tsx` | Cancel with reason dialog |
| `StudentSessionRatingForm` | `components/feedback/StudentSessionRatingForm.tsx` | Post-session rating |
| `TutorSessionFeedbackForm` | `components/feedback/TutorSessionFeedbackForm.tsx` | Post-session feedback |
| `ChildrenBookings` | `components/parent/ChildrenBookings.tsx` | Parent view of child bookings |
| `SuggestTimeModal` (parent) | `components/parent/SuggestTimeModal.tsx` | Parent counter-offer modal |
| `DeclineBookingModal` | `components/parent/DeclineBookingModal.tsx` | Parent decline modal |

---

## 8. MIDDLEWARE

`middleware.ts` — Runs before all page requests (except `/api/`, `/_next/`, `/assets/`):
- Checks for mandatory post-session feedback pending
- Redirects to `/feedback/{sessionId}` until rating submitted
- Feedback lock is based on `session.scheduled_end_at` (from migration 069)

---

## 9. END-TO-END WORKFLOWS

### A. Request → Counter-Offer → Confirm → Session

```
Student   → POST /api/bookings/create       → booking PENDING, tutor notified
Tutor     → POST /api/bookings/counter-offer → booking COUNTER_PROPOSED
Student   → POST /api/bookings/student-accept-counter → booking CONFIRMED
                                              → createSessionForBooking()
                                              → meeting link generated
                                              → reminders scheduled (24h + 1h)
Cron      → /api/cron/send-reminders         → email sent at 24h and 1h
Session   → JOIN_OPEN (5 min before start)
           → COMPLETED_ASSUMED (at scheduled_end_at)
Cron      → /api/cron/process-charges        → charge captured, ledger updated
Student   → Mandatory feedback form          → middleware enforces before next nav
```

### B. Direct Book (No Request Phase)

```
Student   → POST /api/bookings/direct-book  → slot validated
                                             → booking CONFIRMED immediately
                                             → session created + meeting link
                                             → tutor notified
```

### C. No-Show Flow

```
Tutor     → POST /api/sessions/[id]/mark-no-show
           → must wait no_show_wait_minutes (33% of duration)
           → status → NO_SHOW_STUDENT
           → charge → 50% of full session fee
           → payout_ledger updated
```

### D. Cancellation

```
Student   → POST /api/bookings/student-cancel → booking CANCELLED, reminders cancelled, tutor notified
Tutor     → POST /api/bookings/tutor-cancel   → booking + session CANCELLED, reminders cancelled, student notified
```

---

## 10. FEATURE FLAGS

| Flag | Env Var | Current | Effect |
|---|---|---|---|
| `isPaidClassesEnabled()` | `PAID_CLASSES_ENABLED` | `false` | When false: all sessions are free, payment fields zeroed |
| `isCommunitiesArchived()` | — | — | Hides community features |
| `isGroupsFeatureEnabled()` | — | — | Enables group sessions |

---

## 11. KNOWN GAPS & TODOs

| # | Issue | Location | Severity |
|---|---|---|---|
| 1 | **Payment capture not implemented** — `capturePayment()` is a stub, WiPay integration missing | `lib/services/sessionService.ts` | High |
| 2 | **Join window enforcement disabled** — `isJoinWindowOpen()` always returns `true`; production 5-min window commented out | `lib/types/sessions.ts` | Medium |
| 3 | **Lesson offers system not integrated** — parallel offer-initiation flow exists in DB but loosely connected to main booking UI | `supabase/migrations/016_*`, `app/api/lesson-offers/` | Medium |
| 4 | **Early-end detection** — logic to detect meeting ended before scheduled end exists; needs provider-side verification | `lib/services/sessionService.ts` | Medium |
| 5 | **Same-day booking gate** — tutor `allow_same_day_bookings` flag exists but UI to set it is not exposed | `supabase/migrations/072_*` | Low |
| 6 | **Community booking integration** — `community_id` on bookings partially wired; not all booking UIs pass it | `supabase/migrations/093_*` | Low |
| 7 | **Video provider reauth UX** — if token expires mid-flow, tutor is blocked with `needs_reauth` status but the reconnect flow isn't always surfaced clearly | `lib/services/videoProviders.ts` | Medium |
| 8 | **No-show for tutor** — only student no-show is implemented; tutor no-show (early cancel) has no equivalent charge/penalty flow | Various | Low |

---

## 12. ENVIRONMENT VARIABLES (Booking/Session-relevant)

```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
RESEND_API_KEY              # Session reminder emails
RESEND_FROM_EMAIL
CRON_SECRET                 # Protect /api/cron/* routes
TOKEN_ENCRYPTION_KEY        # Encrypt Google/Zoom OAuth tokens
PAID_CLASSES_ENABLED        # Feature flag (currently false)
NEXT_PUBLIC_APP_URL         # Used in email links
# Google OAuth (Meet)
GOOGLE_CLIENT_ID
GOOGLE_CLIENT_SECRET
# Zoom OAuth
ZOOM_CLIENT_ID
ZOOM_CLIENT_SECRET
ZOOM_ACCOUNT_ID
```
