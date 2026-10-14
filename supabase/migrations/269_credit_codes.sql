-- =====================================================================
-- 269_credit_codes.sql
-- Campaign codes: admin-issued codes that put TT$ credits in the wallet
-- =====================================================================
--
-- A second way to fill the credit wallet from 268, alongside referral
-- rewards. Credits from a code land in the same wallet and are spent the same
-- way, but the programme has its own on/off switch
-- (credit_settings.campaign_codes_enabled), its own budget and its own
-- reporting.
--
-- Named "credit codes", not "campaign codes", because campaign_codes (267)
-- is the attribution table behind /r/<code>.
--
--   batch   N single-use codes (events, school visits, printed cards)
--   promo   one named code (BACKTOSCHOOL) that many accounts redeem once each
--
-- Redemption is ONE function, redeem_credit_code: it checks every rule,
-- records the redemption and grants the credit in a single transaction, with
-- the code row locked so two people redeeming a single-use code at the same
-- moment cannot both succeed. It does not raise for an ordinary refusal — it
-- returns {ok:false, reason} — so the failed attempt it records for the
-- lockout survives (a raise would roll that row back too).
--
-- The value is copied onto each redemption and its grant, so changing a
-- campaign's value never alters credits already issued.
-- =====================================================================

begin;

create table if not exists public.credit_campaigns (
  id                  uuid primary key default gen_random_uuid(),
  name                text not null check (length(btrim(name)) between 2 and 120),
  kind                text not null check (kind in ('batch', 'promo')),
  value_ttd           numeric(10,2) not null check (value_ttd > 0),
  starts_at           timestamptz not null default now(),
  -- Null = open-ended.
  ends_at             timestamptz,
  -- Across the whole campaign. Null = no cap. (A batch code is also capped
  -- at one use by credit_codes.max_uses.)
  max_redemptions     int check (max_redemptions is null or max_redemptions >= 1),
  -- 'new_accounts' = an account that has never paid for anything.
  eligibility         text not null default 'anyone' check (eligibility in ('anyone', 'new_accounts')),
  -- Days after redemption; null = the credits never expire.
  credit_expiry_days  int check (credit_expiry_days is null or credit_expiry_days >= 1),
  status              text not null default 'active' check (status in ('draft', 'active', 'paused', 'ended')),
  note                text,
  created_by          uuid references public.profiles(id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint credit_campaigns_dates check (ends_at is null or ends_at > starts_at)
);

create table if not exists public.credit_codes (
  id           uuid primary key default gen_random_uuid(),
  campaign_id  uuid not null references public.credit_campaigns(id) on delete cascade,
  -- Uppercase. Generated batch codes are 10 characters from an alphabet with
  -- no look-alikes; promo codes are 4–24 letters, digits or hyphens.
  code         text not null unique check (code ~ '^[A-Z0-9-]{4,24}$'),
  -- 1 for a batch code; null for a promo (any number of accounts, once each).
  max_uses     int check (max_uses is null or max_uses >= 1),
  use_count    int not null default 0 check (use_count >= 0),
  status       text not null default 'active' check (status in ('active', 'void')),
  created_at   timestamptz not null default now()
);

create index if not exists idx_credit_codes_campaign on public.credit_codes (campaign_id, status);

create table if not exists public.credit_redemptions (
  id              uuid primary key default gen_random_uuid(),
  code_id         uuid not null references public.credit_codes(id) on delete cascade,
  campaign_id     uuid not null references public.credit_campaigns(id) on delete cascade,
  user_id         uuid not null references public.profiles(id) on delete cascade,
  amount_ttd      numeric(10,2) not null check (amount_ttd > 0),
  ledger_id       uuid references public.credit_ledger(id) on delete set null,
  redeemed_at     timestamptz not null default now(),
  reversed_at     timestamptz,
  reversed_by     uuid references public.profiles(id) on delete set null,
  reverse_reason  text,
  -- One redemption per account per code.
  constraint credit_redemptions_once unique (code_id, user_id)
);

create index if not exists idx_credit_redemptions_campaign on public.credit_redemptions (campaign_id, redeemed_at desc);
create index if not exists idx_credit_redemptions_user on public.credit_redemptions (user_id);

create table if not exists public.credit_code_attempts (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid references public.profiles(id) on delete cascade,
  ip_hash       text,
  code          text,
  succeeded     boolean not null,
  reason        text,
  attempted_at  timestamptz not null default now()
);

create index if not exists idx_credit_code_attempts_user on public.credit_code_attempts (user_id, attempted_at desc);

-- ---------------------------------------------------------------------
-- Row-level security: users read their own redemptions; everything else is
-- service-role only.
-- ---------------------------------------------------------------------

revoke all on public.credit_campaigns, public.credit_codes, public.credit_redemptions,
              public.credit_code_attempts
  from anon, authenticated;

alter table public.credit_campaigns     enable row level security;
alter table public.credit_codes         enable row level security;
alter table public.credit_redemptions   enable row level security;
alter table public.credit_code_attempts enable row level security;

grant select on public.credit_redemptions to authenticated;

drop policy if exists "Users read their own redemptions" on public.credit_redemptions;
create policy "Users read their own redemptions" on public.credit_redemptions
  for select to authenticated using (user_id = auth.uid());

-- ---------------------------------------------------------------------
-- Redemption
-- ---------------------------------------------------------------------
-- Returns {ok:true, redemption_id, amount_ttd, campaign} or {ok:false, reason}.
-- Reasons: codes_disabled, locked_out, not_eligible_role, suspended,
-- not_found, not_started, ended, paused, already_used, already_redeemed,
-- max_reached, not_eligible.
--
-- Only not_found counts toward the lockout: guessing produces codes that do
-- not exist; a real code that has ended or was already used is not a guess.

create or replace function public.redeem_credit_code(p_user uuid, p_code text, p_ip_hash text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  s credit_settings;
  v_code text := upper(btrim(coalesce(p_code, '')));
  v_profile record;
  v_failures int;
  c credit_codes;
  k credit_campaigns;
  v_count int;
  v_redemption uuid;
  v_grant uuid;
  v_reason text;
begin
  select * into s from credit_settings where id;
  if not found or not s.campaign_codes_enabled then
    return jsonb_build_object('ok', false, 'reason', 'codes_disabled');
  end if;

  select role, coalesce(is_suspended, false) as is_suspended into v_profile from profiles where id = p_user;
  if not found or v_profile.role not in ('student', 'parent') then
    return jsonb_build_object('ok', false, 'reason', 'not_eligible_role');
  end if;
  if v_profile.is_suspended then
    return jsonb_build_object('ok', false, 'reason', 'suspended');
  end if;

  select count(*) into v_failures
    from credit_code_attempts
   where user_id = p_user and not succeeded and reason = 'not_found'
     and attempted_at > now() - interval '15 minutes';
  if v_failures >= s.code_attempt_limit then
    return jsonb_build_object('ok', false, 'reason', 'locked_out');
  end if;

  select * into c from credit_codes where code = v_code for update;
  if not found then
    insert into credit_code_attempts (user_id, ip_hash, code, succeeded, reason)
    values (p_user, p_ip_hash, left(v_code, 32), false, 'not_found');
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  -- Locked too, so a campaign-wide cap holds under concurrent redemptions of
  -- different codes in the same campaign.
  select * into k from credit_campaigns where id = c.campaign_id for update;

  v_reason := case
    when k.status = 'draft' then 'not_found'
    when c.status = 'void' or k.status = 'ended' then 'ended'
    when k.status = 'paused' then 'paused'
    when k.starts_at > now() then 'not_started'
    when k.ends_at is not null and k.ends_at <= now() then 'ended'
    else null
  end;

  if v_reason is null and exists (select 1 from credit_redemptions where code_id = c.id and user_id = p_user) then
    v_reason := 'already_redeemed';
  end if;
  if v_reason is null and c.max_uses is not null and c.use_count >= c.max_uses then
    v_reason := 'already_used';
  end if;
  if v_reason is null and k.max_redemptions is not null then
    select count(*) into v_count from credit_redemptions where campaign_id = k.id and reversed_at is null;
    if v_count >= k.max_redemptions then
      v_reason := 'max_reached';
    end if;
  end if;
  if v_reason is null and k.eligibility = 'new_accounts' then
    if exists (
      select 1 from subscription_payments
       where (student_id = p_user or payer_id = p_user) and status in ('PAID', 'REFUNDED', 'PARTIALLY_REFUNDED')
    ) or exists (
      select 1 from payments where payer_id = p_user and status in ('succeeded', 'refunded', 'partially_refunded')
    ) then
      v_reason := 'not_eligible';
    end if;
  end if;

  if v_reason is not null then
    insert into credit_code_attempts (user_id, ip_hash, code, succeeded, reason)
    values (p_user, p_ip_hash, left(v_code, 32), false, v_reason);
    return jsonb_build_object('ok', false, 'reason', v_reason);
  end if;

  insert into credit_redemptions (code_id, campaign_id, user_id, amount_ttd)
  values (c.id, k.id, p_user, k.value_ttd)
  returning id into v_redemption;

  update credit_codes set use_count = use_count + 1 where id = c.id;

  v_grant := grant_credits(
    p_user,
    k.value_ttd,
    'campaign_code',
    v_redemption,
    0,
    case when k.credit_expiry_days is null then null else now() + make_interval(days => k.credit_expiry_days) end,
    'redemption:' || v_redemption::text,
    'Campaign: ' || k.name
  );

  update credit_redemptions set ledger_id = v_grant where id = v_redemption;

  insert into credit_code_attempts (user_id, ip_hash, code, succeeded, reason)
  values (p_user, p_ip_hash, left(v_code, 32), true, null);

  return jsonb_build_object(
    'ok', true,
    'redemption_id', v_redemption,
    'amount_ttd', k.value_ttd,
    'campaign', k.name,
    'expires_in_days', k.credit_expiry_days
  );
end;
$$;

-- Admin reversal of one redemption: only what is left of its credits can be
-- taken back (clawback_grant records the rest as a shortfall).
create or replace function public.reverse_credit_redemption(p_redemption_id uuid, p_admin uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  r credit_redemptions;
  v_clawback uuid;
  v_taken numeric := 0;
  v_short numeric := 0;
begin
  if p_reason is null or length(btrim(p_reason)) < 10 then
    raise exception 'reason_required: a reversal needs a written reason of at least 10 characters';
  end if;

  select * into r from credit_redemptions where id = p_redemption_id for update;
  if not found then
    raise exception 'redemption_not_found: %', p_redemption_id;
  end if;
  if r.reversed_at is not null then
    return jsonb_build_object('status', 'already');
  end if;

  if r.ledger_id is not null then
    v_clawback := clawback_grant(r.ledger_id, 'redemption-reverse:' || r.id::text, p_reason);
    select -amount_ttd, shortfall_ttd into v_taken, v_short from credit_ledger where id = v_clawback;
  end if;

  update credit_redemptions
     set reversed_at = now(), reversed_by = p_admin, reverse_reason = p_reason
   where id = r.id;

  return jsonb_build_object('status', 'reversed', 'clawed_back_ttd', v_taken, 'already_spent_ttd', v_short);
end;
$$;

-- One row per campaign for the admin list and the accountant's view.
--   value_spent = redeemed − outstanding − expired − clawed back
create or replace function public.credit_campaign_stats()
returns table (
  campaign_id uuid,
  codes_issued bigint,
  codes_redeemed bigint,
  redemptions bigint,
  value_redeemed numeric,
  value_outstanding numeric,
  value_expired numeric,
  value_clawed_back numeric,
  value_spent numeric
)
language sql
stable
security definer
set search_path = public
as $$
  with codes as (
    select campaign_id, count(*) as issued, count(*) filter (where use_count > 0) as redeemed
      from credit_codes group by campaign_id
  ),
  red as (
    select r.campaign_id, r.id, r.amount_ttd, r.ledger_id, r.reversed_at
      from credit_redemptions r
  ),
  lots as (
    select red.campaign_id,
           count(*) as redemptions,
           coalesce(sum(red.amount_ttd), 0) as redeemed,
           coalesce(sum(g.remaining_ttd) filter (
             where g.state in ('available', 'pending') and (g.expires_at is null or g.expires_at > now())
           ), 0) as outstanding,
           coalesce(sum((select coalesce(sum(-e.amount_ttd), 0) from credit_ledger e
                          where e.kind = 'expiry' and e.related_id = g.id)), 0) as expired,
           coalesce(sum((select coalesce(sum(-cb.amount_ttd), 0) from credit_ledger cb
                          where cb.kind = 'clawback' and cb.related_id = g.id)), 0) as clawed
      from red
      left join credit_ledger g on g.id = red.ledger_id
     group by red.campaign_id
  )
  select k.id,
         coalesce(codes.issued, 0),
         coalesce(codes.redeemed, 0),
         coalesce(lots.redemptions, 0),
         coalesce(lots.redeemed, 0),
         coalesce(lots.outstanding, 0),
         coalesce(lots.expired, 0),
         coalesce(lots.clawed, 0),
         greatest(0, coalesce(lots.redeemed, 0) - coalesce(lots.outstanding, 0)
                     - coalesce(lots.expired, 0) - coalesce(lots.clawed, 0))
    from credit_campaigns k
    left join codes on codes.campaign_id = k.id
    left join lots on lots.campaign_id = k.id;
$$;

do $$
declare
  f text;
begin
  foreach f in array array[
    'public.redeem_credit_code(uuid, text, text)',
    'public.reverse_credit_redemption(uuid, uuid, text)',
    'public.credit_campaign_stats()'
  ]
  loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end;
$$;

commit;

-- VERIFY
-- Run supabase/_verify_credit_codes.sql (always rolls back).
