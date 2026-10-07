-- =====================================================================
-- Removes everything supabase/_seed_staging_teacher_payouts.sql created
-- (every id starting 5eed, plus the seed exchange rate), and any payout
-- batch generated from seed rows while testing. Staging only.
-- =====================================================================
begin;

-- Batches made while testing that contain seed rows (they hold nothing else
-- when only seed tutors were ticked; a mixed batch is reported, not deleted).
create temp table _seed_batches on commit drop as
  select distinct batch_id as id from public.payout_ledger
   where tutor_id::text like '5eed0001-%' and batch_id is not null;

do $$
begin
  if exists (select 1 from public.payout_ledger pl join _seed_batches b on b.id = pl.batch_id
              where pl.tutor_id::text not like '5eed0001-%') then
    raise exception 'A batch mixes seed and real tutors — cancel it in the app first, then re-run.';
  end if;
  if to_regclass('public.tutor_payout_schedules') is not null then
    execute $q$delete from public.tutor_payout_schedules where tutor_id::text like '5eed0001-%'$q$;
  end if;
end $$;

delete from public.tutor_deductions where tutor_id::text like '5eed0001-%';
delete from public.group_removals where id::text like '5eed%' or tutor_id::text like '5eed0001-%';
delete from public.payout_ledger where tutor_id::text like '5eed0001-%';
update public.group_enrollments set activated_subscription_payment_id = null where id::text like '5eed%';
delete from public.subscription_payments where id::text like '5eed%' or group_id::text like '5eed0003-%';
delete from public.group_enrollments where id::text like '5eed%' or group_id::text like '5eed0003-%';
delete from public.payout_batches where id::text like '5eed%' or id in (select id from _seed_batches);
delete from public.groups where id::text like '5eed%';
delete from public.tutor_payout_accounts where tutor_id::text like '5eed0001-%';
delete from public.tutor_balances where tutor_id::text like '5eed0001-%';
delete from public.onboarding_email_queue where user_id::text like '5eed%';
delete from public.profiles where id::text like '5eed%';
delete from public.fx_rates where source = 'seed';

commit;
