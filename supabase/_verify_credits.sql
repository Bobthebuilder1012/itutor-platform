-- =====================================================================
-- VERIFY MIGRATION 268 — credit wallets, ledger and referral rewards
--
-- Paste into the SQL editor of a database where 268 is applied and run.
-- EVERYTHING IS ROLLED BACK: the block always ends by raising, so nothing
-- it does is ever saved (the pg_temp helper dies with the session). Read the
-- result from the error message:
--
--   "ALL CREDIT CHECKS PASSED (rolled back) ..."  → good
--   "CHECK FAILED: ..."                           → that check broke
--
-- What it proves:
--   * every function is idempotent on its key; a released reservation key
--     cannot be revived
--   * a reservation beyond the balance is refused
--   * lots are spent soonest-expiry first, then oldest
--   * release and restore put money back into the SAME lots
--   * a clawback during the hold voids the grant; after spending it records a
--     shortfall and never drives the balance negative; refunding the spend
--     then clears that shortfall
--   * 7 converted friends at a threshold of 3 = 2 rewards, 1 carried over
--   * a refunded friend claws the reward back and re-forms it from the pool
--   * holds mature, lots expire, admin adjustments need a reason
--   * after every step the wallet equals the sum of its ledger
--
-- Needs 9 profiles (any role) to borrow as wallet owners and friends.
-- =====================================================================

create or replace function pg_temp.credit_wallet_drift(p_user uuid)
returns text
language sql
as $$
  select case
    when w.available_ttd is distinct from l.available
      or w.pending_ttd   is distinct from l.pending
      or w.reserved_ttd  is distinct from l.reserved
    then format('wallet %s/%s/%s but ledger %s/%s/%s (available/pending/reserved)',
                w.available_ttd, w.pending_ttd, w.reserved_ttd, l.available, l.pending, l.reserved)
  end
  from (select coalesce(available_ttd, 0) available_ttd, coalesce(pending_ttd, 0) pending_ttd,
               coalesce(reserved_ttd, 0) reserved_ttd
          from (select 1) one left join public.credit_wallets on user_id = p_user) w,
       (select
          coalesce(sum(remaining_ttd) filter (where kind = 'grant' and state = 'available'
                     and (expires_at is null or expires_at > now())), 0)::numeric(12,2) available,
          coalesce(sum(remaining_ttd) filter (where kind = 'grant' and state = 'pending'), 0)::numeric(12,2) pending,
          coalesce(sum(-amount_ttd) filter (where kind = 'spend' and state = 'reserved'), 0)::numeric(12,2) reserved
        from public.credit_ledger where user_id = p_user) l;
$$;

do $$
declare
  v_users   uuid[];
  u1        uuid;
  u2        uuid;
  v_friends uuid[];
  g1        uuid;
  g2        uuid;
  g3        uuid;
  g4        uuid;
  h1        uuid;
  s1        uuid;
  s2        uuid;
  s3        uuid;
  v_id      uuid;
  v_txt     text;
  v_num     numeric;
  v_int     int;
  v_ok      boolean;
  v_json    jsonb;
  v_drift   text;
  i         int;
begin
  select array_agg(id) into v_users
    from (select id from public.profiles order by created_at limit 9) p;
  if coalesce(array_length(v_users, 1), 0) < 9 then
    raise exception 'NO FIXTURE: needs 9 profiles (rolled back)';
  end if;
  u1 := v_users[1];
  u2 := v_users[2];
  v_friends := v_users[3:9];

  -- Start from a known state for the borrowed accounts (rolled back anyway).
  delete from public.referrals where referrer_id = any (v_users) or referee_id = any (v_users);
  update public.subscription_payments set credit_spend_id = null
   where credit_spend_id in (select id from public.credit_ledger where user_id = any (v_users));
  delete from public.credit_ledger where user_id = any (v_users);
  delete from public.credit_wallets where user_id = any (v_users);
  update public.profiles set is_suspended = false where id = any (v_users);

  -- ── 1. Grants and replay ────────────────────────────────────────────
  g1 := public.grant_credits(u1, 100, 'admin', null, 0, null, 'verify:g1', 'no expiry');
  v_id := public.grant_credits(u1, 100, 'admin', null, 0, null, 'verify:g1', 'no expiry');
  if v_id <> g1 then
    raise exception 'CHECK FAILED: grant replay created a second lot';
  end if;
  g2 := public.grant_credits(u1, 50, 'admin', null, 0, now() + interval '1 day', 'verify:g2');
  g3 := public.grant_credits(u1, 30, 'admin', null, 0, now() + interval '10 days', 'verify:g3');
  if (select available_ttd from public.credit_wallets where user_id = u1) <> 180 then
    raise exception 'CHECK FAILED: wallet after grants is not 180';
  end if;

  -- ── 2. Reserve: lot order, replay, overdraw ────────────────────────
  s1 := public.reserve_credits(u1, 60, 'verify:s1', '{"scenario":"C"}');
  select allocations into v_json from public.credit_ledger where id = s1;
  if v_json->0->>'grant_id' <> g2::text or (v_json->0->>'amount')::numeric <> 50
     or v_json->1->>'grant_id' <> g3::text or (v_json->1->>'amount')::numeric <> 10 then
    raise exception 'CHECK FAILED: lots not spent soonest-expiry first: %', v_json;
  end if;
  if public.reserve_credits(u1, 60, 'verify:s1') <> s1 then
    raise exception 'CHECK FAILED: reserve replay created a second spend';
  end if;

  v_ok := false;
  begin
    perform public.reserve_credits(u1, 1000, 'verify:too-much');
  exception when others then
    v_ok := sqlerrm like 'insufficient_credits:%';
  end;
  if not v_ok then
    raise exception 'CHECK FAILED: a reservation beyond the balance was accepted';
  end if;

  v_drift := pg_temp.credit_wallet_drift(u1);
  if v_drift is not null then raise exception 'CHECK FAILED after reserve: %', v_drift; end if;

  -- ── 3. Release returns to the same lots; the key cannot be revived ──
  if public.release_credits(s1) <> 'released' then
    raise exception 'CHECK FAILED: release did not release';
  end if;
  if public.release_credits(s1) <> 'released' then
    raise exception 'CHECK FAILED: second release changed state';
  end if;
  if (select remaining_ttd from public.credit_ledger where id = g2) <> 50
     or (select remaining_ttd from public.credit_ledger where id = g3) <> 30 then
    raise exception 'CHECK FAILED: release did not refill the original lots';
  end if;

  v_ok := false;
  begin
    perform public.reserve_credits(u1, 60, 'verify:s1');
  exception when others then
    v_ok := sqlerrm like 'key_released:%';
  end;
  if not v_ok then
    raise exception 'CHECK FAILED: a released reservation key was revived';
  end if;

  -- ── 4. Commit, restore ──────────────────────────────────────────────
  s2 := public.reserve_credits(u1, 70, 'verify:s2', '{"scenario":"B"}');
  if public.commit_credits(s2) <> 'committed' then
    raise exception 'CHECK FAILED: commit did not commit';
  end if;
  if public.commit_credits(s2) <> 'already' then
    raise exception 'CHECK FAILED: second commit was not a no-op';
  end if;
  if public.release_credits(s2) <> 'settled' then
    raise exception 'CHECK FAILED: a settled spend was released';
  end if;
  if (select available_ttd from public.credit_wallets where user_id = u1) <> 110 then
    raise exception 'CHECK FAILED: wallet after commit is not 110';
  end if;

  if public.restore_credits(s2, 'verify:r2') <> 'restored' then
    raise exception 'CHECK FAILED: restore did not restore';
  end if;
  if public.restore_credits(s2, 'verify:r2-again') <> 'already' then
    raise exception 'CHECK FAILED: a spend was restored twice';
  end if;
  if (select available_ttd from public.credit_wallets where user_id = u1) <> 180 then
    raise exception 'CHECK FAILED: wallet after restore is not 180';
  end if;

  -- A late payment after a release takes the credits again.
  s3 := public.reserve_credits(u1, 20, 'verify:s3');
  perform public.release_credits(s3);
  if public.commit_credits(s3) <> 'recovered' then
    raise exception 'CHECK FAILED: commit after release did not recover';
  end if;
  if (select available_ttd from public.credit_wallets where user_id = u1) <> 160 then
    raise exception 'CHECK FAILED: wallet after recovered commit is not 160';
  end if;

  v_drift := pg_temp.credit_wallet_drift(u1);
  if v_drift is not null then raise exception 'CHECK FAILED after commit/restore: %', v_drift; end if;

  -- ── 5. Clawback ─────────────────────────────────────────────────────
  -- During the hold: voided in full.
  g4 := public.grant_credits(u1, 40, 'referral', null, 7, null, 'verify:g4');
  if (select pending_ttd from public.credit_wallets where user_id = u1) <> 40 then
    raise exception 'CHECK FAILED: held grant is not pending';
  end if;
  v_id := public.clawback_grant(g4, 'verify:c4');
  if (select state from public.credit_ledger where id = g4) <> 'void'
     or (select shortfall_ttd from public.credit_ledger where id = v_id) <> 0
     or (select pending_ttd from public.credit_wallets where user_id = u1) <> 0 then
    raise exception 'CHECK FAILED: clawback during the hold did not void the grant';
  end if;
  if public.clawback_grant(g4, 'verify:c4-again') <> v_id then
    raise exception 'CHECK FAILED: a grant was clawed back twice';
  end if;

  -- After spending: shortfall, never negative; refunding the spend clears it.
  h1 := public.grant_credits(u2, 100, 'referral', null, 0, null, 'verify:h1');
  s3 := public.reserve_credits(u2, 80, 'verify:u2-s');
  perform public.commit_credits(s3);
  v_id := public.clawback_grant(h1, 'verify:ch1');
  if (select shortfall_ttd from public.credit_ledger where id = v_id) <> 80
     or (select available_ttd from public.credit_wallets where user_id = u2) <> 0 then
    raise exception 'CHECK FAILED: clawback after spending did not record an 80 shortfall at a zero balance';
  end if;
  perform public.restore_credits(s3, 'verify:u2-r');
  if (select shortfall_ttd from public.credit_ledger where id = v_id) <> 0
     or (select available_ttd from public.credit_wallets where user_id = u2) <> 0 then
    raise exception 'CHECK FAILED: refunding a spend from a clawed-back lot did not clear the shortfall';
  end if;
  v_drift := pg_temp.credit_wallet_drift(u2);
  if v_drift is not null then raise exception 'CHECK FAILED after clawback: %', v_drift; end if;

  -- ── 6. Holds mature, lots expire ───────────────────────────────────
  v_id := public.grant_credits(u2, 25, 'admin', null, 3, null, 'verify:hold');
  update public.credit_ledger set available_at = now() - interval '1 minute' where id = v_id;
  perform public.mature_credit_holds();
  if (select state from public.credit_ledger where id = v_id) <> 'available'
     or (select available_ttd from public.credit_wallets where user_id = u2) <> 25 then
    raise exception 'CHECK FAILED: a matured hold did not become available';
  end if;

  update public.credit_ledger set expires_at = now() - interval '1 minute' where id = v_id;
  perform public.expire_credits();
  if (select remaining_ttd from public.credit_ledger where id = v_id) <> 0
     or (select available_ttd from public.credit_wallets where user_id = u2) <> 0
     or not exists (select 1 from public.credit_ledger where kind = 'expiry' and related_id = v_id) then
    raise exception 'CHECK FAILED: an expired lot was not expired';
  end if;
  v_drift := pg_temp.credit_wallet_drift(u2);
  if v_drift is not null then raise exception 'CHECK FAILED after expiry: %', v_drift; end if;

  -- ── 7. Admin adjustments ────────────────────────────────────────────
  v_ok := false;
  begin
    perform public.adjust_credits(u2, 10, 'short', u1, 'verify:adj-short');
  exception when others then
    v_ok := sqlerrm like 'reason_required:%';
  end;
  if not v_ok then raise exception 'CHECK FAILED: an adjustment without a reason was accepted'; end if;

  v_ok := false;
  begin
    perform public.adjust_credits(u2, -10, 'remove ten dollars please', u1, 'verify:adj-neg');
  exception when others then
    v_ok := sqlerrm like 'insufficient_credits:%';
  end;
  if not v_ok then raise exception 'CHECK FAILED: a removal beyond the balance was accepted'; end if;

  perform public.adjust_credits(u2, 15, 'goodwill credit for test', u1, 'verify:adj-pos');
  perform public.adjust_credits(u2, -5, 'partial removal for test', u1, 'verify:adj-neg2');
  if (select available_ttd from public.credit_wallets where user_id = u2) <> 10 then
    raise exception 'CHECK FAILED: adjustments did not net to 10';
  end if;

  -- ── 8. Referral rewards: threshold and carry-over ──────────────────
  update public.credit_settings
     set referrals_enabled = true, referrals_required = 3, credit_value_ttd = 250,
         hold_days = 0, max_rewards_per_user = null, expiry_days = null;

  for i in 1..7 loop
    insert into public.referrals (referrer_id, referee_id, code, status, converted_at)
    values (u2, v_friends[i], 'verify', 'converted', now() - make_interval(mins => 10 - i));
  end loop;

  v_int := public.evaluate_referral_rewards(u2);
  if v_int <> 2 then
    raise exception 'CHECK FAILED: 7 friends at 3 gave % rewards, expected 2', v_int;
  end if;
  if (select count(*) from public.referrals where referrer_id = u2 and grant_id is null) <> 1 then
    raise exception 'CHECK FAILED: progress did not carry one friend over';
  end if;
  if public.evaluate_referral_rewards(u2) <> 0 then
    raise exception 'CHECK FAILED: re-evaluating issued another reward';
  end if;
  if (select available_ttd from public.credit_wallets where user_id = u2) <> 510 then
    raise exception 'CHECK FAILED: wallet after two rewards is not 510';
  end if;

  -- Suspended referrers earn nothing.
  insert into public.referrals (referrer_id, referee_id, code, status, converted_at)
  values (u1, u2, 'verify', 'converted', now());
  update public.credit_settings set referrals_required = 1;
  update public.profiles set is_suspended = true where id = u1;
  if public.evaluate_referral_rewards(u1) <> 0 then
    raise exception 'CHECK FAILED: a suspended referrer was rewarded';
  end if;
  update public.profiles set is_suspended = false where id = u1;
  update public.credit_settings set referrals_required = 3;

  -- ── 9. A refunded friend claws the reward back, the pool re-forms ──
  -- Oldest friend belongs to the first reward. Its other two friends return
  -- to the pool, which then holds 3 (with the carried-over one) = a new reward.
  v_json := public.refund_referral(
    (select id from public.referrals where referrer_id = u2 and referee_id = v_friends[1]), 'refunded');
  if (v_json->>'shortfall_ttd')::numeric <> 0
     or (v_json->>'friends_returned')::int <> 2
     or (v_json->>'rewards_reissued')::int <> 1 then
    raise exception 'CHECK FAILED: refund_referral returned %', v_json;
  end if;
  if (select available_ttd from public.credit_wallets where user_id = u2) <> 510 then
    raise exception 'CHECK FAILED: wallet after clawback and reissue is not 510';
  end if;
  if (select status from public.referrals where referrer_id = u2 and referee_id = v_friends[1]) <> 'rejected' then
    raise exception 'CHECK FAILED: the refunded friend was not rejected';
  end if;
  v_drift := pg_temp.credit_wallet_drift(u2);
  if v_drift is not null then raise exception 'CHECK FAILED after referral refund: %', v_drift; end if;

  -- With the switch off, nothing is granted.
  update public.credit_settings set referrals_enabled = false, referrals_required = 1;
  if public.evaluate_referral_rewards(u2) <> 0 then
    raise exception 'CHECK FAILED: rewards were issued with the programme off';
  end if;

  v_drift := coalesce(pg_temp.credit_wallet_drift(u1), pg_temp.credit_wallet_drift(u2));
  if v_drift is not null then raise exception 'CHECK FAILED at the end: %', v_drift; end if;

  raise exception 'ALL CREDIT CHECKS PASSED (rolled back). Borrowed % and %.', u1, u2;
end $$;
