-- =====================================================================
-- VERIFY MIGRATION 269 — campaign (credit) codes
--
-- Paste into the SQL editor of a database where 268 AND 269 are applied.
-- EVERYTHING IS ROLLED BACK: the block always ends by raising. Read the
-- result from the error message:
--
--   "ALL CREDIT CODE CHECKS PASSED (rolled back) ..."  → good
--   "CHECK FAILED: ..."                                → that check broke
--
-- What it proves:
--   * a single-use code redeems once; a second account is told it is used,
--     and the same account is told it already redeemed it
--   * a promo redeems once per account and stops at its cap
--   * dates, pause and the programme switch are enforced
--   * "new accounts only" refuses an account that has paid before
--   * repeated wrong codes lock the account out (and right codes do not count)
--   * tutors and suspended accounts cannot redeem
--   * a reversal claws back the unspent credit; a short reason is refused
--   * credit_campaign_stats() reports what happened
--
-- Simultaneous redemption of one single-use code is guarded by the row lock
-- in redeem_credit_code (SELECT … FOR UPDATE); a single SQL session cannot
-- race itself, so that case is in docs/credits/STRIPE_TEST_MODE_CHECKLIST.md.
-- =====================================================================

do $$
declare
  v_users  uuid[];
  u        uuid[];
  k_batch  uuid;
  k_promo  uuid;
  k_late   uuid;
  r        jsonb;
  v_ok     boolean;
  v_rid    uuid;
  i        int;
begin
  select array_agg(id) into v_users
    from (select id from public.profiles where role in ('student', 'parent') order by created_at limit 9) p;
  if coalesce(array_length(v_users, 1), 0) < 9 then
    raise exception 'NO FIXTURE: needs 9 student or parent profiles (rolled back)';
  end if;
  u := v_users;

  -- Known state for the borrowed accounts and the switches.
  delete from public.credit_code_attempts where user_id = any (u);
  update public.profiles set is_suspended = false where id = any (u);
  update public.credit_settings set campaign_codes_enabled = true, code_attempt_limit = 3;

  insert into public.credit_campaigns (name, kind, value_ttd) values ('Verify batch', 'batch', 50)
  returning id into k_batch;
  insert into public.credit_codes (campaign_id, code, max_uses) values (k_batch, 'VRFYBATCH2', 1);

  insert into public.credit_campaigns (name, kind, value_ttd, max_redemptions) values ('Verify promo', 'promo', 20, 2)
  returning id into k_promo;
  insert into public.credit_codes (campaign_id, code, max_uses) values (k_promo, 'VRFY-PROMO', null);

  -- ── Single-use ──────────────────────────────────────────────────────
  r := public.redeem_credit_code(u[1], 'vrfybatch2');   -- not case-sensitive
  if (r->>'ok')::boolean is not true or (r->>'amount_ttd')::numeric <> 50 then
    raise exception 'CHECK FAILED: single-use code did not redeem: %', r;
  end if;
  if (select available_ttd from public.credit_wallets where user_id = u[1]) < 50 then
    raise exception 'CHECK FAILED: redemption did not reach the wallet';
  end if;
  r := public.redeem_credit_code(u[1], 'VRFYBATCH2');
  if r->>'reason' <> 'already_redeemed' then raise exception 'CHECK FAILED: second redemption by the same account: %', r; end if;
  r := public.redeem_credit_code(u[2], 'VRFYBATCH2');
  if r->>'reason' <> 'already_used' then raise exception 'CHECK FAILED: a used single-use code redeemed again: %', r; end if;

  -- ── Promo: once each, then the cap ──────────────────────────────────
  r := public.redeem_credit_code(u[1], 'VRFY-PROMO');
  if (r->>'ok')::boolean is not true then raise exception 'CHECK FAILED: promo first redemption: %', r; end if;
  r := public.redeem_credit_code(u[2], 'VRFY-PROMO');
  if (r->>'ok')::boolean is not true then raise exception 'CHECK FAILED: promo second account: %', r; end if;
  r := public.redeem_credit_code(u[3], 'VRFY-PROMO');
  if r->>'reason' <> 'max_reached' then raise exception 'CHECK FAILED: promo cap not enforced: %', r; end if;

  -- ── Dates, pause ────────────────────────────────────────────────────
  update public.credit_campaigns set max_redemptions = null where id = k_promo;
  update public.credit_campaigns set status = 'paused' where id = k_promo;
  r := public.redeem_credit_code(u[3], 'VRFY-PROMO');
  if r->>'reason' <> 'paused' then raise exception 'CHECK FAILED: a paused campaign redeemed: %', r; end if;
  update public.credit_campaigns set status = 'active', starts_at = now() + interval '1 day', ends_at = null where id = k_promo;
  r := public.redeem_credit_code(u[3], 'VRFY-PROMO');
  if r->>'reason' <> 'not_started' then raise exception 'CHECK FAILED: a campaign redeemed before it started: %', r; end if;
  update public.credit_campaigns set starts_at = now() - interval '2 days', ends_at = now() - interval '1 day' where id = k_promo;
  r := public.redeem_credit_code(u[3], 'VRFY-PROMO');
  if r->>'reason' <> 'ended' then raise exception 'CHECK FAILED: an ended campaign redeemed: %', r; end if;
  update public.credit_campaigns set ends_at = null where id = k_promo;

  -- ── New accounts only ───────────────────────────────────────────────
  insert into public.credit_campaigns (name, kind, value_ttd, eligibility) values ('Verify new', 'promo', 10, 'new_accounts')
  returning id into k_late;
  insert into public.credit_codes (campaign_id, code) values (k_late, 'VRFY-NEW');
  v_rid := null;
  select student_id into v_rid from public.subscription_payments where status = 'PAID'
     and student_id in (select id from public.profiles where role in ('student', 'parent'))
   limit 1;
  if v_rid is not null then
    update public.profiles set is_suspended = false where id = v_rid;
    delete from public.credit_code_attempts where user_id = v_rid;
    r := public.redeem_credit_code(v_rid, 'VRFY-NEW');
    if r->>'reason' <> 'not_eligible' then
      raise exception 'CHECK FAILED: an account that has paid redeemed a new-accounts code: %', r;
    end if;
  end if;

  -- ── Lockout ─────────────────────────────────────────────────────────
  for i in 1..3 loop
    r := public.redeem_credit_code(u[4], 'NOPE' || i::text || 'XYZ');
    if r->>'reason' <> 'not_found' then raise exception 'CHECK FAILED: a wrong code was not "not found": %', r; end if;
  end loop;
  r := public.redeem_credit_code(u[4], 'VRFY-PROMO');
  if r->>'reason' <> 'locked_out' then raise exception 'CHECK FAILED: three wrong codes did not lock the account: %', r; end if;
  -- A real-but-refused code is not a guess and does not count.
  for i in 1..4 loop
    r := public.redeem_credit_code(u[5], 'VRFYBATCH2');
  end loop;
  r := public.redeem_credit_code(u[5], 'VRFY-PROMO');
  if (r->>'ok')::boolean is not true then raise exception 'CHECK FAILED: used-code refusals locked an account: %', r; end if;

  -- ── Roles, suspension, switch ───────────────────────────────────────
  -- A real tutor account, borrowed as-is: turning a student into a tutor is
  -- refused by enforce_student_account_type when account_type is set.
  v_rid := null;
  select id into v_rid from public.profiles where role = 'tutor' and not coalesce(is_suspended, false) limit 1;
  if v_rid is not null then
    r := public.redeem_credit_code(v_rid, 'VRFY-PROMO');
    if r->>'reason' <> 'not_eligible_role' then raise exception 'CHECK FAILED: a tutor redeemed: %', r; end if;
  end if;
  update public.profiles set is_suspended = true where id = u[7];
  r := public.redeem_credit_code(u[7], 'VRFY-PROMO');
  if r->>'reason' <> 'suspended' then raise exception 'CHECK FAILED: a suspended account redeemed: %', r; end if;
  update public.credit_settings set campaign_codes_enabled = false;
  r := public.redeem_credit_code(u[8], 'VRFY-PROMO');
  if r->>'reason' <> 'codes_disabled' then raise exception 'CHECK FAILED: redeemed with the programme off: %', r; end if;
  update public.credit_settings set campaign_codes_enabled = true;

  -- ── Reversal ────────────────────────────────────────────────────────
  select id into v_rid from public.credit_redemptions where user_id = u[2] and campaign_id = k_promo;
  v_ok := false;
  begin
    perform public.reverse_credit_redemption(v_rid, u[1], 'short');
  exception when others then
    v_ok := sqlerrm like 'reason_required:%';
  end;
  if not v_ok then raise exception 'CHECK FAILED: a reversal without a reason was accepted'; end if;

  r := public.reverse_credit_redemption(v_rid, u[1], 'issued to the wrong student by mistake');
  if r->>'status' <> 'reversed' or (r->>'clawed_back_ttd')::numeric <> 20 then
    raise exception 'CHECK FAILED: reversal did not claw back the unspent 20: %', r;
  end if;
  r := public.reverse_credit_redemption(v_rid, u[1], 'issued to the wrong student by mistake');
  if r->>'status' <> 'already' then raise exception 'CHECK FAILED: a redemption was reversed twice: %', r; end if;

  -- ── Stats ───────────────────────────────────────────────────────────
  if (select codes_redeemed from public.credit_campaign_stats() where campaign_id = k_batch) <> 1
     or (select redemptions from public.credit_campaign_stats() where campaign_id = k_promo) < 3
     or (select value_clawed_back from public.credit_campaign_stats() where campaign_id = k_promo) <> 20 then
    raise exception 'CHECK FAILED: credit_campaign_stats disagrees: %',
      (select jsonb_agg(to_jsonb(s)) from public.credit_campaign_stats() s where s.campaign_id in (k_batch, k_promo));
  end if;

  raise exception 'ALL CREDIT CODE CHECKS PASSED (rolled back).';
end $$;
