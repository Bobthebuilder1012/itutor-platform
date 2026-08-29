-- 245 — Parent approval for GROUP CLASS enrolment.
--
-- The approval machinery built in 219/224 covers 1:1 bookings only: a request
-- is a `bookings` row with status PENDING_PARENT_APPROVAL. A group class has no
-- booking row — no session_type_id, no single requested_start_at — so a child
-- whose parent set "ask for approval first" could join every class on the
-- marketplace without a request ever existing. Handover statement 2 is explicit
-- that this is not a payment gate: "Approval is consent, not just payment — a
-- free class still needs it." A free class was exactly the hole.
--
-- The request therefore gets its own table rather than being forced into
-- `bookings`. group_members is not the place either: that table is the tutor's
-- roster, its status CHECK is a roster vocabulary, and a request the parent has
-- not answered is not a roster entry in any state.
--
-- Add-only. Nothing here changes an existing table's data.

create table if not exists public.class_join_requests (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade,
  -- The parent who must answer. Resolved from parent_child_links when the
  -- request is created and stored, so a link changed later cannot silently
  -- move a live request to a different person's queue.
  parent_id uuid not null references public.profiles(id) on delete cascade,

  status text not null default 'PENDING'
    check (status in ('PENDING', 'APPROVED', 'DECLINED', 'WITHDRAWN')),

  requested_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_by uuid references public.profiles(id) on delete set null,
  decline_reason text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists class_join_requests_parent_idx
  on public.class_join_requests (parent_id, status, requested_at desc);
create index if not exists class_join_requests_student_idx
  on public.class_join_requests (student_id, status);
create index if not exists class_join_requests_group_idx
  on public.class_join_requests (group_id, status);

-- One live request per child per class. A second "ask my parent" press must
-- find the first request, not raise a duplicate the parent has to answer twice.
create unique index if not exists class_join_requests_one_pending
  on public.class_join_requests (group_id, student_id)
  where status = 'PENDING';

-- RLS on, because anon holds no business here and an unprotected table on this
-- project has been a defect twice before (see 244).
alter table public.class_join_requests enable row level security;

drop policy if exists class_join_requests_student_read on public.class_join_requests;
create policy class_join_requests_student_read
  on public.class_join_requests for select
  using (auth.uid() = student_id);

drop policy if exists class_join_requests_parent_read on public.class_join_requests;
create policy class_join_requests_parent_read
  on public.class_join_requests for select
  using (auth.uid() = parent_id);

-- Writes are server-only: creating, approving and declining all carry rules
-- (billing resolution, capacity, the tutor's own approval gate) that a policy
-- cannot express. The service role bypasses RLS, so no write policy is granted
-- to anyone else on purpose.

-- notifications.type is a CHECK list, and an insert of an unlisted type throws
-- — which is how tutors once stopped being told about join requests entirely
-- (see 203). Two new types, added the same way the constraint was built.
alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type = any (array[
    'booking_request','booking_request_received','booking_accepted','booking_confirmed',
    'booking_declined','booking_counter_offer','booking_cancelled','new_message',
    'new_stream_post','class_invite','new_class_member','group_session_updated',
    'group_removal','group_removal_payment_action','with_cause_removal_submitted_for_review',
    'with_cause_removal_admin_decision','join_request','join_request_approved',
    'session_rescheduled','tutor_cancelled_session','tutor_added_session','attendance_alert',
    'rsvp_received','payment_succeeded','payment_failed','payment_refunded','funds_released',
    'subscription_payment_succeeded','subscription_activation_delayed','subscription_refund_issued',
    'subscription_payment_reminder','subscription_grace_started','subscription_suspended',
    'subscription_cancellation_scheduled','subscription_cancellation_finalized',
    'subscription_reactivation','waitlist_offer_available','waitlist_offer_expired',
    'noshow_claim_filed','noshow_claim_response','noshow_claim_escalated','payout_held',
    'payout_released','reliability_warning_issued','rating_appeal_decided','strike_appeal_decided',
    'new_feedback','refund_failed_admin_alert','parent_invite','parent_link_accepted',
    'parent_link_declined','SESSION_REMINDER','ENROLLMENT_CONFIRMED','NEW_ANNOUNCEMENT',
    'SESSION_CANCELLED','NEW_REVIEW','WAITLIST_AVAILABLE','spot_secured',
    'secure_spot_month_ending','secure_spot_refunded','secure_spot_lapsed',
    'parent_approval_request','parent_approval_outcome','seat_unavailable_refunded',
    'feedback_requested',
    -- new in 245
    'child_left_class','child_joined_class'
  ])) not valid;
