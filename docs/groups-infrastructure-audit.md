# Groups Infrastructure Audit

Covers all group class infrastructure: database schema, API routes, UI pages, services, types, membership/enrollment flows, rate-setting, and known gaps. Does not cover 1:1 lesson booking — see `lessons-infrastructure-audit.md`.

---

## Database Schema

### Core Tables

#### `groups`
Main group/class entity.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| tutor_id | uuid FK → profiles | |
| name / title | text | |
| description | text | |
| subject | text | comma-separated |
| topic | text | |
| difficulty | text | BEGINNER / INTERMEDIATE / ADVANCED |
| form_level | text | SEA / FORM_1-5 / CSEC / CAPE / UNIVERSITY / ADULT |
| goals | text | |
| bio | text | long-form class biography |
| status | text | DRAFT / PUBLISHED / ARCHIVED |
| visibility | text | public / unlisted / private |
| max_students | int | |
| timezone | text | |
| pricing_model | text | FREE / PER_SESSION / MONTHLY |
| pricing_mode | text | FREE / PER_SESSION / PER_COURSE (compat variant) |
| price_per_session | numeric(10,2) | |
| price_monthly | numeric(10,2) | |
| price_per_course | numeric(10,2) | |
| member_service_fee | numeric(10,2) | per-active-member fee |
| parent_feedback_price | numeric(10,2) | price for feedback addon |
| recurrence_rule | text | iCal RRULE string |
| session_length_minutes | int | |
| session_frequency | text | |
| availability_window | text | |
| cover_image | text | |
| header_image | text | |
| media_gallery | jsonb | |
| content_blocks | jsonb | |
| require_join_requests | boolean | tutor approval gate |
| auto_suspend_missed_payment | boolean | |
| grace_period_days | int | default 7 |
| feedback_mode | text | off / included / paid_addon |
| primary_channel | text | native / whatsapp / classroom |
| google_classroom_link | text | |
| meeting_link | text | static Meet/Zoom URL (migration 131) |
| archived | boolean | soft delete |
| archived_at | timestamptz | |
| created_at | timestamptz | |

#### `group_members`
Approval-based join requests.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| group_id | uuid FK → groups | |
| user_id | uuid FK → profiles | |
| status | text | pending / approved / denied / suspended / banned / removed / invited / active / pending_approval / rejected / archived |
| joined_at | timestamptz | |

#### `group_sessions`
Recurrence definition for a set of occurrences.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| group_id | uuid FK → groups | |
| title | text | |
| recurrence_type | text | NONE / DAILY / WEEKLY / MONTHLY |
| recurrence_days | int[] | 0–6 (JS getDay()) |
| start_time | text | HH:MM |
| duration_minutes | int | |
| starts_on | date | |
| ends_on | date | optional |
| recurrence_rule | text | iCal RRULE |
| timezone | text | |
| meeting_platform | text | |
| meeting_external_id | text | cached meeting ID |
| meeting_join_url | text | cached join URL |
| meeting_created_at | timestamptz | |
| updated_at | timestamptz | |

#### `group_session_occurrences`
Individual session instances generated from recurrence rules.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| group_session_id | uuid FK → group_sessions | |
| scheduled_start_at | timestamptz | |
| scheduled_end_at | timestamptz | |
| status | text | |
| cancelled_at | timestamptz | |
| title | text | per-occurrence override (migration 121) |
| meeting_join_url | text | |
| meeting_platform | text | |
| timezone | text | |
| occurrence_index | int | |
| is_cancelled | boolean | |

#### `group_enrollments`
Subscription/seat model (introduced migration 094).

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| student_id | uuid FK → profiles | |
| group_id | uuid FK → groups | |
| session_id | uuid | optional (for SINGLE_SESSION) |
| enrollment_type | text | SUBSCRIPTION / SINGLE_SESSION |
| status | text | ACTIVE / CANCELLED / WAITLISTED / COMPLETED |
| payment_status | text | PENDING / PAID / REFUNDED / FREE |
| payment_ref | text | |
| enrolled_at | timestamptz | |
| expires_at | timestamptz | |

#### `group_waitlist_entries`

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| student_id | uuid FK → profiles | |
| group_id | uuid FK → groups | |
| joined_at | timestamptz | |
| position | int | |

#### `group_reviews`

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| reviewer_id | uuid FK → profiles | |
| tutor_id | uuid FK → profiles | |
| group_id | uuid FK → groups | |
| session_id | uuid | must have PRESENT attendance |
| rating | int | 1–5 |
| comment | text | |
| is_verified | boolean | set when attendance confirmed |
| deleted_at | timestamptz | soft delete |
| created_at | timestamptz | |

#### `group_attendance_records`

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| session_id | uuid FK → group_sessions | |
| student_id | uuid FK → profiles | |
| status | text | PRESENT / ABSENT / LATE |
| marked_at | timestamptz | |
| marked_by_id | uuid FK → profiles | tutor |
| duration_minutes | int | |
| participation_score | numeric | |

#### `group_announcements`
Tutor-only broadcast channel.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| group_id | uuid FK → groups | |
| author_id | uuid FK → profiles | |
| body | text | |
| is_pinned | boolean | |
| created_at / updated_at | timestamptz | |

#### `group_messages`
Async message board (async, not real-time chat).

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| group_id | uuid FK → groups | |
| sender_id | uuid FK → profiles | |
| body | text | |
| is_pinned | boolean | |
| is_locked | boolean | blocks replies |
| parent_message_id | uuid | threading |
| created_at | timestamptz | |

#### `stream_posts` / `stream_replies` / `stream_attachments`
Google Classroom-style stream (migration 092).

- `stream_posts`: post_type (announcement / content / discussion / assignment), message_body, marks_available, due_date, pinned_at, pin_expires_at, author_role (tutor / student)
- `stream_replies`: threaded via parent_reply_id
- `stream_attachments`: file_name, file_url, file_type, file_size_bytes per post

#### `group_promotions` (migration 132)

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| group_id | uuid FK → groups | |
| kind | text | early-bird / time-limited / open-ended |
| discount | int | 1–100% |
| student_cap | int | optional |
| duration_days | int | optional |
| active | boolean | |

#### `group_visits` (migration 102)
Tracks tutor visits; resets inactivity auto-archive timer.

#### `group_activity_log` (migration 102)
Audit trail for archive/restore actions.

#### `tutor_profiles` (migration 094)
Extended tutor info: bio, education, certifications, average_rating, total_reviews, intro_video_url, sample_lesson_url. Updated by `recalculateRating()` on each new group review.

---

### Row-Level Security Summary

| Table | Tutor | Approved Member | Student (own) |
|-------|-------|-----------------|---------------|
| groups | Full CRUD own | Read non-archived | Read public |
| group_members | Read all | Read approved peers | Read own row |
| group_sessions | Full CRUD | Read | — |
| group_session_occurrences | Full CRUD | Read | — |
| group_enrollments | Read group's | — | Read own |
| group_reviews | Update own | — | Insert once |
| stream_posts | Any post_type | discussion only | — |
| group_announcements | Post | Read approved | — |

---

## API Routes

### Group CRUD

| Method | Route | Auth | Notes |
|--------|-------|------|-------|
| GET | `/api/groups` | Authenticated | Paginated list; supports subject, formLevel, difficulty, recurrenceType, sessionFrequency, availability, minRating, minPrice, maxPrice, search, sortBy (latest/rating/members/price/nextSession), page, limit; computes next_occurrence per group |
| POST | `/api/groups` | Tutor | Create group; 4 fallback attempts for schema drift |
| GET | `/api/groups/[groupId]` | Any | Full detail: tutor + members + sessions + occurrences + reviews + "other classes by this tutor"; service client bypasses RLS |
| PATCH | `/api/groups/[groupId]` | Tutor (own) | All settings fields; triggers occurrence regeneration if schedule changed |
| DELETE | `/api/groups/[groupId]` | Tutor (own) | Hard delete; cascades all child records manually |

### Membership

| Method | Route | Auth | Notes |
|--------|-------|------|-------|
| GET | `/api/groups/[groupId]/members` | Tutor / approved member | Tutor sees all; others see only approved/active/invited |
| POST | `/api/groups/[groupId]/members` | Student | Request to join; status='pending' if require_join_requests, else 'approved'; notifies tutor |
| PATCH | `/api/groups/[groupId]/members/[userId]` | Tutor | Approve or deny; notifies student |
| DELETE | `/api/groups/[groupId]/members/[userId]` | Tutor or self | Remove or leave |

### Enrollment

| Method | Route | Auth | Notes |
|--------|-------|------|-------|
| POST | `/api/groups/[groupId]/enroll` | Student | SUBSCRIPTION or SINGLE_SESSION; waitlist if at capacity; payment_status determined by pricing_model |
| GET | `/api/groups/[groupId]/enrollments` | Tutor | Lists ACTIVE enrollments with student profiles |
| GET | `/api/groups/[groupId]/waitlist` | Tutor | Lists waitlist positions |

### Sessions & Occurrences

| Method | Route | Auth | Notes |
|--------|-------|------|-------|
| GET | `/api/groups/[groupId]/sessions` | Tutor / member | Sessions + all occurrences; returns group.meeting_link |
| POST | `/api/groups/[groupId]/sessions` | Tutor | Creates session + auto-generates occurrences (cap 400); notifies approved members |
| PATCH | `/api/groups/[groupId]/sessions/[sessionId]` | Tutor | title, start_time, duration_minutes, ends_on; does NOT regenerate occurrences |
| DELETE | `/api/groups/[groupId]/sessions/[sessionId]` | Tutor | Cascades occurrences |
| GET | `/api/groups/[groupId]/sessions/[sessionId]/occurrences` | Tutor / member | |
| PATCH | `/api/groups/[groupId]/sessions/[sessionId]/occurrences/[occId]` | Tutor | Update or cancel individual occurrence |
| DELETE | `/api/groups/[groupId]/sessions/[sessionId]/occurrences/[occId]` | Tutor | |

### Attendance & Reviews

| Method | Route | Auth | Notes |
|--------|-------|------|-------|
| POST | `/api/groups/[groupId]/sessions/[sessionId]/attendance` | Tutor | PRESENT / ABSENT / LATE; upserts on (session_id, student_id) |
| POST | `/api/groups/[groupId]/reviews` | Student | Requires ACTIVE enrollment + verified PRESENT attendance; once per group; triggers recalculateRating() |
| GET | `/api/groups/[groupId]/reviews` | Any | page, limit, sortBy (recent/rating) |

### Communications

| Method | Route | Auth | Notes |
|--------|-------|------|-------|
| GET | `/api/groups/[groupId]/announcements` | Tutor / approved member | |
| POST | `/api/groups/[groupId]/announcements` | Tutor | Notifies approved members |
| GET | `/api/groups/[groupId]/stream` | Tutor / member | Paginated stream posts + nested replies + attachments |
| POST | `/api/groups/[groupId]/stream/post` | Tutor / student | Tutor: any post_type; Student: discussion only |
| PATCH | `/api/groups/[groupId]/stream/post/[postId]` | Author | Edit post |
| DELETE | `/api/groups/[groupId]/stream/post/[postId]` | Author or tutor | |
| POST | `/api/groups/[groupId]/stream/post/[postId]/submissions` | Student | Assignment submission |
| GET | `/api/groups/[groupId]/stream/post/[postId]/private-comments` | | Private feedback on post |

### Analytics & Lifecycle

| Method | Route | Auth | Notes |
|--------|-------|------|-------|
| GET | `/api/groups/[groupId]/analytics` | Tutor | |
| GET | `/api/groups/[groupId]/retention` | Tutor | Retention metrics |
| POST | `/api/groups/[groupId]/archive` | Tutor | Soft archive |
| POST | `/api/groups/[groupId]/restore` | Tutor | Restore archived group |
| POST | `/api/groups/[groupId]/visit` | Tutor | Resets inactivity timer |

### Promotions

| Method | Route | Auth | Notes |
|--------|-------|------|-------|
| GET | `/api/groups/[groupId]/promotions` | Any | Active promotions only |
| POST | `/api/groups/[groupId]/promotions` | Tutor | kind: early-bird / time-limited / open-ended |
| PATCH | `/api/groups/[groupId]/promotions/[promotionId]` | Tutor | |
| DELETE | `/api/groups/[groupId]/promotions/[promotionId]` | Tutor | |

### Feedback (Parent Reporting)

| Method | Route | Auth | Notes |
|--------|-------|------|-------|
| POST | `/api/groups/[groupId]/feedback/settings` | Tutor | Configure feedback mode |
| GET/POST | `/api/groups/[groupId]/feedback/periods` | Tutor | Manage billing periods |
| POST | `/api/groups/[groupId]/feedback/entries` | Tutor | Create feedback entry for student |
| GET | `/api/groups/[groupId]/feedback/parent/[childId]` | Parent | View child's feedback |
| POST | `/api/groups/[groupId]/feedback/student` | Student | Self-assessment |

### Other

| Method | Route | Notes |
|--------|-------|-------|
| GET | `/api/groups/[groupId]/wa-token` | WhatsApp integration token |
| POST | `/api/groups/[groupId]/wa-redirect` | WhatsApp redirect |
| GET | `/api/groups/[groupId]/publish` | Publish to marketplace |

---

## Application Pages

### `/app/groups/`
- `page.tsx` — Role-based redirect: tutor → `/tutor/classes`, student → `/student/dashboard`, parent → `/parent/dashboard`
- `[groupId]/page.tsx` — Redirects to `/lessons/[groupId]` (group detail lives in /lessons route)

### `/app/tutor/classes/`

**`page.tsx`** — "My Classes" dashboard
- Lists all non-archived groups owned by the tutor
- Fetches member counts via `/api/groups/[id]/members`
- Stats bar: total classes, total members, lifetime earnings
- Filter by kind (all / group / 1:1) and search
- Card shows: thumbnail gradient, subject tag, level tag, member count, next session date, earnings
- Actions per card: Open, Settings, visibility toggle, view sessions, delete (requires typing class name to confirm)
- Groups classified as 1:1 vs group based on `max_students` field

**`new/page.tsx`** — Multi-step class creation
- Step 1: Type selection (Group class vs. Recurring 1:1)
- Step 2: Settings form
  - **Basics**: Title, Subject (from `subjects` table), Level
  - **Class bio**: Long description
  - **Capacity & billing**: Student limit (2–500, default 8), Billing model, Price (TTD), Per-member service fee
  - **Access & policies**: Visibility, Enable join requests, Auto-suspend overdue, Grace window (days)
  - **Communication**: WhatsApp link, Google Classroom link, Primary channel
  - **Parent feedback**: Mode, Price per report
- POST to `/api/groups` on publish

**`[id]/page.tsx`** — Individual class hub (routing destination for Open action)

---

## Types

### `lib/types/groups.ts`

**Enums:** `GroupMemberStatus`, `GroupDifficulty`, `GroupFormLevel`, `GroupPricingModel`, `GroupPricingMode`, `GroupPublishStatus`, `GroupRecurrenceTypeV2`, `GroupEnrollmentType`, `GroupEnrollmentStatus`, `GroupPaymentStatus`, `GroupAttendanceStatus`, `DayOfWeek`

**Core interfaces:** `Group`, `GroupWithTutor` (+ tutor profile + member_count + next_occurrence + current_user_membership), `GroupMember`, `GroupSession`, `GroupSessionWithOccurrences`, `GroupOccurrence`, `GroupMessage`, `GroupEnrollment`, `GroupWaitlistEntry`, `GroupReview`, `GroupAttendanceRecord`

**Input types:** `CreateGroupInput`, `UpdateGroupInput`, `CreateGroupSessionInput`, `PostGroupMessageInput`, `PatchGroupMessageInput`

**Filter types:** `GroupFilters` — subjects[], tutor_name, form_level, min_rating, min_price, max_price, session_frequency, availability, day

### `lib/types/groupStream.ts`

`StreamPostType`, `StreamAuthorRole`, `StreamPost`, `StreamReply`, `StreamAttachment`, `StreamPostWithAuthor`, `CreateStreamPostInput`

---

## Services & Utilities

### `lib/services/groupReviews.ts`
- `recalculateRating(tutorId)` — Aggregates all non-deleted `group_reviews` for a tutor; updates `tutor_profiles.average_rating` and `total_reviews`

### `lib/featureFlags/groupsFeature.ts`
- `isGroupsFeatureEnabled()` — Reads `NEXT_PUBLIC_GROUPS_ENABLED`; defaults `true` in local dev

---

## Flows

### Joining a Group

```
Student → POST /api/groups/[id]/members
  ↓
require_join_requests = true?
  ├─ Yes → status = 'pending'; tutor notified (new_class_member)
  └─ No  → status = 'approved'; student is immediately active

Tutor → PATCH /api/groups/[id]/members/[userId]
  ├─ approve → student notified (ENROLLMENT_CONFIRMED)
  └─ deny    → student notified (booking_declined)

Student / Tutor → DELETE /api/groups/[id]/members/[userId]
  → removes membership row
```

### Enrollment (Paid / Capped Classes)

```
Student → POST /api/groups/[id]/enroll
  { enrollmentType: 'SUBSCRIPTION' | 'SINGLE_SESSION', sessionId?, paymentRef? }
  ↓
capacity < max_students?
  ├─ Yes → group_enrollments (status=ACTIVE)
  │         payment_status = FREE | PAID | PENDING (based on pricing_model)
  │         notify student (ENROLLMENT_CONFIRMED) + tutor (booking_request)
  └─ No  → group_waitlist_entries (position = current count + 1)
            notify student of waitlist position
```

### Session Scheduling & Occurrence Generation

```
Tutor → POST /api/groups/[id]/sessions
  { recurrence_type, recurrence_days, start_time, duration_minutes, starts_on, ends_on, timezone_offset }
  ↓
generateOccurrences() builds occurrence rows:
  - NONE:   1 occurrence
  - DAILY:  1/day up to ends_on or 365 occurrences
  - WEEKLY: matching recurrence_days up to ends_on or 104 occurrences
  - Hard cap: 400 occurrences total
  ↓
Bulk insert into group_session_occurrences
Notify approved members (SESSION_REMINDER)
```

**Important:** Editing a session via `PATCH /sessions/[sessionId]` does NOT regenerate occurrences. Stale occurrences remain. To reschedule, delete the session and recreate it.

### Attendance & Review

```
Session completes
  ↓
Tutor → POST /api/groups/[id]/sessions/[sessionId]/attendance
  { student_id, status: 'PRESENT' | 'ABSENT' | 'LATE' }
  ↓
Student (PRESENT only) → POST /api/groups/[id]/reviews
  { rating, comment, sessionId }
  ↓
recalculateRating(tutorId) → updates tutor_profiles
Notify tutor (NEW_REVIEW)
```

### Leaving a Group

```
Student → DELETE /api/groups/[id]/members/[userId]   (self)
  or
Tutor   → DELETE /api/groups/[id]/members/[userId]   (remove)
```

No enrollment cancellation is automatically triggered alongside member removal. `group_enrollments` rows must be handled separately.

### Rate Setting

Pricing is set at group creation or via PATCH. There is no per-student or per-occurrence rate override — pricing is group-wide:

| Field | Applies when |
|-------|-------------|
| price_per_session | pricing_model = PER_SESSION |
| price_monthly | pricing_model = MONTHLY |
| price_per_course | pricing_mode = PER_COURSE |
| member_service_fee | any model; charged per active member |
| parent_feedback_price | feedback_mode = paid_addon |

Promotions (discounts via `group_promotions`) exist in the DB but enrollment logic does not yet apply them.

### Group Deletion

```
Tutor → DELETE /api/groups/[id]
  Cascades (manual, not FK cascade):
    group_sessions → group_session_occurrences → group_attendance_records
    group_enrollments
    group_waitlist_entries
    group_reviews
    group_announcements
    group_messages
    group_members
    stream_posts → stream_replies → stream_attachments
    related notifications
  ↓
Hard delete (no soft delete for group itself — use archive instead)
```

---

## Known Gaps

### 1. Schema Drift / Fallback Proliferation
API routes use 3–4 try/catch fallback `select()` calls to handle column mismatches across git branches. No centralized schema validation. Affects: GET /api/groups, GET /api/groups/[id], GET /api/groups/[id]/sessions, GET /api/groups/[id]/stream.

### 2. Occurrence Regeneration Not Wired to Edits
`PATCH /sessions/[sessionId]` saves new `start_time`, `duration_minutes`, etc. but does NOT regenerate `group_session_occurrences`. Existing occurrences stay unchanged. Workaround: delete session + recreate.

### 3. Three Meeting Link Locations
- `group_sessions.meeting_join_url` (migration 090 — session-level cache)
- `group_session_occurrences.meeting_link` (migration 094 — occurrence-level)
- `groups.meeting_link` (migration 131 — static group-level URL)

No single authoritative source; code reads whichever is non-null first.

### 4. `group_members` vs `group_enrollments` Ambiguity
Both tables represent "student is in group." `group_members` is the approval-flow table (legacy). `group_enrollments` is the newer subscription/seat model. Neither supersedes the other in current code — both can coexist for the same student+group pair. Source-of-truth for session access is unclear.

### 5. Leaving Does Not Cancel Enrollment
`DELETE /members/[userId]` removes the `group_members` row. The corresponding `group_enrollments` row is left `ACTIVE`. No cascade or auto-cancel. Enrollment history becomes orphaned.

### 6. Attendance History Endpoint Missing
`POST /sessions/[sessionId]/attendance` marks attendance. There is no `GET` equivalent to retrieve a student's attendance history across all sessions of a group.

### 7. Promotions Not Applied at Enrollment
`group_promotions` table exists with discount logic. The enrollment endpoint (`POST /enroll`) does not read or apply active promotions. Discounts are stored but never calculated.

### 8. Feedback System Partially Wired
Columns (`feedback_mode`, `parent_feedback_price`) and API routes (`/feedback/settings`, `/feedback/periods`, `/feedback/entries`, `/feedback/parent/[childId]`, `/feedback/student`) exist but implementation details of the routes were not auditable. No UI shown for tutors to create or manage feedback entries.

### 9. Assignment Submission Flow Incomplete
`stream_posts` supports `post_type = 'assignment'` with `marks_available` and `due_date`. `POST /stream/post/[postId]/submissions` exists. No grading, grade return, or student-facing marks display is visible.

### 10. WhatsApp / Google Classroom Integration Stubs
`/wa-token` and `/wa-redirect` routes exist. `primary_channel`, `google_classroom_link`, and WhatsApp link fields are stored. No implementation of actual channel switching or redirect logic is auditable.

### 11. Promotions Have No UI
`group_promotions` CRUD API routes exist. No UI on the tutor class settings page to create, edit, or activate promotions.

### 12. Waitlist Not Auto-Promoted
When an enrollment is cancelled, `group_waitlist_entries` positions are not automatically promoted. No queue-processing logic for the waitlist.

### 13. Extended Member Status Not Used in Code
Migration 127 added `suspended`, `banned`, `removed`, `invited`, `active`, etc. to `group_members.status`. Active code paths only write `pending`, `approved`, or `denied`. The extended statuses are stored but not acted on.

### 14. Timezone Handling Ambiguous
Session creation accepts a `timezone_offset` (numeric, from client). The `timezone` column also exists on both `groups` and `group_sessions`. Occurrence timestamps are generated using whichever is provided; no canonical source is enforced.

### 15. Occurrence Deduplication Risk
If `generateUpcomingSessions()` is called multiple times on the same session (e.g., repeated PATCH to recurrence fields), it may produce duplicate occurrences. No upsert or existence check is performed.

---

## Migration Index

| Migration | Summary |
|-----------|---------|
| 087 | groups, group_members, group_sessions, group_session_occurrences, group_messages |
| 088 | group_announcements |
| 089–090 | meeting_provider / meeting_join_url caching on sessions + occurrences |
| 092 | stream_posts, stream_replies, stream_attachments |
| 094 | group_enrollments, group_waitlist_entries, group_reviews, group_attendance_records, tutor_profiles; extended groups/sessions schema |
| 095 | Marketplace fields on groups (form_level, topic, pricing_mode, media_gallery) |
| 102 | group_visits, group_activity_log (inactivity/archive tracking) |
| 121 | Per-occurrence title override on group_session_occurrences |
| 127 | Extended group_members.status constraint |
| 128 | Class settings: require_join_requests, auto_suspend_missed_payment, grace_period_days, google_classroom_link, feedback_mode |
| 129 | bio, member_service_fee, visibility, primary_channel, parent_feedback_price |
| 130 | Unified member status constraint (resolves 127 conflicts) |
| 131 | groups.meeting_link (static URL) |
| 132 | group_promotions |

---

## Environment Variables

| Variable | Purpose |
|----------|---------|
| NEXT_PUBLIC_GROUPS_ENABLED | Feature flag; defaults true in dev |
| NEXT_PUBLIC_SUPABASE_URL | Supabase project URL |
| SUPABASE_SERVICE_ROLE_KEY | Used in service-client group detail queries to bypass RLS |
