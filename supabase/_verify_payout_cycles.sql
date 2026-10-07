-- =====================================================================
-- VERIFY MIGRATION 266 — tutor payout cycles (database half of the tests)
--
-- Paste into the SQL editor of a database where 266 is applied and run.
-- EVERYTHING IS ROLLED BACK: the block always ends by raising, so nothing
-- it does is ever saved. Read the result from the error message:
--
--   "ALL PAYOUT CYCLE CHECKS PASSED (rolled back) ..."  → good
--   "CHECK FAILED: ..."                                 → that check broke
--
-- What it proves, on real rows:
--   * cycle arithmetic (anchoring, month-end clamping, early payment)
--   * payout_day cannot be changed once set
--   * creating a batch (what "Generate CSV" does) marks NOTHING paid and
--     does not move the tutor's payout date
--   * confirming the batch releases the rows, records who confirmed, and
--     moves the tutor to their next cycle
--   * a second confirmation of the same batch is refused
--   * the same payments cannot be put into a second batch
--
-- Needs one tutor with at least one unpaid, unbatched lesson ledger row and
-- a schedule row. If none exists it says so and stops (still rolled back).
-- =====================================================================

do $$
declare
  v_tutor      uuid;
  v_admin      uuid;
  v_ids        uuid[];
  v_before     record;
  v_after      record;
  v_rpc        jsonb;
  v_batch      uuid;
  v_today      date := (now() at time zone 'America/Port_of_Spain')::date;
  v_n          int;
  v_ok         boolean;
  v_msg        text;
begin
  -- ── 1. Cycle arithmetic ─────────────────────────────────────────────
  if public.payout_cycle_date('2026-01-09', 1) <> '2026-02-09' then
    raise exception 'CHECK FAILED: Jan 9 anchor, first payout should be Feb 9';
  end if;
  -- A Jan 20 payment is not a new anchor; the next cycle after Jan 20 is still Feb 9.
  if public.payout_next_cycle_after('2026-01-09', '2026-01-20') <> '2026-02-09' then
    raise exception 'CHECK FAILED: Jan 20 payment should be paid Feb 9';
  end if;
  if public.payout_cycle_date('2026-01-31', 1) <> '2026-02-28'
     or public.payout_cycle_date('2026-01-31', 2) <> '2026-03-31'
     or public.payout_cycle_date('2026-01-31', 3) <> '2026-04-30'
     or public.payout_cycle_date('2027-01-31', 13) <> '2028-02-29' then
    raise exception 'CHECK FAILED: month-end clamping';
  end if;
  -- Early: due Mar 9, paid Feb 20 → next is Apr 9.
  if public.payout_next_cycle_after('2026-01-09', greatest('2026-02-20'::date, '2026-03-09'::date)) <> '2026-04-09' then
    raise exception 'CHECK FAILED: early payment should consume the Mar 9 cycle';
  end if;

  -- ── 2. Pick a tutor with something owed ─────────────────────────────
  select pl.tutor_id into v_tutor
    from public.payout_ledger pl
    join public.tutor_payout_schedules s on s.tutor_id = pl.tutor_id
   where pl.subscription_payment_id is not null
     and pl.status in ('owed', 'release_ready')
     and pl.batch_id is null
   limit 1;
  if v_tutor is null then
    raise exception 'NO FIXTURE: no tutor has an unpaid, unbatched lesson payout. Cycle arithmetic checks passed (rolled back).';
  end if;

  select id into v_admin from public.profiles where role = 'admin' limit 1;

  select array_agg(id) into v_ids
    from public.payout_ledger
   where tutor_id = v_tutor and subscription_payment_id is not null
     and status in ('owed', 'release_ready') and batch_id is null;

  select * into v_before from public.tutor_payout_schedules where tutor_id = v_tutor;

  -- ── 3. payout_day is immutable ──────────────────────────────────────
  v_ok := false;
  begin
    update public.tutor_payout_schedules
       set payout_day = case when payout_day = 1 then 2 else 1 end,
           anchor_date = anchor_date + 1
     where tutor_id = v_tutor;
  exception when others then
    v_ok := sqlerrm like '%payout_day_immutable%';
  end;
  if not v_ok then
    raise exception 'CHECK FAILED: changing payout_day should be refused';
  end if;

  -- ── 4. Generate CSV = create a batch. Nothing is paid. ──────────────
  -- Same steps as lib/payouts/createPayoutBatch.ts.
  update public.tutor_balances tb
     set available_ttd = available_ttd + x.amt,
         pending_ttd   = greatest(0, pending_ttd - x.amt)
    from (select coalesce(sum(amount_ttd), 0) as amt
            from public.payout_ledger where id = any(v_ids) and status = 'owed') x
   where tb.tutor_id = v_tutor;
  update public.payout_ledger set status = 'release_ready' where id = any(v_ids) and status = 'owed';
  v_rpc := public.create_payout_batch_atomic(v_admin, 0, 1, 'verify.csv', v_ids);
  v_batch := (v_rpc->>'batch_id')::uuid;
  update public.payout_batches set csv_body = 'x', csv_generated_at = now(), batch_type = 'lesson' where id = v_batch;

  if exists (select 1 from public.payout_ledger where id = any(v_ids) and status = 'released') then
    raise exception 'CHECK FAILED: generating a batch released (paid) ledger rows';
  end if;
  if exists (select 1 from public.payout_batches where id = v_batch and (status = 'paid' or paid_at is not null)) then
    raise exception 'CHECK FAILED: a freshly generated batch is marked paid';
  end if;
  select * into v_after from public.tutor_payout_schedules where tutor_id = v_tutor;
  if v_after.next_payout_on <> v_before.next_payout_on or v_after.last_paid_at is distinct from v_before.last_paid_at then
    raise exception 'CHECK FAILED: generating a batch moved the payout date';
  end if;

  -- Re-downloading / re-generating can't double-stamp the same rows.
  v_ok := false;
  begin
    perform public.create_payout_batch_atomic(v_admin, 0, 1, 'verify-2.csv', v_ids);
  exception when others then
    v_ok := sqlerrm like '%no_eligible_lines%';
  end;
  if not v_ok then
    raise exception 'CHECK FAILED: rows already in a batch were accepted into a second batch';
  end if;

  -- ── 5. Confirm payout ───────────────────────────────────────────────
  v_rpc := public.mark_payout_batch_paid(v_batch, v_admin);

  if exists (select 1 from public.payout_ledger where id = any(v_ids) and status <> 'released') then
    raise exception 'CHECK FAILED: confirmed batch left rows unreleased';
  end if;
  if not exists (select 1 from public.payout_batches
                  where id = v_batch and status = 'paid' and paid_at is not null
                    and paid_by is not distinct from v_admin) then
    raise exception 'CHECK FAILED: batch not stamped paid with paid_by';
  end if;

  select * into v_after from public.tutor_payout_schedules where tutor_id = v_tutor;
  v_n := public.payout_cycle_index_after(v_before.anchor_date, greatest(v_today, v_before.next_payout_on));
  if v_after.next_payout_on <> public.payout_cycle_date(v_before.anchor_date, v_n)
     or v_after.last_paid_cycle_on <> public.payout_cycle_date(v_before.anchor_date, v_n - 1)
     or v_after.last_paid_batch_id <> v_batch
     or v_after.payout_day <> v_before.payout_day then
    raise exception 'CHECK FAILED: schedule after confirm: next %, cycle %, expected next %',
      v_after.next_payout_on, v_after.last_paid_cycle_on, public.payout_cycle_date(v_before.anchor_date, v_n);
  end if;
  if v_after.next_payout_on <= v_today then
    raise exception 'CHECK FAILED: next payout % is not in the future', v_after.next_payout_on;
  end if;

  -- ── 6. Double payment ───────────────────────────────────────────────
  v_ok := false;
  begin
    perform public.mark_payout_batch_paid(v_batch, v_admin);
  exception when others then
    v_ok := sqlerrm like '%already_paid%';
  end;
  if not v_ok then
    raise exception 'CHECK FAILED: the same batch was confirmed paid twice';
  end if;

  v_ok := false;
  begin
    perform public.create_payout_batch_atomic(v_admin, 0, 1, 'verify-3.csv', v_ids);
  exception when others then
    v_ok := sqlerrm like '%no_eligible_lines%';
  end;
  if not v_ok then
    raise exception 'CHECK FAILED: paid rows were accepted into a new batch';
  end if;

  v_msg := format('ALL PAYOUT CYCLE CHECKS PASSED (rolled back). Tutor %s: day %s, next %s -> %s, %s rows.',
                  v_tutor, v_before.payout_day, v_before.next_payout_on, v_after.next_payout_on,
                  array_length(v_ids, 1));
  raise exception '%', v_msg;
end $$;
