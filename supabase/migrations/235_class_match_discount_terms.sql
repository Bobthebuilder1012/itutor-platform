-- =====================================================================
-- MIGRATION 235: Class Match Week — teacher-set discount terms
-- =====================================================================
--
-- Two owner decisions on the teacher-facing offer, both of which 232 had
-- constrained the other way.
--
-- 1. FREE-FORM PERCENTAGE WITH A FLOOR OF 10
--
-- 232 pinned discount_percent to the fixed tiers (10, 15, 20), on the reasoning
-- in docs 01 §1.1: comparable cards, and no race to undercut on percentage. The
-- owner wants the teacher to name their own number with 10 as the minimum.
--
-- The upper bound is 50, which is NOT in the spec — it is a typo guard. Nothing
-- else in this flow catches a teacher who means 20 and types 200, and the
-- percentage is spent against real money at checkout. group_promotions.discount
-- (migration 166) already allows 1..100, so a coupon carrying any value this
-- table permits stores fine; the tighter bound is deliberately here, where the
-- teacher enters it.
--
-- 2. AN ABSOLUTE DEADLINE ALONGSIDE THE PER-ATTENDEE WINDOW
--
-- redemption_window_days stays, and stays primary: a family that attends on the
-- last day of the campaign deserves the same claim window as one that attended
-- on the first, which an absolute date alone cannot give them. But a teacher
-- also needs to be able to say "this offer is over on the 31st" and have that
-- hold — otherwise a taster on the final evening issues a coupon redeemable well
-- into the next term, at a price they set for a campaign that has ended.
--
-- So both exist and the coupon takes the EARLIER of the two. Nullable, because
-- no deadline is the default and the window alone is a complete offer.
--
-- The resolution happens in lib/classMatchWeek/coupons.ts at issue time, not
-- here: the deadline is a property of the offer, while a coupon's expires_at is
-- an absolute instant resolved when that particular attendee clicked join. Same
-- division of labour migration 231 already set up for duration_days.

begin;

-- ---------------------------------------------------------------------
-- 1. Free-form percentage, minimum 10
-- ---------------------------------------------------------------------

alter table public.class_match_sessions
  drop constraint if exists class_match_sessions_discount_check;

alter table public.class_match_sessions
  add constraint class_match_sessions_discount_check
  check (discount_percent >= 10 and discount_percent <= 50);

comment on column public.class_match_sessions.discount_percent is
  'Teacher-set, minimum 10. The upper bound of 50 is a typo guard rather than a product rule — this number is spent against real money at checkout and nothing downstream questions it.';

-- ---------------------------------------------------------------------
-- 2. Optional absolute deadline on the offer
-- ---------------------------------------------------------------------

alter table public.class_match_sessions
  add column if not exists discount_expires_at timestamptz;

comment on column public.class_match_sessions.discount_expires_at is
  'Optional hard deadline for claiming this session''s discount. NULL means the per-attendee redemption_window_days alone decides. When set, an issued coupon expires at whichever comes FIRST — join + window, or this instant — so a late attendee never receives a coupon that outlives the offer.';

commit;
