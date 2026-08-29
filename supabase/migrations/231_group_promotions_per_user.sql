-- =====================================================================
-- MIGRATION 231: per-user promotions (campaign coupons)
-- =====================================================================
--
-- Class Match Week issues a discount coupon to an individual attendee. This
-- makes `group_promotions` able to express that, rather than standing up a
-- second discount system beside it.
--
-- WHY EXTEND RATHER THAN ADD A COUPON TABLE
--
-- `group_enrollments.promotion_id` already exists and is already written at
-- checkout. That is the join between "what a discount cost us" and "what
-- revenue it produced" — the single comparison that decides whether the
-- campaign runs a second time. A parallel coupon table would mean either
-- duplicating that column or reconstructing the attribution later, and it
-- would put two discount paths through the same Stripe checkout.
--
-- WHAT NULL MEANS
--
-- `user_id IS NULL` is a promotion offered to everyone — every row that
-- exists today, and how early-bird / time-limited / open-ended continue to
-- work. `user_id` set is a coupon belonging to one person. Existing rows are
-- deliberately not backfilled: NULL already means the right thing for them.
--
-- THE LEAK THIS CLOSES
--
-- Before this migration there was no user dimension at all, so a per-user
-- coupon was not merely unfiltered — it was inexpressible. Inserting one as
-- an ordinary row would have discounted the class for every buyer, because
-- both the read policy and the checkout resolver select on
-- `group_id + active` alone. The CHECK below makes the invariant structural:
-- a personal coupon without an owner cannot be stored.
--
-- POLICY DRIFT — READ THIS BEFORE EDITING
--
-- Production does not match migration 166. 166 created
-- "Members view active promotions"; production runs "Anyone can read active
-- promotions" (renamed outside migrations) plus a duplicate of the tutor
-- policy. Three policies live where the file defines two. Dropping only the
-- name in 166 would silently leave the permissive read in place and the leak
-- open, so all four known names are dropped below before the replacements
-- are created.
--
-- Note the read policy has no TO clause, matching 166 — it applies to PUBLIC.
-- `auth.uid()` is NULL for an anonymous caller, so `user_id = auth.uid()` is
-- never true for them and they see group-wide promotions only. That is the
-- intended behaviour, not an oversight.

begin;

-- ---------------------------------------------------------------------
-- Columns
-- ---------------------------------------------------------------------

alter table public.group_promotions
  add column if not exists user_id uuid references public.profiles(id) on delete cascade;

-- `duration_days` is the teacher's configured redemption *window*, a relative
-- value on the offer. A coupon is issued at an unpredictable moment (when the
-- attendee clicks join), so it needs the resolved deadline stored per row.
alter table public.group_promotions
  add column if not exists expires_at timestamptz;

alter table public.group_promotions
  add column if not exists redeemed_at timestamptz;

-- How long the reduced price holds once enrolled, which is a different
-- quantity from how long the coupon remains claimable. The campaign spec
-- requires a finite month count — there is deliberately no "forever" value,
-- because the savings figure is price x discount x months and has no answer
-- for an unbounded duration.
alter table public.group_promotions
  add column if not exists price_duration_months integer;

comment on column public.group_promotions.user_id is
  'Owner of a personal coupon. NULL = promotion offered to everyone (all pre-231 rows).';
comment on column public.group_promotions.expires_at is
  'Absolute claim deadline, resolved from duration_days when the coupon is issued.';
comment on column public.group_promotions.redeemed_at is
  'When this coupon was spent at checkout. NULL = unredeemed.';
comment on column public.group_promotions.price_duration_months is
  'Months the discounted price holds after enrolment. Finite by design; NULL for group-wide promotions.';

-- ---------------------------------------------------------------------
-- Constraints
-- ---------------------------------------------------------------------

-- 166 declared the kind check inline and unnamed, so Postgres generated
-- `group_promotions_kind_check`. It must be dropped by that generated name.
alter table public.group_promotions
  drop constraint if exists group_promotions_kind_check;

alter table public.group_promotions
  add constraint group_promotions_kind_check
  check (kind in ('early-bird', 'time-limited', 'open-ended', 'personal-coupon'));

-- The invariant that makes the leak unrepresentable rather than merely
-- filtered: a personal coupon has an owner, and an owned row is a personal
-- coupon. Both sides are non-nullable expressions, so this is never NULL.
alter table public.group_promotions
  drop constraint if exists group_promotions_personal_owner_check;

alter table public.group_promotions
  add constraint group_promotions_personal_owner_check
  check ((kind = 'personal-coupon') = (user_id is not null));

-- ---------------------------------------------------------------------
-- Index
-- ---------------------------------------------------------------------

-- Checkout resolves promotions on every subscribe, now filtered by owner.
-- Partial because group-wide rows are the overwhelming majority and are
-- already served by the group_id predicate.
create index if not exists group_promotions_user_idx
  on public.group_promotions (group_id, user_id) where user_id is not null;

-- ---------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------

drop policy if exists "Anyone can read active promotions" on public.group_promotions;
drop policy if exists "Members view active promotions" on public.group_promotions;
drop policy if exists "Tutors manage own promotions" on public.group_promotions;
drop policy if exists "Tutors manage their own promotions" on public.group_promotions;

create policy "Read active promotions"
  on public.group_promotions
  for select
  using (
    active = true
    and (user_id is null or user_id = auth.uid())
  );

create policy "Tutors manage own promotions"
  on public.group_promotions
  for all
  using (tutor_id = auth.uid())
  with check (tutor_id = auth.uid());

commit;
