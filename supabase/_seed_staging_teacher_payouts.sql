-- =====================================================================
-- STAGING SEED — Teacher Payouts / Lesson Payments test data
-- Generated. Every row id starts with 5eed; remove it all with
-- supabase/_cleanup_staging_teacher_payouts.sql. NEVER run on production.
-- Emails are jovangoodluck+seed…@myitutor.com and onboarding mail is switched
-- never queued (its trigger is off for the profile insert only). Groups are private with no schedule, and
-- enrolments are Stripe-billed, so no cron acts on them.
-- =====================================================================
begin;

-- Exchange rate so the USD tutor's rows stamp (staging has none).
insert into public.fx_rates (rate_date, base, quote, ttd_per_usd, source, published_date)
values ('2026-07-01', 'TTD', 'USD', 6.7850, 'seed', '2026-07-01')
on conflict do nothing;


-- The onboarding trigger needs an auth.users row these test profiles do not
-- have, and they must never get a welcome email anyway. Off for this insert only.
alter table public.profiles disable trigger auto_queue_onboarding_on_signup;

insert into public.profiles (id, full_name, display_name, email, role, username, is_dev_account) values
  ('5eed0001-0000-4000-8000-000000000001', 'Aaliyah Mohammed (Test)', 'Aaliyah Mohammed', 'jovangoodluck+seed_aaliyah@myitutor.com', 'tutor', 'seed_aaliyah', true),
  ('5eed0001-0000-4000-8000-000000000002', 'Marcus Baptiste (Test)', 'Marcus Baptiste', 'jovangoodluck+seed_marcus@myitutor.com', 'tutor', 'seed_marcus', true),
  ('5eed0001-0000-4000-8000-000000000003', 'Priya Ramdial (Test)', 'Priya Ramdial', 'jovangoodluck+seed_priya@myitutor.com', 'tutor', 'seed_priya', true),
  ('5eed0001-0000-4000-8000-000000000004', 'Kevin Ali (Test)', 'Kevin Ali', 'jovangoodluck+seed_kevin@myitutor.com', 'tutor', 'seed_kevin', true),
  ('5eed0001-0000-4000-8000-000000000005', 'Shanice Charles (Test)', 'Shanice Charles', 'jovangoodluck+seed_shanice@myitutor.com', 'tutor', 'seed_shanice', true),
  ('5eed0002-0000-4000-8000-000000000001', 'Kiara Rampersad (Test)', 'Kiara Rampersad', 'jovangoodluck+seed_student_1@myitutor.com', 'student', 'seed_student_1', true),
  ('5eed0002-0000-4000-8000-000000000002', 'Ethan Joseph (Test)', 'Ethan Joseph', 'jovangoodluck+seed_student_2@myitutor.com', 'student', 'seed_student_2', true),
  ('5eed0002-0000-4000-8000-000000000003', 'Zara Khan (Test)', 'Zara Khan', 'jovangoodluck+seed_student_3@myitutor.com', 'student', 'seed_student_3', true),
  ('5eed0002-0000-4000-8000-000000000004', 'Malik Thomas (Test)', 'Malik Thomas', 'jovangoodluck+seed_student_4@myitutor.com', 'student', 'seed_student_4', true),
  ('5eed0002-0000-4000-8000-000000000005', 'Sofia Ramnarine (Test)', 'Sofia Ramnarine', 'jovangoodluck+seed_student_5@myitutor.com', 'student', 'seed_student_5', true),
  ('5eed0002-0000-4000-8000-000000000006', 'Isaiah George (Test)', 'Isaiah George', 'jovangoodluck+seed_student_6@myitutor.com', 'student', 'seed_student_6', true),
  ('5eed0002-0000-4000-8000-000000000007', 'Leah Boodoo (Test)', 'Leah Boodoo', 'jovangoodluck+seed_student_7@myitutor.com', 'student', 'seed_student_7', true),
  ('5eed0002-0000-4000-8000-000000000008', 'Nathan Singh (Test)', 'Nathan Singh', 'jovangoodluck+seed_student_8@myitutor.com', 'student', 'seed_student_8', true),
  ('5eed0002-0000-4000-8000-000000000009', 'Amara Lewis (Test)', 'Amara Lewis', 'jovangoodluck+seed_student_9@myitutor.com', 'student', 'seed_student_9', true),
  ('5eed0002-0000-4000-8000-000000000010', 'Josiah Phillip (Test)', 'Josiah Phillip', 'jovangoodluck+seed_student_10@myitutor.com', 'student', 'seed_student_10', true),
  ('5eed0002-0000-4000-8000-000000000011', 'Tiana Maharaj (Test)', 'Tiana Maharaj', 'jovangoodluck+seed_student_11@myitutor.com', 'student', 'seed_student_11', true),
  ('5eed0002-0000-4000-8000-000000000012', 'Caleb Hosein (Test)', 'Caleb Hosein', 'jovangoodluck+seed_student_12@myitutor.com', 'student', 'seed_student_12', true)
on conflict (id) do nothing;

update public.profiles set billing_mode = 'self_allowed' where id::text like '5eed0002-%';

alter table public.profiles enable trigger auto_queue_onboarding_on_signup;

insert into public.tutor_payout_accounts (tutor_id, provider, payout_name, payout_account_identifier, bank_name, branch, account_type, payout_currency) values
  ('5eed0001-0000-4000-8000-000000000001', 'bank_transfer', 'Aaliyah Mohammed', '100045674821', 'Republic Bank', 'Port of Spain', 'savings', 'TTD'),
  ('5eed0001-0000-4000-8000-000000000002', 'bank_transfer', 'Marcus Baptiste', '2210098853', 'First Citizens Bank', 'Chaguanas', 'chequing', 'TTD'),
  ('5eed0001-0000-4000-8000-000000000003', 'bank_transfer', 'Priya Ramdial', '600071239907', 'Scotiabank', 'San Fernando', 'savings', 'USD'),
  ('5eed0001-0000-4000-8000-000000000004', 'bank_transfer', 'Kevin Ali', '330045126610', 'RBC Royal Bank', 'Arima', 'chequing', 'TTD'),
  ('5eed0001-0000-4000-8000-000000000005', 'bank_transfer', 'Shanice Charles', '100088120334', 'Republic Bank', 'San Fernando', 'savings', 'TTD');

insert into public.groups (id, name, description, tutor_id, subject, status, visibility, pricing_model, price_monthly, class_format, max_students, timezone) values
  ('5eed0003-0000-4000-8000-000000000001', 'CSEC Mathematics — Form 5 (Test)', 'Staging test class for Teacher Payouts.', '5eed0001-0000-4000-8000-000000000001', 'Mathematics', 'PUBLISHED', 'private', 'MONTHLY', 200, 'online', 20, 'UTC'),
  ('5eed0003-0000-4000-8000-000000000002', 'CAPE Physics Unit 1 (Test)', 'Staging test class for Teacher Payouts.', '5eed0001-0000-4000-8000-000000000002', 'Physics', 'PUBLISHED', 'private', 'MONTHLY', 250, 'online', 20, 'UTC'),
  ('5eed0003-0000-4000-8000-000000000003', 'SEA Prep English (Test)', 'Staging test class for Teacher Payouts.', '5eed0001-0000-4000-8000-000000000003', 'English', 'PUBLISHED', 'private', 'MONTHLY', 180, 'online', 20, 'UTC'),
  ('5eed0003-0000-4000-8000-000000000004', 'CSEC Chemistry (Test)', 'Staging test class for Teacher Payouts.', '5eed0001-0000-4000-8000-000000000004', 'Chemistry', 'PUBLISHED', 'private', 'MONTHLY', 220, 'online', 20, 'UTC'),
  ('5eed0003-0000-4000-8000-000000000005', 'CSEC Spanish (Test)', 'Staging test class for Teacher Payouts.', '5eed0001-0000-4000-8000-000000000005', 'Spanish', 'PUBLISHED', 'private', 'MONTHLY', 160, 'online', 20, 'UTC');

insert into public.payout_batches (id, generated_by, generated_at, paid_at, status, batch_type, currency, csv_filename, csv_body, csv_generated_at, total_amount_ttd, line_count) values
  ('5eed0007-0000-4000-8000-000000000001', 'fa0a6d61-d9d4-4287-a32c-c81021d0ab8b', '2026-09-12T15:00:00.000Z', '2026-09-12T19:00:00.000Z', 'paid', 'lesson', 'TTD', 'itutor-lesson-payouts-seed-1.csv', null, '2026-09-12T15:00:00.000Z', 0, 0),
  ('5eed0007-0000-4000-8000-000000000002', 'fa0a6d61-d9d4-4287-a32c-c81021d0ab8b', '2026-08-31T14:00:00.000Z', '2026-08-31T18:00:00.000Z', 'paid', 'lesson', 'TTD', 'itutor-lesson-payouts-seed-2.csv', null, '2026-08-31T14:00:00.000Z', 0, 0),
  ('5eed0007-0000-4000-8000-000000000003', 'fa0a6d61-d9d4-4287-a32c-c81021d0ab8b', '2026-09-30T14:00:00.000Z', '2026-09-30T19:00:00.000Z', 'paid', 'lesson', 'TTD', 'itutor-lesson-payouts-seed-3.csv', null, '2026-09-30T14:00:00.000Z', 0, 0),
  ('5eed0007-0000-4000-8000-000000000004', 'fa0a6d61-d9d4-4287-a32c-c81021d0ab8b', '2026-10-05T13:00:00.000Z', null, 'exported', 'lesson', 'TTD', 'itutor-lesson-payouts-seed-4.csv', null, '2026-10-05T13:00:00.000Z', 0, 0);

insert into public.group_enrollments (id, student_id, group_id, enrollment_type, status, payment_status, enrolled_at, created_at, plan_price_ttd, current_period_start, current_period_end, next_payment_due_at, expires_at, last_paid_at, billing_provider, cancelled_at, cancellation_reason, seat_type) values
  ('5eed0004-0000-4000-8000-000000000001', '5eed0002-0000-4000-8000-000000000001', '5eed0003-0000-4000-8000-000000000001', 'SUBSCRIPTION', 'ACTIVE', 'PAID', '2026-08-11T14:15:00.000Z', '2026-08-11T14:15:00.000Z', 200, '2026-09-11T14:15:00.000Z', '2026-10-11T14:15:00.000Z', '2026-10-11T14:15:00.000Z', '2026-10-11T14:15:00.000Z', '2026-09-11T14:15:00.000Z', 'stripe', null, null, 'online'),
  ('5eed0004-0000-4000-8000-000000000002', '5eed0002-0000-4000-8000-000000000002', '5eed0003-0000-4000-8000-000000000001', 'SUBSCRIPTION', 'ACTIVE', 'PAID', '2026-08-20T20:40:00.000Z', '2026-08-20T20:40:00.000Z', 200, '2026-09-20T20:40:00.000Z', '2026-10-20T20:40:00.000Z', '2026-10-20T20:40:00.000Z', '2026-10-20T20:40:00.000Z', '2026-09-20T20:40:00.000Z', 'stripe', null, null, 'online'),
  ('5eed0004-0000-4000-8000-000000000003', '5eed0002-0000-4000-8000-000000000003', '5eed0003-0000-4000-8000-000000000001', 'SUBSCRIPTION', 'ACTIVE', 'PAID', '2026-09-25T23:05:00.000Z', '2026-09-25T23:05:00.000Z', 200, '2026-09-25T23:05:00.000Z', '2026-10-25T23:05:00.000Z', '2026-10-25T23:05:00.000Z', '2026-10-25T23:05:00.000Z', '2026-09-25T23:05:00.000Z', 'stripe', null, null, 'online'),
  ('5eed0004-0000-4000-8000-000000000004', '5eed0002-0000-4000-8000-000000000004', '5eed0003-0000-4000-8000-000000000002', 'SUBSCRIPTION', 'ACTIVE', 'PAID', '2026-08-28T13:30:00.000Z', '2026-08-28T13:30:00.000Z', 250, '2026-09-28T13:30:00.000Z', '2026-10-28T13:30:00.000Z', '2026-10-28T13:30:00.000Z', '2026-10-28T13:30:00.000Z', '2026-09-28T13:30:00.000Z', 'stripe', null, null, 'online'),
  ('5eed0004-0000-4000-8000-000000000005', '5eed0002-0000-4000-8000-000000000005', '5eed0003-0000-4000-8000-000000000002', 'SUBSCRIPTION', 'ACTIVE', 'PAID', '2026-09-03T17:20:00.000Z', '2026-09-03T17:20:00.000Z', 250, '2026-10-03T17:20:00.000Z', '2026-11-03T17:20:00.000Z', '2026-11-03T17:20:00.000Z', '2026-11-03T17:20:00.000Z', '2026-10-03T17:20:00.000Z', 'stripe', null, null, 'online'),
  ('5eed0004-0000-4000-8000-000000000006', '5eed0002-0000-4000-8000-000000000006', '5eed0003-0000-4000-8000-000000000002', 'SUBSCRIPTION', 'CANCELLED', 'PAID', '2026-09-10T22:00:00.000Z', '2026-09-10T22:00:00.000Z', 250, '2026-09-10T22:00:00.000Z', '2026-10-10T22:00:00.000Z', null, '2026-10-10T22:00:00.000Z', '2026-09-10T22:00:00.000Z', 'stripe', '2026-09-30T16:00:00.000Z', 'Student left (seed)', 'online'),
  ('5eed0004-0000-4000-8000-000000000007', '5eed0002-0000-4000-8000-000000000007', '5eed0003-0000-4000-8000-000000000003', 'SUBSCRIPTION', 'ACTIVE', 'PAID', '2026-09-20T15:10:00.000Z', '2026-09-20T15:10:00.000Z', 180, '2026-09-20T15:10:00.000Z', '2026-10-20T15:10:00.000Z', '2026-10-20T15:10:00.000Z', '2026-10-20T15:10:00.000Z', '2026-09-20T15:10:00.000Z', 'stripe', null, null, 'online'),
  ('5eed0004-0000-4000-8000-000000000008', '5eed0002-0000-4000-8000-000000000008', '5eed0003-0000-4000-8000-000000000003', 'SUBSCRIPTION', 'CANCELLED', 'PAID', '2026-09-22T19:45:00.000Z', '2026-09-22T19:45:00.000Z', 180, '2026-09-22T19:45:00.000Z', '2026-10-22T19:45:00.000Z', null, '2026-10-22T19:45:00.000Z', '2026-09-22T19:45:00.000Z', 'stripe', '2026-10-01T14:00:00.000Z', null, 'online'),
  ('5eed0004-0000-4000-8000-000000000009', '5eed0002-0000-4000-8000-000000000001', '5eed0003-0000-4000-8000-000000000003', 'SUBSCRIPTION', 'ACTIVE', 'PAID', '2026-10-01T00:30:00.000Z', '2026-10-01T00:30:00.000Z', 180, '2026-10-01T00:30:00.000Z', '2026-11-01T00:30:00.000Z', '2026-11-01T00:30:00.000Z', '2026-11-01T00:30:00.000Z', '2026-10-01T00:30:00.000Z', 'stripe', null, null, 'online'),
  ('5eed0004-0000-4000-8000-000000000010', '5eed0002-0000-4000-8000-000000000009', '5eed0003-0000-4000-8000-000000000004', 'SUBSCRIPTION', 'ACTIVE', 'PAID', '2026-07-31T12:50:00.000Z', '2026-07-31T12:50:00.000Z', 220, '2026-09-30T22:30:00.000Z', '2026-10-30T22:30:00.000Z', '2026-10-30T22:30:00.000Z', '2026-10-30T22:30:00.000Z', '2026-09-30T22:30:00.000Z', 'stripe', null, null, 'online'),
  ('5eed0004-0000-4000-8000-000000000011', '5eed0002-0000-4000-8000-000000000010', '5eed0003-0000-4000-8000-000000000004', 'SUBSCRIPTION', 'ACTIVE', 'PAID', '2026-08-15T16:00:00.000Z', '2026-08-15T16:00:00.000Z', 220, '2026-09-15T16:00:00.000Z', '2026-10-15T16:00:00.000Z', '2026-10-15T16:00:00.000Z', '2026-10-15T16:00:00.000Z', '2026-09-15T16:00:00.000Z', 'stripe', null, null, 'online'),
  ('5eed0004-0000-4000-8000-000000000012', '5eed0002-0000-4000-8000-000000000011', '5eed0003-0000-4000-8000-000000000005', 'SUBSCRIPTION', 'ACTIVE', 'PAID', '2026-09-06T14:00:00.000Z', '2026-09-06T14:00:00.000Z', 160, '2026-09-06T14:00:00.000Z', '2026-10-06T14:00:00.000Z', '2026-10-06T14:00:00.000Z', '2026-10-06T14:00:00.000Z', '2026-09-06T14:00:00.000Z', 'stripe', null, null, 'online'),
  ('5eed0004-0000-4000-8000-000000000013', '5eed0002-0000-4000-8000-000000000012', '5eed0003-0000-4000-8000-000000000005', 'SUBSCRIPTION', 'ACTIVE', 'PAID', '2026-09-15T21:25:00.000Z', '2026-09-15T21:25:00.000Z', 160, '2026-09-15T21:25:00.000Z', '2026-10-15T21:25:00.000Z', '2026-10-15T21:25:00.000Z', '2026-10-15T21:25:00.000Z', '2026-09-15T21:25:00.000Z', 'stripe', null, null, 'online'),
  ('5eed0004-0000-4000-8000-000000000014', '5eed0002-0000-4000-8000-000000000004', '5eed0003-0000-4000-8000-000000000005', 'SUBSCRIPTION', 'ACTIVE', 'PAID', '2026-10-05T18:10:00.000Z', '2026-10-05T18:10:00.000Z', 160, '2026-10-05T18:10:00.000Z', '2026-11-05T18:10:00.000Z', '2026-11-05T18:10:00.000Z', '2026-11-05T18:10:00.000Z', '2026-10-05T18:10:00.000Z', 'stripe', null, null, 'online');

insert into public.subscription_payments (id, enrollment_id, group_id, student_id, type, amount_ttd, platform_fee_ttd, tutor_payout_ttd, charged_processing_fee_ttd, status, period_start, period_end, activation_status, paid_at, created_at, payment_method) values
  ('5eed0005-0000-4000-8000-000000000001', '5eed0004-0000-4000-8000-000000000001', '5eed0003-0000-4000-8000-000000000001', '5eed0002-0000-4000-8000-000000000001', 'subscription_initial', 200, 14, 186, 10.24, 'PAID', '2026-08-11T14:15:00.000Z', '2026-09-11T14:15:00.000Z', 'succeeded', '2026-08-11T14:15:00.000Z', '2026-08-11T14:15:00.000Z', 'card'),
  ('5eed0005-0000-4000-8000-000000000002', '5eed0004-0000-4000-8000-000000000001', '5eed0003-0000-4000-8000-000000000001', '5eed0002-0000-4000-8000-000000000001', 'subscription_renewal', 200, 14, 186, 10.24, 'PAID', '2026-09-11T14:15:00.000Z', '2026-10-11T14:15:00.000Z', 'succeeded', '2026-09-11T14:15:00.000Z', '2026-09-11T14:15:00.000Z', 'card'),
  ('5eed0005-0000-4000-8000-000000000003', '5eed0004-0000-4000-8000-000000000002', '5eed0003-0000-4000-8000-000000000001', '5eed0002-0000-4000-8000-000000000002', 'subscription_initial', 200, 14, 186, 10.24, 'PAID', '2026-08-20T20:40:00.000Z', '2026-09-20T20:40:00.000Z', 'succeeded', '2026-08-20T20:40:00.000Z', '2026-08-20T20:40:00.000Z', 'card'),
  ('5eed0005-0000-4000-8000-000000000004', '5eed0004-0000-4000-8000-000000000002', '5eed0003-0000-4000-8000-000000000001', '5eed0002-0000-4000-8000-000000000002', 'subscription_renewal', 200, 14, 186, 10.24, 'PAID', '2026-09-20T20:40:00.000Z', '2026-10-20T20:40:00.000Z', 'succeeded', '2026-09-20T20:40:00.000Z', '2026-09-20T20:40:00.000Z', 'card'),
  ('5eed0005-0000-4000-8000-000000000005', '5eed0004-0000-4000-8000-000000000003', '5eed0003-0000-4000-8000-000000000001', '5eed0002-0000-4000-8000-000000000003', 'subscription_initial', 200, 14, 186, 10.24, 'PAID', '2026-09-25T23:05:00.000Z', '2026-10-25T23:05:00.000Z', 'succeeded', '2026-09-25T23:05:00.000Z', '2026-09-25T23:05:00.000Z', 'card'),
  ('5eed0005-0000-4000-8000-000000000006', '5eed0004-0000-4000-8000-000000000004', '5eed0003-0000-4000-8000-000000000002', '5eed0002-0000-4000-8000-000000000004', 'subscription_initial', 250, 17.5, 232.5, 12.27, 'PAID', '2026-08-28T13:30:00.000Z', '2026-09-28T13:30:00.000Z', 'succeeded', '2026-08-28T13:30:00.000Z', '2026-08-28T13:30:00.000Z', 'card'),
  ('5eed0005-0000-4000-8000-000000000007', '5eed0004-0000-4000-8000-000000000004', '5eed0003-0000-4000-8000-000000000002', '5eed0002-0000-4000-8000-000000000004', 'subscription_renewal', 250, 17.5, 232.5, 12.27, 'PAID', '2026-09-28T13:30:00.000Z', '2026-10-28T13:30:00.000Z', 'succeeded', '2026-09-28T13:30:00.000Z', '2026-09-28T13:30:00.000Z', 'card'),
  ('5eed0005-0000-4000-8000-000000000008', '5eed0004-0000-4000-8000-000000000005', '5eed0003-0000-4000-8000-000000000002', '5eed0002-0000-4000-8000-000000000005', 'subscription_initial', 250, 17.5, 232.5, 12.27, 'PAID', '2026-09-03T17:20:00.000Z', '2026-10-03T17:20:00.000Z', 'succeeded', '2026-09-03T17:20:00.000Z', '2026-09-03T17:20:00.000Z', 'card'),
  ('5eed0005-0000-4000-8000-000000000009', '5eed0004-0000-4000-8000-000000000005', '5eed0003-0000-4000-8000-000000000002', '5eed0002-0000-4000-8000-000000000005', 'subscription_renewal', 250, 17.5, 232.5, 12.27, 'PAID', '2026-10-03T17:20:00.000Z', '2026-11-03T17:20:00.000Z', 'succeeded', '2026-10-03T17:20:00.000Z', '2026-10-03T17:20:00.000Z', 'card'),
  ('5eed0005-0000-4000-8000-000000000010', '5eed0004-0000-4000-8000-000000000006', '5eed0003-0000-4000-8000-000000000002', '5eed0002-0000-4000-8000-000000000006', 'subscription_initial', 250, 17.5, 232.5, 12.27, 'PAID', '2026-09-10T22:00:00.000Z', '2026-10-10T22:00:00.000Z', 'succeeded', '2026-09-10T22:00:00.000Z', '2026-09-10T22:00:00.000Z', 'card'),
  ('5eed0005-0000-4000-8000-000000000011', '5eed0004-0000-4000-8000-000000000007', '5eed0003-0000-4000-8000-000000000003', '5eed0002-0000-4000-8000-000000000007', 'subscription_initial', 180, 12.6, 167.4, 9.43, 'PAID', '2026-09-20T15:10:00.000Z', '2026-10-20T15:10:00.000Z', 'succeeded', '2026-09-20T15:10:00.000Z', '2026-09-20T15:10:00.000Z', 'card'),
  ('5eed0005-0000-4000-8000-000000000012', '5eed0004-0000-4000-8000-000000000008', '5eed0003-0000-4000-8000-000000000003', '5eed0002-0000-4000-8000-000000000008', 'subscription_initial', 180, 12.6, 167.4, 9.43, 'PAID', '2026-09-22T19:45:00.000Z', '2026-10-22T19:45:00.000Z', 'succeeded', '2026-09-22T19:45:00.000Z', '2026-09-22T19:45:00.000Z', 'card'),
  ('5eed0005-0000-4000-8000-000000000013', '5eed0004-0000-4000-8000-000000000009', '5eed0003-0000-4000-8000-000000000003', '5eed0002-0000-4000-8000-000000000001', 'subscription_initial', 180, 12.6, 167.4, 9.43, 'PAID', '2026-10-01T00:30:00.000Z', '2026-11-01T00:30:00.000Z', 'succeeded', '2026-10-01T00:30:00.000Z', '2026-10-01T00:30:00.000Z', 'card'),
  ('5eed0005-0000-4000-8000-000000000014', '5eed0004-0000-4000-8000-000000000010', '5eed0003-0000-4000-8000-000000000004', '5eed0002-0000-4000-8000-000000000009', 'subscription_initial', 220, 15.4, 204.6, 11.05, 'PAID', '2026-07-31T12:50:00.000Z', '2026-08-31T12:50:00.000Z', 'succeeded', '2026-07-31T12:50:00.000Z', '2026-07-31T12:50:00.000Z', 'card'),
  ('5eed0005-0000-4000-8000-000000000015', '5eed0004-0000-4000-8000-000000000010', '5eed0003-0000-4000-8000-000000000004', '5eed0002-0000-4000-8000-000000000009', 'subscription_renewal', 220, 15.4, 204.6, 11.05, 'PAID', '2026-08-31T12:50:00.000Z', '2026-09-30T12:50:00.000Z', 'succeeded', '2026-08-31T12:50:00.000Z', '2026-08-31T12:50:00.000Z', 'card'),
  ('5eed0005-0000-4000-8000-000000000016', '5eed0004-0000-4000-8000-000000000010', '5eed0003-0000-4000-8000-000000000004', '5eed0002-0000-4000-8000-000000000009', 'subscription_renewal', 220, 15.4, 204.6, 11.05, 'PAID', '2026-09-30T22:30:00.000Z', '2026-10-30T22:30:00.000Z', 'succeeded', '2026-09-30T22:30:00.000Z', '2026-09-30T22:30:00.000Z', 'card'),
  ('5eed0005-0000-4000-8000-000000000017', '5eed0004-0000-4000-8000-000000000011', '5eed0003-0000-4000-8000-000000000004', '5eed0002-0000-4000-8000-000000000010', 'subscription_initial', 220, 15.4, 204.6, 11.05, 'PAID', '2026-08-15T16:00:00.000Z', '2026-09-15T16:00:00.000Z', 'succeeded', '2026-08-15T16:00:00.000Z', '2026-08-15T16:00:00.000Z', 'card'),
  ('5eed0005-0000-4000-8000-000000000018', '5eed0004-0000-4000-8000-000000000011', '5eed0003-0000-4000-8000-000000000004', '5eed0002-0000-4000-8000-000000000010', 'subscription_renewal', 220, 15.4, 204.6, 11.05, 'PAID', '2026-09-15T16:00:00.000Z', '2026-10-15T16:00:00.000Z', 'succeeded', '2026-09-15T16:00:00.000Z', '2026-09-15T16:00:00.000Z', 'card'),
  ('5eed0005-0000-4000-8000-000000000019', '5eed0004-0000-4000-8000-000000000012', '5eed0003-0000-4000-8000-000000000005', '5eed0002-0000-4000-8000-000000000011', 'subscription_initial', 160, 11.2, 148.8, 8.62, 'PAID', '2026-09-06T14:00:00.000Z', '2026-10-06T14:00:00.000Z', 'succeeded', '2026-09-06T14:00:00.000Z', '2026-09-06T14:00:00.000Z', 'card'),
  ('5eed0005-0000-4000-8000-000000000020', '5eed0004-0000-4000-8000-000000000013', '5eed0003-0000-4000-8000-000000000005', '5eed0002-0000-4000-8000-000000000012', 'subscription_initial', 160, 11.2, 148.8, 8.62, 'PAID', '2026-09-15T21:25:00.000Z', '2026-10-15T21:25:00.000Z', 'succeeded', '2026-09-15T21:25:00.000Z', '2026-09-15T21:25:00.000Z', 'card'),
  ('5eed0005-0000-4000-8000-000000000021', '5eed0004-0000-4000-8000-000000000014', '5eed0003-0000-4000-8000-000000000005', '5eed0002-0000-4000-8000-000000000004', 'subscription_initial', 160, 11.2, 148.8, 8.62, 'PAID', '2026-10-05T18:10:00.000Z', '2026-11-05T18:10:00.000Z', 'succeeded', '2026-10-05T18:10:00.000Z', '2026-10-05T18:10:00.000Z', 'card');

update public.group_enrollments set activated_subscription_payment_id = '5eed0005-0000-4000-8000-000000000002' where id = '5eed0004-0000-4000-8000-000000000001';
update public.group_enrollments set activated_subscription_payment_id = '5eed0005-0000-4000-8000-000000000004' where id = '5eed0004-0000-4000-8000-000000000002';
update public.group_enrollments set activated_subscription_payment_id = '5eed0005-0000-4000-8000-000000000005' where id = '5eed0004-0000-4000-8000-000000000003';
update public.group_enrollments set activated_subscription_payment_id = '5eed0005-0000-4000-8000-000000000007' where id = '5eed0004-0000-4000-8000-000000000004';
update public.group_enrollments set activated_subscription_payment_id = '5eed0005-0000-4000-8000-000000000009' where id = '5eed0004-0000-4000-8000-000000000005';
update public.group_enrollments set activated_subscription_payment_id = '5eed0005-0000-4000-8000-000000000010' where id = '5eed0004-0000-4000-8000-000000000006';
update public.group_enrollments set activated_subscription_payment_id = '5eed0005-0000-4000-8000-000000000011' where id = '5eed0004-0000-4000-8000-000000000007';
update public.group_enrollments set activated_subscription_payment_id = '5eed0005-0000-4000-8000-000000000012' where id = '5eed0004-0000-4000-8000-000000000008';
update public.group_enrollments set activated_subscription_payment_id = '5eed0005-0000-4000-8000-000000000013' where id = '5eed0004-0000-4000-8000-000000000009';
update public.group_enrollments set activated_subscription_payment_id = '5eed0005-0000-4000-8000-000000000016' where id = '5eed0004-0000-4000-8000-000000000010';
update public.group_enrollments set activated_subscription_payment_id = '5eed0005-0000-4000-8000-000000000018' where id = '5eed0004-0000-4000-8000-000000000011';
update public.group_enrollments set activated_subscription_payment_id = '5eed0005-0000-4000-8000-000000000019' where id = '5eed0004-0000-4000-8000-000000000012';
update public.group_enrollments set activated_subscription_payment_id = '5eed0005-0000-4000-8000-000000000020' where id = '5eed0004-0000-4000-8000-000000000013';
update public.group_enrollments set activated_subscription_payment_id = '5eed0005-0000-4000-8000-000000000021' where id = '5eed0004-0000-4000-8000-000000000014';

insert into public.payout_ledger (id, tutor_id, amount_ttd, status, subscription_payment_id, batch_id, released_at, created_at) values
  ('5eed0006-0000-4000-8000-000000000001', '5eed0001-0000-4000-8000-000000000001', 186, 'released', '5eed0005-0000-4000-8000-000000000001', '5eed0007-0000-4000-8000-000000000001', '2026-09-12T19:00:00.000Z', '2026-08-11T14:15:00.000Z'),
  ('5eed0006-0000-4000-8000-000000000002', '5eed0001-0000-4000-8000-000000000001', 186, 'release_ready', '5eed0005-0000-4000-8000-000000000002', null, null, '2026-09-11T14:15:00.000Z'),
  ('5eed0006-0000-4000-8000-000000000003', '5eed0001-0000-4000-8000-000000000001', 186, 'released', '5eed0005-0000-4000-8000-000000000003', '5eed0007-0000-4000-8000-000000000001', '2026-09-12T19:00:00.000Z', '2026-08-20T20:40:00.000Z'),
  ('5eed0006-0000-4000-8000-000000000004', '5eed0001-0000-4000-8000-000000000001', 186, 'release_ready', '5eed0005-0000-4000-8000-000000000004', null, null, '2026-09-20T20:40:00.000Z'),
  ('5eed0006-0000-4000-8000-000000000005', '5eed0001-0000-4000-8000-000000000001', 186, 'release_ready', '5eed0005-0000-4000-8000-000000000005', null, null, '2026-09-25T23:05:00.000Z'),
  ('5eed0006-0000-4000-8000-000000000006', '5eed0001-0000-4000-8000-000000000002', 232.5, 'release_ready', '5eed0005-0000-4000-8000-000000000006', null, null, '2026-08-28T13:30:00.000Z'),
  ('5eed0006-0000-4000-8000-000000000007', '5eed0001-0000-4000-8000-000000000002', 232.5, 'release_ready', '5eed0005-0000-4000-8000-000000000007', null, null, '2026-09-28T13:30:00.000Z'),
  ('5eed0006-0000-4000-8000-000000000008', '5eed0001-0000-4000-8000-000000000002', 232.5, 'release_ready', '5eed0005-0000-4000-8000-000000000008', null, null, '2026-09-03T17:20:00.000Z'),
  ('5eed0006-0000-4000-8000-000000000009', '5eed0001-0000-4000-8000-000000000002', 232.5, 'owed', '5eed0005-0000-4000-8000-000000000009', null, null, '2026-10-03T17:20:00.000Z'),
  ('5eed0006-0000-4000-8000-000000000010', '5eed0001-0000-4000-8000-000000000002', 232.5, 'release_ready', '5eed0005-0000-4000-8000-000000000010', null, null, '2026-09-10T22:00:00.000Z'),
  ('5eed0006-0000-4000-8000-000000000011', '5eed0001-0000-4000-8000-000000000003', 167.4, 'release_ready', '5eed0005-0000-4000-8000-000000000011', null, null, '2026-09-20T15:10:00.000Z'),
  ('5eed0006-0000-4000-8000-000000000012', '5eed0001-0000-4000-8000-000000000003', 167.4, 'release_ready', '5eed0005-0000-4000-8000-000000000012', null, null, '2026-09-22T19:45:00.000Z'),
  ('5eed0006-0000-4000-8000-000000000013', '5eed0001-0000-4000-8000-000000000003', 167.4, 'release_ready', '5eed0005-0000-4000-8000-000000000013', null, null, '2026-10-01T00:30:00.000Z'),
  ('5eed0006-0000-4000-8000-000000000014', '5eed0001-0000-4000-8000-000000000004', 204.6, 'released', '5eed0005-0000-4000-8000-000000000014', '5eed0007-0000-4000-8000-000000000002', '2026-08-31T18:00:00.000Z', '2026-07-31T12:50:00.000Z'),
  ('5eed0006-0000-4000-8000-000000000015', '5eed0001-0000-4000-8000-000000000004', 204.6, 'released', '5eed0005-0000-4000-8000-000000000015', '5eed0007-0000-4000-8000-000000000003', '2026-09-30T19:00:00.000Z', '2026-08-31T12:50:00.000Z'),
  ('5eed0006-0000-4000-8000-000000000016', '5eed0001-0000-4000-8000-000000000004', 204.6, 'release_ready', '5eed0005-0000-4000-8000-000000000016', null, null, '2026-09-30T22:30:00.000Z'),
  ('5eed0006-0000-4000-8000-000000000017', '5eed0001-0000-4000-8000-000000000004', 204.6, 'released', '5eed0005-0000-4000-8000-000000000017', '5eed0007-0000-4000-8000-000000000002', '2026-08-31T18:00:00.000Z', '2026-08-15T16:00:00.000Z'),
  ('5eed0006-0000-4000-8000-000000000018', '5eed0001-0000-4000-8000-000000000004', 204.6, 'released', '5eed0005-0000-4000-8000-000000000018', '5eed0007-0000-4000-8000-000000000003', '2026-09-30T19:00:00.000Z', '2026-09-15T16:00:00.000Z'),
  ('5eed0006-0000-4000-8000-000000000019', '5eed0001-0000-4000-8000-000000000005', 148.8, 'release_ready', '5eed0005-0000-4000-8000-000000000019', '5eed0007-0000-4000-8000-000000000004', null, '2026-09-06T14:00:00.000Z'),
  ('5eed0006-0000-4000-8000-000000000020', '5eed0001-0000-4000-8000-000000000005', 148.8, 'release_ready', '5eed0005-0000-4000-8000-000000000020', '5eed0007-0000-4000-8000-000000000004', null, '2026-09-15T21:25:00.000Z'),
  ('5eed0006-0000-4000-8000-000000000021', '5eed0001-0000-4000-8000-000000000005', 148.8, 'owed', '5eed0005-0000-4000-8000-000000000021', null, null, '2026-10-05T18:10:00.000Z');

insert into public.group_removals (id, group_id, enrollment_id, student_id, tutor_id, with_cause, reason_category, explanation, status, refund_issued, refund_amount_ttd, created_at) values
  ('5eed0008-0000-4000-8000-000000000001', '5eed0003-0000-4000-8000-000000000003', '5eed0004-0000-4000-8000-000000000008', '5eed0002-0000-4000-8000-000000000008', '5eed0001-0000-4000-8000-000000000003', false, 'no_cause', 'Seed: student removed, refund requested — awaiting admin action.', 'approved', false, 180, '2026-10-01T14:00:00.000Z');

update public.payout_batches set total_amount_ttd = 372, line_count = 1, csv_body = 'tutor_id,name,bank_name,branch,account_number,account_type,amount_ttd,reference
5eed0001-0000-4000-8000-000000000001,Aaliyah Mohammed,Republic Bank,Port of Spain,100045674821,savings,372.00,ITUTOR-5eed0007
' where id = '5eed0007-0000-4000-8000-000000000001';

update public.payout_batches set total_amount_ttd = 409.2, line_count = 1, csv_body = 'tutor_id,name,bank_name,branch,account_number,account_type,amount_ttd,reference
5eed0001-0000-4000-8000-000000000004,Kevin Ali,RBC Royal Bank,Arima,330045126610,chequing,409.20,ITUTOR-5eed0007
' where id = '5eed0007-0000-4000-8000-000000000002';

update public.payout_batches set total_amount_ttd = 409.2, line_count = 1, csv_body = 'tutor_id,name,bank_name,branch,account_number,account_type,amount_ttd,reference
5eed0001-0000-4000-8000-000000000004,Kevin Ali,RBC Royal Bank,Arima,330045126610,chequing,409.20,ITUTOR-5eed0007
' where id = '5eed0007-0000-4000-8000-000000000003';

update public.payout_batches set total_amount_ttd = 297.6, line_count = 1, csv_body = 'tutor_id,name,bank_name,branch,account_number,account_type,amount_ttd,reference
5eed0001-0000-4000-8000-000000000005,Shanice Charles,Republic Bank,San Fernando,100088120334,savings,297.60,ITUTOR-5eed0007
' where id = '5eed0007-0000-4000-8000-000000000004';

insert into public.tutor_balances (tutor_id, pending_ttd, available_ttd, last_updated) values
  ('5eed0001-0000-4000-8000-000000000001', 0, 558, now()),
  ('5eed0001-0000-4000-8000-000000000002', 232.5, 930, now()),
  ('5eed0001-0000-4000-8000-000000000003', 0, 502.2, now()),
  ('5eed0001-0000-4000-8000-000000000004', 0, 204.6, now()),
  ('5eed0001-0000-4000-8000-000000000005', 148.8, 297.6, now())
on conflict (tutor_id) do update set pending_ttd = excluded.pending_ttd, available_ttd = excluded.available_ttd, last_updated = now();

-- If migration 266 is applied, give the seed tutors their schedules exactly as
-- the backfill would (first payment anchors; next = first cycle after the
-- last confirmed lesson payout).
do $$
begin
  if to_regclass('public.tutor_payout_schedules') is null then return; end if;
  insert into public.tutor_payout_schedules (tutor_id, payout_day, anchor_date, first_paid_at, first_subscription_payment_id, next_payout_on, last_paid_at, last_paid_cycle_on, last_paid_batch_id, last_paid_by)
  select f.tutor_id, extract(day from f.anchor)::int, f.anchor, f.paid_at, f.sp_id,
         case when r.last_released is null then public.payout_cycle_date(f.anchor, 1)
              else public.payout_next_cycle_after(f.anchor, greatest(f.anchor, (r.last_released at time zone 'America/Port_of_Spain')::date)) end,
         r.last_released,
         case when r.last_released is null then null
              else public.payout_cycle_date(f.anchor, public.payout_cycle_index_after(f.anchor, greatest(f.anchor, (r.last_released at time zone 'America/Port_of_Spain')::date)) - 1) end,
         r.batch_id, 'fa0a6d61-d9d4-4287-a32c-c81021d0ab8b'::uuid
    from (select distinct on (pl.tutor_id) pl.tutor_id, sp.id sp_id, sp.paid_at,
                 (sp.paid_at at time zone 'America/Port_of_Spain')::date anchor
            from public.payout_ledger pl join public.subscription_payments sp on sp.id = pl.subscription_payment_id
           where pl.tutor_id::text like '5eed0001-%' order by pl.tutor_id, sp.paid_at) f
    left join (select distinct on (tutor_id) tutor_id, released_at last_released, batch_id
                 from public.payout_ledger where tutor_id::text like '5eed0001-%' and status = 'released'
                order by tutor_id, released_at desc) r on r.tutor_id = f.tutor_id
  on conflict (tutor_id) do nothing;
end $$;

commit;
