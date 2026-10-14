-- =====================================================================
-- 268_credits_wallet_and_referrals.sql
-- TT$ credit wallets, the credit ledger, and the referral programme
-- =====================================================================
--
-- WHAT A CREDIT IS
--
-- A TT$ amount in a student's or parent's wallet, spent at checkout against
-- group-class billing. The company funds it: subscription_payments.amount_ttd
-- stays the FULL class price (it is what commission and the tutor's payout are
-- computed from) and the part credits covered is recorded separately in
-- credits_applied_ttd. Never lower amount_ttd to reflect credits.
--
-- THE LEDGER IS THE SOURCE OF TRUTH
--
-- credit_ledger is append-only history; credit_wallets is a cached sum of it
-- that exists so spending has one row to lock. Every change to either goes
-- through the functions below — hand-written balance arithmetic in the app is
-- how tutor_balances drifted (see the header of the subscription reverse
-- route). Each function takes an idempotency key and is safe to call twice.
--
-- LOTS
--
-- Each grant row is a lot: remaining_ttd is what is left of it. Spending takes
-- from the lots that expire soonest, then the oldest, and records which lots
-- it used in `allocations` ([{grant_id, amount}]). Releasing or restoring a
-- spend puts the money back into the SAME lots, so expiry stays correct.
--
--   grant        +amount   pending -> available (or void when clawed back
--                          during the hold period)
--   spend        -amount   reserved -> settled | released
--   restore      +amount   settled   (a refunded payment's credits returned)
--   clawback     -amount   settled   (a refunded friend's reward taken back)
--   expiry       -amount   settled
--   adjustment   -amount   settled   (admin removal; an admin ADDITION is a
--                          grant with source 'admin')
--
-- Wallet invariants (supabase/_verify_credits.sql checks them):
--   available_ttd = sum(remaining_ttd) of available, unexpired grants
--   pending_ttd   = sum(remaining_ttd) of pending grants
--   reserved_ttd  = sum(-amount_ttd)   of reserved spends
--
-- Nothing here is switched on by this migration: credit_settings ships with
-- both programmes off.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 1. Settings (one row)
-- ---------------------------------------------------------------------

create table if not exists public.credit_settings (
  id                          boolean primary key default true check (id),
  referrals_enabled           boolean not null default false,
  -- Stamped on every off -> on change. The nightly reconcile only converts
  -- payments made after it, so a payment made while the programme was off
  -- never earns anything when it is switched back on.
  referrals_enabled_at        timestamptz,
  campaign_codes_enabled      boolean not null default false,
  referrals_required          int not null default 3 check (referrals_required >= 1),
  credit_value_ttd            numeric(10,2) not null default 250 check (credit_value_ttd > 0),
  min_qualifying_cash_ttd     numeric(10,2) not null default 80 check (min_qualifying_cash_ttd >= 0),
  -- Stripe's floor for a card charge. Placeholder until confirmed in Stripe:
  -- under USD settlement the floor is US$0.50 (about TT$3.40).
  min_cash_charge_ttd         numeric(10,2) not null default 5 check (min_cash_charge_ttd >= 0),
  hold_days                   int not null default 0 check (hold_days >= 0),
  max_rewards_per_user        int check (max_rewards_per_user is null or max_rewards_per_user >= 1),
  flag_conversions_threshold  int not null default 10 check (flag_conversions_threshold >= 1),
  expiry_days                 int check (expiry_days is null or expiry_days >= 1),
  code_attempt_limit          int not null default 5 check (code_attempt_limit >= 1),
  updated_by                  uuid references public.profiles(id) on delete set null,
  updated_at                  timestamptz not null default now()
);

insert into public.credit_settings (id) values (true) on conflict (id) do nothing;

-- ---------------------------------------------------------------------
-- 2. Ledger and wallets
-- ---------------------------------------------------------------------

create table if not exists public.credit_wallets (
  user_id        uuid primary key references public.profiles(id) on delete cascade,
  available_ttd  numeric(12,2) not null default 0 check (available_ttd >= 0),
  pending_ttd    numeric(12,2) not null default 0 check (pending_ttd >= 0),
  reserved_ttd   numeric(12,2) not null default 0 check (reserved_ttd >= 0),
  updated_at     timestamptz not null default now()
);

create table if not exists public.credit_ledger (
  id                       uuid primary key default gen_random_uuid(),
  user_id                  uuid not null references public.profiles(id) on delete cascade,
  kind                     text not null check (kind in ('grant','spend','restore','clawback','expiry','adjustment')),
  -- Signed: positive adds to the wallet, negative takes from it.
  amount_ttd               numeric(10,2) not null,
  state                    text not null check (state in ('pending','available','void','reserved','settled','released')),
  -- Where a grant came from. Null on every other kind.
  source                   text check (source in ('referral','campaign_code','admin')),
  source_id                uuid,
  -- Grants only: what is left of this lot, and when it may be spent / dies.
  remaining_ttd            numeric(10,2) check (remaining_ttd is null or remaining_ttd >= 0),
  available_at             timestamptz,
  expires_at               timestamptz,
  clawed_back              boolean not null default false,
  -- Spends, restores and negative adjustments: [{grant_id, amount}].
  allocations              jsonb,
  -- restore -> the spend; clawback / expiry -> the grant.
  related_id               uuid references public.credit_ledger(id) on delete set null,
  subscription_payment_id  uuid references public.subscription_payments(id) on delete set null,
  stripe_coupon_id         text,
  -- Spends: scenario (A|B|C), base_ttd, enrollment_id, stripe_subscription_id.
  context                  jsonb not null default '{}'::jsonb,
  -- Money that could not be taken back (clawback) or found (a spend
  -- committed after its reservation was released). Shown to admins.
  shortfall_ttd            numeric(10,2) not null default 0 check (shortfall_ttd >= 0),
  note                     text,
  idempotency_key          text not null unique,
  created_by               uuid references public.profiles(id) on delete set null,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  constraint credit_ledger_sign check (
    (kind = 'grant' and amount_ttd > 0)
    -- A restore can be 0: credits that came from a reward which has since been
    -- clawed back are not returned (they settle that clawback's shortfall).
    or (kind = 'restore' and amount_ttd >= 0)
    or (kind in ('spend','clawback','expiry','adjustment') and amount_ttd <= 0)
  ),
  constraint credit_ledger_grant_has_source check (kind <> 'grant' or source is not null)
);

create index if not exists idx_credit_ledger_user_created
  on public.credit_ledger (user_id, created_at desc);
create index if not exists idx_credit_ledger_lots
  on public.credit_ledger (user_id, state, expires_at)
  where kind = 'grant';
create index if not exists idx_credit_ledger_payment
  on public.credit_ledger (subscription_payment_id)
  where subscription_payment_id is not null;
create index if not exists idx_credit_ledger_related
  on public.credit_ledger (related_id)
  where related_id is not null;
create index if not exists idx_credit_ledger_open_spends
  on public.credit_ledger (created_at)
  where kind = 'spend' and state = 'reserved';
-- One open "apply to my next payment" per Stripe subscription. Enforced
-- here rather than in the route so two taps cannot both attach a coupon.
create unique index if not exists uq_credit_ledger_open_renewal_spend
  on public.credit_ledger ((context->>'stripe_subscription_id'))
  where kind = 'spend' and state = 'reserved' and context->>'scenario' = 'A';

-- ---------------------------------------------------------------------
-- 3. Referrals
-- ---------------------------------------------------------------------

create table if not exists public.referral_codes (
  user_id     uuid primary key references public.profiles(id) on delete cascade,
  -- Lowercase: /r/ lowercases before it looks a code up.
  code        text not null unique check (code ~ '^[a-z0-9-]{4,32}$'),
  created_at  timestamptz not null default now()
);

create table if not exists public.referrals (
  id                     uuid primary key default gen_random_uuid(),
  referrer_id            uuid not null references public.profiles(id) on delete cascade,
  -- Only a friend's FIRST qualifying payment counts, and an account can be
  -- referred once.
  referee_id             uuid not null unique references public.profiles(id) on delete cascade,
  code                   text not null,
  status                 text not null default 'signed_up'
                           check (status in ('signed_up','converted','rejected')),
  is_sibling_referral    boolean not null default false,
  clicked_at             timestamptz,
  qualifying_payment_id  uuid references public.subscription_payments(id) on delete set null,
  cash_paid_ttd          numeric(10,2),
  payer_id               uuid references public.profiles(id) on delete set null,
  payer_fingerprint      text,
  rejected_reason        text,
  converted_at           timestamptz,
  rejected_at            timestamptz,
  -- The reward this friend counted toward. Null = converted but not yet
  -- rewarded (progress toward the next reward).
  grant_id               uuid references public.credit_ledger(id) on delete set null,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  constraint referrals_not_self check (referrer_id <> referee_id)
);

create index if not exists idx_referrals_referrer on public.referrals (referrer_id, status);
create index if not exists idx_referrals_unrewarded
  on public.referrals (referrer_id, converted_at)
  where status = 'converted' and grant_id is null;
create index if not exists idx_referrals_grant on public.referrals (grant_id) where grant_id is not null;

-- ---------------------------------------------------------------------
-- 4. Existing tables
-- ---------------------------------------------------------------------

alter table public.subscription_payments
  add column if not exists credits_applied_ttd numeric(10,2) not null default 0,
  add column if not exists credit_spend_id uuid references public.credit_ledger(id) on delete set null;

alter table public.subscription_payments
  drop constraint if exists subscription_payments_credits_applied_check;
alter table public.subscription_payments
  add constraint subscription_payments_credits_applied_check
  check (credits_applied_ttd >= 0 and credits_applied_ttd <= amount_ttd);

create index if not exists idx_subscription_payments_credit_spend
  on public.subscription_payments (credit_spend_id)
  where credit_spend_id is not null;

-- Value lists below are copied from the LIVE staging definitions
-- (pg_get_constraintdef, 2026-10-13), not from older migrations — 203
-- rewrote one from memory and broke live inserts (see 204).

alter table public.subscription_payments
  drop constraint if exists subscription_payments_type_check;
alter table public.subscription_payments
  add constraint subscription_payments_type_check
  check (type in (
    'subscription_initial', 'subscription_renewal', 'subscription_reactivation',
    'secure_spot',
    -- 268: one month bought with credits (scenario B); never renews.
    'credit_month'
  ));

alter table public.subscription_payments
  drop constraint if exists subscription_payments_method_check;
alter table public.subscription_payments
  add constraint subscription_payments_method_check
  check (payment_method in ('card', 'cash',
    -- 268: a credit month paid entirely with credits; no card involved.
    'credits'));

-- 'cash' has been written by the cash join-request route since migration 261
-- but no migration ever allowed it, so those inserts failed. Added here with
-- 'credits' (268: a one-month enrolment that the self-billing cron must not
-- chase).
alter table public.group_enrollments
  drop constraint if exists group_enrollments_billing_provider_check;
alter table public.group_enrollments
  add constraint group_enrollments_billing_provider_check
  check (billing_provider in ('lunipay', 'stripe', 'cash', 'credits'));

alter table public.subscription_payment_exceptions
  drop constraint if exists subscription_payment_exceptions_exception_type_check;
alter table public.subscription_payment_exceptions
  add constraint subscription_payment_exceptions_exception_type_check
  check (exception_type in (
    'activation_failed', 'metadata_invalid', 'enrollment_missing',
    'duplicate_payment', 'capacity_conflict', 'refund_required',
    -- 268: a renewal invoice paid less than the subscription's total and no
    -- credit reservation explains why. Held for an admin instead of being
    -- activated at a guessed price.
    'credit_mismatch'
  ));

-- Live list as of 2026-10-13 (last written by 257), plus three new types.
-- NOT VALID like every previous rewrite: old rows are not re-checked.
alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications
  add constraint notifications_type_check
  check (type in (
    'booking_request', 'booking_request_received', 'booking_accepted',
    'booking_confirmed', 'booking_declined', 'booking_counter_offer',
    'booking_cancelled', 'new_message', 'new_stream_post', 'class_invite',
    'new_class_member', 'group_session_updated', 'group_removal',
    'group_removal_payment_action', 'with_cause_removal_submitted_for_review',
    'with_cause_removal_admin_decision', 'join_request', 'join_request_approved',
    'session_rescheduled', 'tutor_cancelled_session', 'tutor_added_session',
    'attendance_alert', 'rsvp_received', 'payment_succeeded', 'payment_failed',
    'payment_refunded', 'funds_released', 'subscription_payment_succeeded',
    'subscription_activation_delayed', 'subscription_refund_issued',
    'subscription_payment_reminder', 'subscription_grace_started',
    'subscription_suspended', 'subscription_cancellation_scheduled',
    'subscription_cancellation_finalized', 'subscription_reactivation',
    'waitlist_offer_available', 'waitlist_offer_expired', 'noshow_claim_filed',
    'noshow_claim_response', 'noshow_claim_escalated', 'payout_held',
    'payout_released', 'reliability_warning_issued', 'rating_appeal_decided',
    'strike_appeal_decided', 'new_feedback', 'refund_failed_admin_alert',
    'parent_invite', 'parent_link_accepted', 'parent_link_declined',
    'SESSION_REMINDER', 'ENROLLMENT_CONFIRMED', 'NEW_ANNOUNCEMENT',
    'SESSION_CANCELLED', 'NEW_REVIEW', 'WAITLIST_AVAILABLE', 'spot_secured',
    'secure_spot_month_ending', 'secure_spot_refunded', 'secure_spot_lapsed',
    'parent_approval_request', 'parent_approval_outcome',
    'seat_unavailable_refunded', 'feedback_requested', 'child_left_class',
    'child_joined_class', 'class_invite_accepted',
    -- 268
    'referral_converted', 'referral_reward', 'credit_month_ended'
  )) not valid;

-- ---------------------------------------------------------------------
-- 5. Row-level security
-- ---------------------------------------------------------------------
-- Supabase gives anon and authenticated ALL on every new table (see 255), so
-- revoke first. Users may read their own rows; every write goes through the
-- service role and the functions below.

revoke all on public.credit_settings, public.credit_wallets, public.credit_ledger,
              public.referral_codes, public.referrals
  from anon, authenticated;

alter table public.credit_settings enable row level security;
alter table public.credit_wallets  enable row level security;
alter table public.credit_ledger   enable row level security;
alter table public.referral_codes  enable row level security;
alter table public.referrals       enable row level security;

grant select on public.credit_wallets, public.credit_ledger,
                public.referral_codes, public.referrals
  to authenticated;

drop policy if exists "Users read their own wallet" on public.credit_wallets;
create policy "Users read their own wallet" on public.credit_wallets
  for select to authenticated using (user_id = auth.uid());

drop policy if exists "Users read their own credit history" on public.credit_ledger;
create policy "Users read their own credit history" on public.credit_ledger
  for select to authenticated using (user_id = auth.uid());

drop policy if exists "Users read their own referral code" on public.referral_codes;
create policy "Users read their own referral code" on public.referral_codes
  for select to authenticated using (user_id = auth.uid());

drop policy if exists "Referrers read their referrals" on public.referrals;
create policy "Referrers read their referrals" on public.referrals
  for select to authenticated using (referrer_id = auth.uid());

-- credit_settings: RLS on, no policies, no grants. Service role only.

-- ---------------------------------------------------------------------
-- 6. Internal helpers
-- ---------------------------------------------------------------------
-- Lock order everywhere: the wallet row first, then lots. Every public
-- function below takes the wallet lock before reading an idempotency key, so
-- two calls with the same key serialise instead of racing to the insert.

create or replace function public._credit_wallet_lock(p_user uuid)
returns public.credit_wallets
language plpgsql
security definer
set search_path = public
as $$
declare
  v_wallet credit_wallets;
begin
  insert into credit_wallets (user_id) values (p_user) on conflict (user_id) do nothing;
  select * into v_wallet from credit_wallets where user_id = p_user for update;
  return v_wallet;
end;
$$;

-- Expire this user's lots whose expires_at has passed. Caller holds the
-- wallet lock.
create or replace function public._credit_expire_user(p_user uuid)
returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  v_total numeric := 0;
begin
  for r in
    select id, remaining_ttd, state
      from credit_ledger
     where user_id = p_user
       and kind = 'grant'
       and state in ('available', 'pending')
       and remaining_ttd > 0
       and expires_at is not null
       and expires_at <= now()
     for update
  loop
    insert into credit_ledger (user_id, kind, amount_ttd, state, related_id, idempotency_key, note)
    values (p_user, 'expiry', -r.remaining_ttd, 'settled', r.id,
            'expiry:' || r.id::text, 'Credits expired');

    update credit_ledger set remaining_ttd = 0, updated_at = now() where id = r.id;

    if r.state = 'available' then
      update credit_wallets set available_ttd = available_ttd - r.remaining_ttd, updated_at = now()
       where user_id = p_user;
    else
      update credit_wallets set pending_ttd = pending_ttd - r.remaining_ttd, updated_at = now()
       where user_id = p_user;
    end if;

    v_total := v_total + r.remaining_ttd;
  end loop;
  return v_total;
end;
$$;

-- Take up to p_amount from the user's available lots, soonest expiry first,
-- then oldest. Returns the allocations and how much was actually taken.
-- Updates lots only; the caller moves the wallet. Caller holds the wallet lock.
create or replace function public._credit_take(
  p_user uuid,
  p_amount numeric,
  out allocations jsonb,
  out taken numeric
)
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  v_need numeric := p_amount;
  v_take numeric;
begin
  allocations := '[]'::jsonb;
  taken := 0;
  for r in
    select id, remaining_ttd
      from credit_ledger
     where user_id = p_user
       and kind = 'grant'
       and state = 'available'
       and remaining_ttd > 0
       and (expires_at is null or expires_at > now())
     order by expires_at asc nulls last, created_at asc, id asc
     for update
  loop
    exit when v_need <= 0;
    v_take := least(r.remaining_ttd, v_need);
    update credit_ledger set remaining_ttd = remaining_ttd - v_take, updated_at = now() where id = r.id;
    allocations := allocations || jsonb_build_array(jsonb_build_object('grant_id', r.id, 'amount', v_take));
    v_need := v_need - v_take;
    taken := taken + v_take;
  end loop;
end;
$$;

-- Put allocations back into the lots they came from. A lot that has expired
-- since is expired again at once; a lot that was clawed back does not get the
-- money back — it reduces that clawback's shortfall instead.
--   back      returned to the AVAILABLE balance (the caller adds it)
--   absorbed  swallowed by clawed-back lots (never reaches the wallet)
-- Caller holds the wallet lock.
create or replace function public._credit_readd(
  p_user uuid,
  p_allocations jsonb,
  p_key text,
  out back numeric,
  out absorbed numeric
)
language plpgsql
security definer
set search_path = public
as $$
declare
  a jsonb;
  v_grant credit_ledger;
  v_amount numeric;
begin
  back := 0;
  absorbed := 0;
  for a in select * from jsonb_array_elements(coalesce(p_allocations, '[]'::jsonb))
  loop
    v_amount := (a->>'amount')::numeric;
    continue when v_amount is null or v_amount <= 0;

    select * into v_grant from credit_ledger where id = (a->>'grant_id')::uuid for update;
    continue when not found;

    if v_grant.clawed_back or v_grant.state = 'void' then
      update credit_ledger
         set shortfall_ttd = greatest(0, shortfall_ttd - v_amount), updated_at = now()
       where kind = 'clawback' and related_id = v_grant.id;
      absorbed := absorbed + v_amount;
    elsif v_grant.expires_at is not null and v_grant.expires_at <= now() then
      insert into credit_ledger (user_id, kind, amount_ttd, state, related_id, idempotency_key, note)
      values (p_user, 'expiry', -v_amount, 'settled', v_grant.id,
              'expiry:' || v_grant.id::text || ':' || p_key, 'Returned credits had already expired');
    else
      update credit_ledger set remaining_ttd = remaining_ttd + v_amount, updated_at = now()
       where id = v_grant.id;
      back := back + v_amount;
    end if;
  end loop;
end;
$$;

-- ---------------------------------------------------------------------
-- 7. Public functions (service role only)
-- ---------------------------------------------------------------------

-- Add a lot. p_hold_days > 0 makes it pending until then.
create or replace function public.grant_credits(
  p_user        uuid,
  p_amount      numeric,
  p_source      text,
  p_source_id   uuid,
  p_hold_days   int,
  p_expires_at  timestamptz,
  p_key         text,
  p_note        text default null,
  p_created_by  uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_amount numeric := round(p_amount, 2);
  v_pending boolean := coalesce(p_hold_days, 0) > 0;
begin
  if v_amount is null or v_amount <= 0 then
    raise exception 'invalid_amount: %', p_amount;
  end if;

  perform _credit_wallet_lock(p_user);

  select id into v_id from credit_ledger where idempotency_key = p_key;
  if found then
    return v_id;
  end if;

  insert into credit_ledger (
    user_id, kind, amount_ttd, state, source, source_id, remaining_ttd,
    available_at, expires_at, idempotency_key, note, created_by
  ) values (
    p_user, 'grant', v_amount,
    case when v_pending then 'pending' else 'available' end,
    p_source, p_source_id, v_amount,
    case when v_pending then now() + make_interval(days => p_hold_days) else now() end,
    p_expires_at, p_key, p_note, p_created_by
  )
  returning id into v_id;

  if v_pending then
    update credit_wallets set pending_ttd = pending_ttd + v_amount, updated_at = now() where user_id = p_user;
  else
    update credit_wallets set available_ttd = available_ttd + v_amount, updated_at = now() where user_id = p_user;
  end if;

  return v_id;
end;
$$;

-- Hold credits for a checkout. Raises insufficient_credits: when the balance
-- is short, and key_released: when this key was used and then released — a
-- released reservation must never be revived by a retry, or a Stripe coupon
-- could be attached with nothing behind it.
create or replace function public.reserve_credits(
  p_user     uuid,
  p_amount   numeric,
  p_key      text,
  p_context  jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing credit_ledger;
  v_wallet credit_wallets;
  v_amount numeric := round(p_amount, 2);
  v_take record;
  v_id uuid;
begin
  if v_amount is null or v_amount <= 0 then
    raise exception 'invalid_amount: %', p_amount;
  end if;

  perform _credit_wallet_lock(p_user);

  select * into v_existing from credit_ledger where idempotency_key = p_key;
  if found then
    if v_existing.state = 'released' then
      raise exception 'key_released: reservation % was released', p_key;
    end if;
    return v_existing.id;
  end if;

  perform _credit_expire_user(p_user);
  select * into v_wallet from credit_wallets where user_id = p_user;

  if v_wallet.available_ttd < v_amount then
    raise exception 'insufficient_credits: available %, requested %', v_wallet.available_ttd, v_amount;
  end if;

  select * into v_take from _credit_take(p_user, v_amount);
  if v_take.taken < v_amount then
    raise exception 'credit_drift: wallet % shows % available but its lots hold %',
      p_user, v_wallet.available_ttd, v_take.taken;
  end if;

  insert into credit_ledger (user_id, kind, amount_ttd, state, allocations, context, idempotency_key)
  values (p_user, 'spend', -v_amount, 'reserved', v_take.allocations, coalesce(p_context, '{}'::jsonb), p_key)
  returning id into v_id;

  update credit_wallets
     set available_ttd = available_ttd - v_amount,
         reserved_ttd  = reserved_ttd + v_amount,
         updated_at    = now()
   where user_id = p_user;

  return v_id;
end;
$$;

-- A reservation's payment was confirmed. Returns 'committed', 'already',
-- 'recovered' or 'recovered_with_shortfall'. The last two are a payment that
-- arrived after its reservation was released (e.g. by the nightly job): the
-- discount was used, so the credits are taken again from whatever is
-- available and any gap is recorded for an admin.
create or replace function public.commit_credits(
  p_spend_id                 uuid,
  p_subscription_payment_id  uuid default null
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid;
  v_spend credit_ledger;
  v_amount numeric;
  v_take record;
begin
  select user_id into v_user from credit_ledger where id = p_spend_id and kind = 'spend';
  if not found then
    raise exception 'spend_not_found: %', p_spend_id;
  end if;

  perform _credit_wallet_lock(v_user);
  select * into v_spend from credit_ledger where id = p_spend_id for update;
  v_amount := -v_spend.amount_ttd;

  if v_spend.state = 'settled' then
    if p_subscription_payment_id is not null and v_spend.subscription_payment_id is null then
      update credit_ledger set subscription_payment_id = p_subscription_payment_id, updated_at = now()
       where id = p_spend_id;
    end if;
    return 'already';
  end if;

  if v_spend.state = 'reserved' then
    update credit_ledger
       set state = 'settled',
           subscription_payment_id = coalesce(p_subscription_payment_id, subscription_payment_id),
           updated_at = now()
     where id = p_spend_id;
    update credit_wallets set reserved_ttd = reserved_ttd - v_amount, updated_at = now()
     where user_id = v_user;
    return 'committed';
  end if;

  -- Released: take it again.
  perform _credit_expire_user(v_user);
  select * into v_take from _credit_take(v_user, v_amount);

  update credit_ledger
     set state = 'settled',
         allocations = v_take.allocations,
         shortfall_ttd = v_amount - v_take.taken,
         subscription_payment_id = coalesce(p_subscription_payment_id, subscription_payment_id),
         note = coalesce(note || ' | ', '') || 'Committed after release',
         updated_at = now()
   where id = p_spend_id;

  update credit_wallets set available_ttd = available_ttd - v_take.taken, updated_at = now()
   where user_id = v_user;

  return case when v_take.taken < v_amount then 'recovered_with_shortfall' else 'recovered' end;
end;
$$;

-- A reservation that will not be paid. Returns 'released', or the state it
-- was already in ('released', 'settled') — a settled spend is never released;
-- use restore_credits for a refund.
create or replace function public.release_credits(p_spend_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid;
  v_spend credit_ledger;
  v_amount numeric;
  v_back numeric;
begin
  select user_id into v_user from credit_ledger where id = p_spend_id and kind = 'spend';
  if not found then
    raise exception 'spend_not_found: %', p_spend_id;
  end if;

  perform _credit_wallet_lock(v_user);
  select * into v_spend from credit_ledger where id = p_spend_id for update;

  if v_spend.state <> 'reserved' then
    return v_spend.state;
  end if;

  v_amount := -v_spend.amount_ttd;
  select back into v_back from _credit_readd(v_user, v_spend.allocations, 'release:' || p_spend_id::text);

  update credit_ledger set state = 'released', updated_at = now() where id = p_spend_id;
  update credit_wallets
     set reserved_ttd  = reserved_ttd - v_amount,
         available_ttd = available_ttd + v_back,
         updated_at    = now()
   where user_id = v_user;

  return 'released';
end;
$$;

-- A payment that used credits was refunded: give the credits back to the lots
-- they came from. A reserved spend is released instead; a released one needs
-- nothing. Returns 'restored', 'released', 'already' or 'noop'.
create or replace function public.restore_credits(p_spend_id uuid, p_key text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid;
  v_spend credit_ledger;
  v_amount numeric;
  v_readd record;
begin
  select user_id into v_user from credit_ledger where id = p_spend_id and kind = 'spend';
  if not found then
    raise exception 'spend_not_found: %', p_spend_id;
  end if;

  perform _credit_wallet_lock(v_user);

  if exists (select 1 from credit_ledger where idempotency_key = p_key)
     or exists (select 1 from credit_ledger where kind = 'restore' and related_id = p_spend_id) then
    return 'already';
  end if;

  select * into v_spend from credit_ledger where id = p_spend_id for update;

  if v_spend.state = 'reserved' then
    perform release_credits(p_spend_id);
    return 'released';
  end if;
  if v_spend.state <> 'settled' then
    return 'noop';
  end if;

  -- Only what was actually taken from lots comes back; a shortfall recorded
  -- on the spend was never in the wallet.
  select coalesce(sum((a->>'amount')::numeric), 0) into v_amount
    from jsonb_array_elements(coalesce(v_spend.allocations, '[]'::jsonb)) a;
  if v_amount <= 0 then
    return 'noop';
  end if;

  select * into v_readd from _credit_readd(v_user, v_spend.allocations, p_key);

  -- The row records what came back (an expired portion also gets its own
  -- expiry row); credits from a clawed-back reward stay gone.
  insert into credit_ledger (user_id, kind, amount_ttd, state, allocations, related_id,
                             subscription_payment_id, idempotency_key, note)
  values (v_user, 'restore', v_amount - v_readd.absorbed, 'settled', v_spend.allocations, p_spend_id,
          v_spend.subscription_payment_id, p_key,
          case when v_readd.absorbed > 0
               then 'Payment refunded; credits from a reward that was taken back are not returned'
               else 'Payment refunded' end);

  update credit_wallets set available_ttd = available_ttd + v_readd.back, updated_at = now()
   where user_id = v_user;

  return 'restored';
end;
$$;

-- Take back a reward. A pending grant (still in its hold period) is voided in
-- full. Otherwise whatever is left of the lot is removed, and the part already
-- spent is recorded as shortfall_ttd for an admin — the balance is never
-- driven negative. Returns the clawback row's id.
create or replace function public.clawback_grant(p_grant_id uuid, p_key text, p_note text default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid;
  v_grant credit_ledger;
  v_existing uuid;
  v_take numeric;
  v_expired numeric;
  v_short numeric;
  v_id uuid;
begin
  select user_id into v_user from credit_ledger where id = p_grant_id and kind = 'grant';
  if not found then
    raise exception 'grant_not_found: %', p_grant_id;
  end if;

  perform _credit_wallet_lock(v_user);

  select id into v_existing from credit_ledger
   where idempotency_key = p_key or (kind = 'clawback' and related_id = p_grant_id)
   limit 1;
  if found then
    return v_existing;
  end if;

  select * into v_grant from credit_ledger where id = p_grant_id for update;

  v_take := coalesce(v_grant.remaining_ttd, 0);
  select coalesce(sum(-amount_ttd), 0) into v_expired
    from credit_ledger where kind = 'expiry' and related_id = p_grant_id;
  v_short := greatest(0, v_grant.amount_ttd - v_take - v_expired);

  if v_grant.state = 'pending' then
    update credit_wallets set pending_ttd = pending_ttd - v_take, updated_at = now() where user_id = v_user;
  elsif v_grant.state = 'available' then
    update credit_wallets set available_ttd = available_ttd - v_take, updated_at = now() where user_id = v_user;
  else
    v_take := 0;
  end if;

  update credit_ledger
     set remaining_ttd = 0,
         clawed_back = true,
         state = case when state = 'pending' then 'void' else state end,
         updated_at = now()
   where id = p_grant_id;

  insert into credit_ledger (user_id, kind, amount_ttd, state, related_id, shortfall_ttd, idempotency_key, note)
  values (v_user, 'clawback', -v_take, 'settled', p_grant_id, v_short, p_key, p_note)
  returning id into v_id;

  return v_id;
end;
$$;

-- Admin adjustment. Positive = a grant with source 'admin' (spendable at
-- once, never expires). Negative = taken from lots like a spend; refused when
-- the available balance is short.
create or replace function public.adjust_credits(
  p_user    uuid,
  p_amount  numeric,
  p_reason  text,
  p_admin   uuid,
  p_key     text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_amount numeric := round(abs(p_amount), 2);
  v_wallet credit_wallets;
  v_take record;
  v_id uuid;
begin
  if p_amount is null or v_amount = 0 then
    raise exception 'invalid_amount: %', p_amount;
  end if;
  if p_reason is null or length(btrim(p_reason)) < 10 then
    raise exception 'reason_required: an adjustment needs a written reason of at least 10 characters';
  end if;

  if p_amount > 0 then
    return grant_credits(p_user, v_amount, 'admin', null, 0, null, p_key, p_reason, p_admin);
  end if;

  perform _credit_wallet_lock(p_user);
  select id into v_id from credit_ledger where idempotency_key = p_key;
  if found then
    return v_id;
  end if;

  perform _credit_expire_user(p_user);
  select * into v_wallet from credit_wallets where user_id = p_user;
  if v_wallet.available_ttd < v_amount then
    raise exception 'insufficient_credits: available %, requested %', v_wallet.available_ttd, v_amount;
  end if;

  select * into v_take from _credit_take(p_user, v_amount);

  insert into credit_ledger (user_id, kind, amount_ttd, state, allocations, idempotency_key, note, created_by)
  values (p_user, 'adjustment', -v_take.taken, 'settled', v_take.allocations, p_key, p_reason, p_admin)
  returning id into v_id;

  update credit_wallets set available_ttd = available_ttd - v_take.taken, updated_at = now()
   where user_id = p_user;

  return v_id;
end;
$$;

-- Nightly: grants whose hold period has ended become spendable.
create or replace function public.mature_credit_holds()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  u uuid;
  v_sum numeric;
  v_n int;
  v_total int := 0;
begin
  for u in
    select distinct user_id from credit_ledger
     where kind = 'grant' and state = 'pending' and available_at <= now()
  loop
    perform _credit_wallet_lock(u);
    with matured as (
      update credit_ledger
         set state = 'available', updated_at = now()
       where user_id = u and kind = 'grant' and state = 'pending' and available_at <= now()
      returning remaining_ttd
    )
    select coalesce(sum(remaining_ttd), 0), count(*) into v_sum, v_n from matured;

    update credit_wallets
       set pending_ttd = pending_ttd - v_sum,
           available_ttd = available_ttd + v_sum,
           updated_at = now()
     where user_id = u;
    v_total := v_total + v_n;
  end loop;
  return v_total;
end;
$$;

-- Nightly: expire lots past their expires_at.
create or replace function public.expire_credits()
returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  u uuid;
  v_total numeric := 0;
begin
  for u in
    select distinct user_id from credit_ledger
     where kind = 'grant' and state in ('available', 'pending') and remaining_ttd > 0
       and expires_at is not null and expires_at <= now()
  loop
    perform _credit_wallet_lock(u);
    v_total := v_total + _credit_expire_user(u);
  end loop;
  return v_total;
end;
$$;

-- Turn converted friends into rewards. Every `referrals_required` converted,
-- not-yet-rewarded friends (oldest first) become one grant of the CURRENT
-- credit value — copied onto the grant, so changing the setting never alters
-- credits already earned. Progress carries over: 7 friends at 3 = 2 rewards and
-- 1 toward the next. Returns how many grants were issued. Does nothing while
-- the programme is off or the referrer is suspended.
create or replace function public.evaluate_referral_rewards(p_referrer uuid)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  s credit_settings;
  v_existing int;
  v_ids uuid[];
  v_grant uuid;
  v_count int := 0;
begin
  select * into s from credit_settings where id;
  if not found or not s.referrals_enabled then
    return 0;
  end if;
  if exists (select 1 from profiles where id = p_referrer and coalesce(is_suspended, false)) then
    return 0;
  end if;

  -- Serialises evaluation per referrer.
  perform _credit_wallet_lock(p_referrer);

  select count(*) into v_existing
    from credit_ledger
   where user_id = p_referrer and kind = 'grant' and source = 'referral' and not clawed_back;

  loop
    exit when s.max_rewards_per_user is not null and v_existing >= s.max_rewards_per_user;

    select array_agg(id order by converted_at, id) into v_ids
      from (
        select id, converted_at
          from referrals
         where referrer_id = p_referrer and status = 'converted' and grant_id is null
         order by converted_at, id
         limit s.referrals_required
         for update
      ) x;

    exit when coalesce(array_length(v_ids, 1), 0) < s.referrals_required;

    v_grant := grant_credits(
      p_referrer,
      s.credit_value_ttd,
      'referral',
      null,
      s.hold_days,
      case when s.expiry_days is null then null else now() + make_interval(days => s.expiry_days) end,
      'referral-reward:' || md5(array_to_string(v_ids, ',')),
      'Referral reward'
    );

    update referrals set grant_id = v_grant, updated_at = now() where id = any (v_ids);
    v_count := v_count + 1;
    v_existing := v_existing + 1;
  end loop;

  return v_count;
end;
$$;

-- A friend's qualifying payment was refunded. The referral is rejected and,
-- if it was part of a reward, that reward is clawed back. When the clawback
-- recovered everything (always the case during the hold period) the other
-- friends in that reward return to the pool and are re-evaluated; when some
-- of it was already spent they stay attached — the referrer has had that
-- value — and the shortfall waits for an admin.
create or replace function public.refund_referral(p_referral_id uuid, p_reason text default 'refunded')
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  r referrals;
  v_clawback uuid;
  v_short numeric := 0;
  v_returned int := 0;
  v_regranted int := 0;
begin
  select * into r from referrals where id = p_referral_id;
  if not found then
    raise exception 'referral_not_found: %', p_referral_id;
  end if;

  perform _credit_wallet_lock(r.referrer_id);
  select * into r from referrals where id = p_referral_id for update;

  if r.status = 'rejected' then
    return jsonb_build_object('status', 'already');
  end if;

  update referrals
     set status = 'rejected', rejected_reason = p_reason, rejected_at = now(), updated_at = now()
   where id = p_referral_id;

  if r.grant_id is not null then
    v_clawback := clawback_grant(r.grant_id, 'clawback:' || r.grant_id::text, 'Friend''s payment refunded');
    select shortfall_ttd into v_short from credit_ledger where id = v_clawback;

    if coalesce(v_short, 0) = 0 then
      update referrals set grant_id = null, updated_at = now()
       where grant_id = r.grant_id and id <> p_referral_id;
      get diagnostics v_returned = row_count;
      v_regranted := evaluate_referral_rewards(r.referrer_id);
    end if;
  end if;

  return jsonb_build_object(
    'status', 'rejected',
    'clawback_id', v_clawback,
    'shortfall_ttd', coalesce(v_short, 0),
    'friends_returned', v_returned,
    'rewards_reissued', v_regranted
  );
end;
$$;

-- ---------------------------------------------------------------------
-- 8. Grants
-- ---------------------------------------------------------------------

do $$
declare
  f text;
begin
  foreach f in array array[
    'public._credit_wallet_lock(uuid)',
    'public._credit_expire_user(uuid)',
    'public._credit_take(uuid, numeric)',
    'public._credit_readd(uuid, jsonb, text)',
    'public.grant_credits(uuid, numeric, text, uuid, int, timestamptz, text, text, uuid)',
    'public.reserve_credits(uuid, numeric, text, jsonb)',
    'public.commit_credits(uuid, uuid)',
    'public.release_credits(uuid)',
    'public.restore_credits(uuid, text)',
    'public.clawback_grant(uuid, text, text)',
    'public.adjust_credits(uuid, numeric, text, uuid, text)',
    'public.mature_credit_holds()',
    'public.expire_credits()',
    'public.evaluate_referral_rewards(uuid)',
    'public.refund_referral(uuid, text)'
  ]
  loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end;
$$;

commit;

-- VERIFY
-- select * from public.credit_settings;
-- select pg_get_constraintdef(oid) from pg_constraint where conname = 'group_enrollments_billing_provider_check';
-- Run supabase/_verify_credits.sql (always rolls back).
