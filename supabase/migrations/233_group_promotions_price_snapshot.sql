-- =====================================================================
-- MIGRATION 233: price snapshot on personal coupons
-- =====================================================================
--
-- Migration 231 (on feature/payment-integration) made group_promotions
-- per-user but omitted the price snapshot the Class Match Week docs
-- require at coupon issue (docs/class-match-week/03-conversion-loop.md).
--
-- Why a snapshot rather than the live price: the savings figure shown on
-- the learner dashboard and totalled in the admin export is
-- price x discount x months. Read live, that figure silently changes when
-- a teacher edits price_monthly mid-week — the export stops reconciling
-- with what attendees were actually told they saved. Captured at issue,
-- it is stable for the coupon's whole life.
--
-- NULL means "not a personal coupon" (group-wide promotions never carry
-- one) or a pre-233 coupon; consumers fall back to groups.price_monthly
-- for those, accepting the drift the snapshot exists to prevent.

alter table public.group_promotions
  add column if not exists price_monthly_snapshot numeric;

comment on column public.group_promotions.price_monthly_snapshot is
  'groups.price_monthly captured when a personal coupon is issued. The savings figure derives from this, not the live price, so the export does not drift when a teacher edits the price mid-week. NULL on group-wide promotions.';
