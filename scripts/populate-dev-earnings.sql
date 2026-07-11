DO $$
DECLARE
  tutor   UUID := 'd17d0afc-cedf-4129-86ee-aba60b6203df';
  s1      UUID := '02acdc38-108d-4a79-a61c-8e62e21aed81'; -- Sameer
  s2      UUID := '2bb6f1c7-56f8-49d0-8e09-bc7b33c81d8e'; -- Kavita
  s3      UUID := 'afc4f533-1a0b-456a-8b86-02e09bb1cfc0'; -- YC Student
  s4      UUID := 'b1792e21-2a92-4438-a079-34675746b80a'; -- Aron
  s5      UUID := 'a2d0f71a-9d17-4a4c-b631-ed449a93e22a'; -- Zara

  g_sea   UUID := 'd73e9a63-1e2c-4810-8c65-492e76419e5e'; -- TT$130 × 3 = 390 gross, 297 net
  g_carib UUID := '270766c8-8991-44e9-842f-05fa1dba5ef5'; -- TT$125 × 3 = 375 gross, 300 net
  g_sci   UUID := 'b80edb78-0569-4966-bfe5-5cf299ae6266'; -- TT$120 × 3 = 360 gross, 285 net
  g_writ  UUID := 'e2e1b70c-0c2a-4917-bf51-100f924fe3c8'; -- TT$155 × 3 = 465 gross, 312 net
  g_alg   UUID := '0466004f-e019-4e54-a21b-96f296869b93'; -- TT$140 × 3 = 420 gross, 318 net

  june_1  TIMESTAMPTZ := '2026-06-01 08:00:00+00';
  may_1   TIMESTAMPTZ := '2026-05-01 08:00:00+00';

  -- Enrollment IDs
  e_sea   UUID; e_carib UUID; e_sci UUID; e_writ UUID; e_alg UUID;
  -- Subscription payment IDs (released — June, "This month")
  sp_sea  UUID; sp_carib UUID; sp_sci UUID; sp_writ UUID; sp_alg UUID;
  -- Subscription payment IDs (owed — May, in escrow)
  sp_sea2 UUID; sp_carib2 UUID; sp_sci2 UUID;
  -- Subscription payment IDs (release_ready — April, awaiting transfer)
  sp_alg2 UUID; sp_writ2 UUID;
BEGIN
  -- ── Group enrollments (one representative student per group) ──────────────
  e_sea   := gen_random_uuid(); e_carib := gen_random_uuid();
  e_sci   := gen_random_uuid(); e_writ  := gen_random_uuid();
  e_alg   := gen_random_uuid();

  INSERT INTO public.group_enrollments
    (id, student_id, group_id, status, enrollment_type, payment_status, plan_price_ttd, cancel_at_period_end, reminder_count, updated_at, created_at, current_period_start, current_period_end)
  VALUES
    (e_sea,   s3, g_sea,   'ACTIVE', 'SUBSCRIPTION', 'PAID', 130.00, false, 0, june_1, june_1, june_1, june_1 + interval '30 days'),
    (e_carib, s5, g_carib, 'ACTIVE', 'SUBSCRIPTION', 'PAID', 125.00, false, 0, june_1, june_1, june_1, june_1 + interval '30 days'),
    (e_sci,   s2, g_sci,   'ACTIVE', 'SUBSCRIPTION', 'PAID', 120.00, false, 0, june_1, june_1, june_1, june_1 + interval '30 days'),
    (e_writ,  s4, g_writ,  'ACTIVE', 'SUBSCRIPTION', 'PAID', 155.00, false, 0, june_1, june_1, june_1, june_1 + interval '30 days'),
    (e_alg,   s1, g_alg,   'ACTIVE', 'SUBSCRIPTION', 'PAID', 140.00, false, 0, june_1, june_1, june_1, june_1 + interval '30 days');

  -- ── Subscription payments: June (released — "This month" on dashboard) ─────
  sp_sea   := gen_random_uuid(); sp_carib  := gen_random_uuid();
  sp_sci   := gen_random_uuid(); sp_writ   := gen_random_uuid();
  sp_alg   := gen_random_uuid();

  INSERT INTO public.subscription_payments
    (id, enrollment_id, group_id, student_id, type, amount_ttd, platform_fee_ttd, tutor_payout_ttd, status, period_start, period_end, paid_at, created_at)
  VALUES
    (sp_sea,   e_sea,   g_sea,   s3, 'subscription_initial', 390.00, 93.00,  297.00, 'PAID', june_1, june_1 + interval '30 days', june_1, june_1),
    (sp_carib, e_carib, g_carib, s5, 'subscription_initial', 375.00, 75.00,  300.00, 'PAID', june_1, june_1 + interval '30 days', june_1, june_1 + interval '1 min'),
    (sp_sci,   e_sci,   g_sci,   s2, 'subscription_initial', 360.00, 75.00,  285.00, 'PAID', june_1, june_1 + interval '30 days', june_1, june_1 + interval '2 min'),
    (sp_writ,  e_writ,  g_writ,  s4, 'subscription_initial', 465.00, 153.00, 312.00, 'PAID', june_1, june_1 + interval '30 days', june_1, june_1 + interval '3 min'),
    (sp_alg,   e_alg,   g_alg,   s1, 'subscription_initial', 420.00, 102.00, 318.00, 'PAID', june_1, june_1 + interval '30 days', june_1, june_1 + interval '4 min');

  -- ── Payout ledger: June released = 1,512 TTD total ───────────────────────
  INSERT INTO public.payout_ledger (id, tutor_id, subscription_payment_id, amount_ttd, status, created_at, released_at)
  VALUES
    (gen_random_uuid(), tutor, sp_sea,   297.00, 'released', june_1,                    june_1),
    (gen_random_uuid(), tutor, sp_carib, 300.00, 'released', june_1 + interval '1 min', june_1 + interval '1 min'),
    (gen_random_uuid(), tutor, sp_sci,   285.00, 'released', june_1 + interval '2 min', june_1 + interval '2 min'),
    (gen_random_uuid(), tutor, sp_writ,  312.00, 'released', june_1 + interval '3 min', june_1 + interval '3 min'),
    (gen_random_uuid(), tutor, sp_alg,   318.00, 'released', june_1 + interval '4 min', june_1 + interval '4 min');

  -- ── Subscription payments: May (owed — in escrow) ─────────────────────────
  sp_sea2   := gen_random_uuid(); sp_carib2 := gen_random_uuid(); sp_sci2 := gen_random_uuid();

  INSERT INTO public.subscription_payments
    (id, enrollment_id, group_id, student_id, type, amount_ttd, platform_fee_ttd, tutor_payout_ttd, status, period_start, period_end, paid_at, created_at)
  VALUES
    (sp_sea2,   e_sea,   g_sea,   s3, 'subscription_renewal', 390.00, 93.00, 297.00, 'PAID', may_1, may_1 + interval '30 days', may_1, may_1),
    (sp_carib2, e_carib, g_carib, s5, 'subscription_renewal', 375.00, 75.00, 300.00, 'PAID', may_1, may_1 + interval '30 days', may_1, may_1 + interval '1 min'),
    (sp_sci2,   e_sci,   g_sci,   s2, 'subscription_renewal', 360.00, 75.00, 285.00, 'PAID', may_1, may_1 + interval '30 days', may_1, may_1 + interval '2 min');

  INSERT INTO public.payout_ledger (id, tutor_id, subscription_payment_id, amount_ttd, status, created_at)
  VALUES
    (gen_random_uuid(), tutor, sp_sea2,   297.00, 'owed', may_1),
    (gen_random_uuid(), tutor, sp_carib2, 300.00, 'owed', may_1 + interval '1 min'),
    (gen_random_uuid(), tutor, sp_sci2,   285.00, 'owed', may_1 + interval '2 min');

  -- ── Subscription payments: April (release_ready — awaiting transfer) ──────
  sp_alg2 := gen_random_uuid(); sp_writ2 := gen_random_uuid();

  INSERT INTO public.subscription_payments
    (id, enrollment_id, group_id, student_id, type, amount_ttd, platform_fee_ttd, tutor_payout_ttd, status, period_start, period_end, paid_at, created_at)
  VALUES
    (sp_alg2,  e_alg,  g_alg,  s1, 'subscription_renewal', 420.00, 102.00, 318.00, 'PAID', '2026-04-01 08:00:00+00', '2026-05-01 08:00:00+00', '2026-04-01 08:00:00+00', '2026-04-01 08:00:00+00'),
    (sp_writ2, e_writ, g_writ, s4, 'subscription_renewal', 465.00, 153.00, 312.00, 'PAID', '2026-04-01 08:00:00+00', '2026-05-01 08:00:00+00', '2026-04-01 08:00:00+00', '2026-04-01 08:01:00+00');

  INSERT INTO public.payout_ledger (id, tutor_id, subscription_payment_id, amount_ttd, status, created_at, released_at)
  VALUES
    (gen_random_uuid(), tutor, sp_alg2,  318.00, 'release_ready', '2026-04-01 08:00:00+00', '2026-05-01 08:00:00+00'),
    (gen_random_uuid(), tutor, sp_writ2, 312.00, 'release_ready', '2026-04-01 08:01:00+00', '2026-05-01 08:01:00+00');

  -- ── tutor_balances: pending = owed sum (882), available = release_ready sum (630) ─
  INSERT INTO public.tutor_balances (tutor_id, pending_ttd, available_ttd, last_updated)
  VALUES (tutor, 882.00, 630.00, NOW())
  ON CONFLICT (tutor_id) DO UPDATE
    SET pending_ttd   = EXCLUDED.pending_ttd,
        available_ttd = EXCLUDED.available_ttd,
        last_updated  = EXCLUDED.last_updated;
END $$;
