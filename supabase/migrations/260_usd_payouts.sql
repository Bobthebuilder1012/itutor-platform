-- =====================================================================
-- MIGRATION 260: USD payouts for tutors
-- =====================================================================
--
-- A tutor can elect to be paid in USD. Students still pay TTD and every
-- `*_ttd` column stays the source of truth. What this adds is a FROZEN
-- USD snapshot beside each payout_ledger row:
--
--   amount_usd = round(amount_ttd / ttd_per_usd, 2)
--
-- where ttd_per_usd is the Central Bank of Trinidad & Tobago (CBTT)
-- selling rate on the day the STUDENT PAID (Port of Spain calendar day).
-- Once stamped the rate never moves. A later partial refund rewrites
-- amount_ttd and amount_usd is recomputed with the SAME stored rate.
--
-- WHY A TRIGGER
--
-- payout_ledger is written from at least three RPCs (174 session
-- completion, 159 subscription billing, 163 consolidation) plus admin
-- adjustments. Stamping in a BEFORE INSERT trigger covers all of them
-- without editing any, and covers paths added later.
--
-- CURRENCY IS STAMPED PER ROW, NOT READ LIVE
--
-- payout_ledger.payout_currency is copied from the tutor's account when
-- the row is written. Switching modes later affects new earnings only;
-- rows already owed are paid in the currency they were earned under.
--
-- MISSING RATE
--
-- If no CBTT rate exists on or before the payment date (fetch cron never
-- ran), the row is stamped USD with amount_usd NULL. It is NOT silently
-- converted at some other rate. restamp_missing_usd_amounts() fills these
-- in once a rate lands, and the weekly move refuses to batch a USD row
-- whose amount_usd is still NULL.

begin;

-- ---------------------------------------------------------------------
-- 1. fx_rates
-- ---------------------------------------------------------------------

create table if not exists public.fx_rates (
  rate_date      date        not null,
  base           text        not null default 'TTD',
  quote          text        not null default 'USD',
  -- TT dollars per 1 US dollar, e.g. 6.7950
  ttd_per_usd    numeric(10,4) not null check (ttd_per_usd > 0),
  source         text        not null default 'cbtt',
  -- CBTT's own date for the figure (it can lag rate_date on holidays)
  published_date date,
  fetched_at     timestamptz not null default now(),
  primary key (rate_date, base, quote)
);

comment on table public.fx_rates is
  'Daily CBTT TTD/USD selling rate. Written only by /api/cron/fetch-fx-rate (service role).';

alter table public.fx_rates enable row level security;

drop policy if exists "Authenticated read fx rates" on public.fx_rates;
create policy "Authenticated read fx rates"
  on public.fx_rates for select to authenticated using (true);

revoke insert, update, delete, truncate on public.fx_rates from anon, authenticated;
grant select on public.fx_rates to authenticated;

-- Newest rate on or before d. Weekends/holidays fall back to the last
-- business day CBTT published.
create or replace function public.fx_rate_for(p_date date)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select ttd_per_usd
    from public.fx_rates
   where base = 'TTD' and quote = 'USD' and rate_date <= p_date
   order by rate_date desc
   limit 1;
$$;

grant execute on function public.fx_rate_for(date) to authenticated, service_role;

-- ---------------------------------------------------------------------
-- 2. Tutor election
-- ---------------------------------------------------------------------

alter table public.tutor_payout_accounts
  add column if not exists payout_currency text not null default 'TTD';

alter table public.tutor_payout_accounts
  drop constraint if exists tutor_payout_accounts_payout_currency_check;
alter table public.tutor_payout_accounts
  add constraint tutor_payout_accounts_payout_currency_check
  check (payout_currency in ('TTD', 'USD'));

alter table public.tutor_payout_accounts
  add column if not exists payout_currency_changed_at timestamptz;

-- ---------------------------------------------------------------------
-- 3. Ledger snapshot columns
-- ---------------------------------------------------------------------

alter table public.payout_ledger
  add column if not exists payout_currency     text not null default 'TTD',
  add column if not exists fx_rate_ttd_per_usd numeric(10,4),
  add column if not exists fx_rate_date        date,
  add column if not exists amount_usd          numeric(12,2);

alter table public.payout_ledger
  drop constraint if exists payout_ledger_payout_currency_check;
alter table public.payout_ledger
  add constraint payout_ledger_payout_currency_check
  check (payout_currency in ('TTD', 'USD'));

create index if not exists idx_payout_ledger_usd_unstamped
  on public.payout_ledger (fx_rate_date)
  where payout_currency = 'USD' and amount_usd is null;

-- The calendar day the student paid for this ledger row, in Port of Spain.
create or replace function public.payout_ledger_payment_date(
  p_session_id uuid,
  p_subscription_payment_id uuid
)
returns date
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select (coalesce(p.paid_at, p.created_at) at time zone 'America/Port_of_Spain')::date
       from public.sessions s
       join public.payments p on p.booking_id = s.booking_id
      where s.id = p_session_id and p.status in ('succeeded', 'refunded')
      order by coalesce(p.paid_at, p.created_at)
      limit 1),
    (select (coalesce(sp.paid_at, sp.created_at) at time zone 'America/Port_of_Spain')::date
       from public.subscription_payments sp
      where sp.id = p_subscription_payment_id),
    (now() at time zone 'America/Port_of_Spain')::date
  );
$$;

create or replace function public.payout_ledger_stamp_fx()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rate numeric;
begin
  if tg_op = 'INSERT' then
    select coalesce(a.payout_currency, 'TTD') into new.payout_currency
      from public.tutor_payout_accounts a
     where a.tutor_id = new.tutor_id
     limit 1;
    new.payout_currency := coalesce(new.payout_currency, 'TTD');

    if new.payout_currency = 'USD' then
      new.fx_rate_date := public.payout_ledger_payment_date(new.session_id, new.subscription_payment_id);
      v_rate := public.fx_rate_for(new.fx_rate_date);
      new.fx_rate_ttd_per_usd := v_rate;
      new.amount_usd := case when v_rate is null then null
                             else round(new.amount_ttd / v_rate, 2) end;
    else
      new.fx_rate_date := null;
      new.fx_rate_ttd_per_usd := null;
      new.amount_usd := null;
    end if;

  elsif tg_op = 'UPDATE' then
    -- Rate and currency are frozen. Only follow amount_ttd changes
    -- (partial refunds) using the rate already on the row.
    new.payout_currency     := old.payout_currency;
    new.fx_rate_date        := coalesce(old.fx_rate_date, new.fx_rate_date);
    new.fx_rate_ttd_per_usd := coalesce(old.fx_rate_ttd_per_usd, new.fx_rate_ttd_per_usd);
    if new.payout_currency = 'USD' and new.fx_rate_ttd_per_usd is not null then
      new.amount_usd := round(new.amount_ttd / new.fx_rate_ttd_per_usd, 2);
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists payout_ledger_stamp_fx_ins on public.payout_ledger;
create trigger payout_ledger_stamp_fx_ins
  before insert on public.payout_ledger
  for each row execute function public.payout_ledger_stamp_fx();

drop trigger if exists payout_ledger_stamp_fx_upd on public.payout_ledger;
create trigger payout_ledger_stamp_fx_upd
  before update on public.payout_ledger
  for each row execute function public.payout_ledger_stamp_fx();

-- Fill USD rows that were written before a rate existed. Uses the rate
-- for the row's OWN payment date, never today's. Called by the fetch cron
-- after every successful upsert.
create or replace function public.restamp_missing_usd_amounts()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
begin
  -- The update trigger preserves fx_rate_ttd_per_usd only when the old
  -- value is non-null, so writing it here takes effect.
  with upd as (
    update public.payout_ledger pl
       set fx_rate_ttd_per_usd = r.rate,
           amount_usd          = round(pl.amount_ttd / r.rate, 2),
           updated_at          = now()
      from (
        select id, public.fx_rate_for(fx_rate_date) as rate
          from public.payout_ledger
         where payout_currency = 'USD' and amount_usd is null
      ) r
     where pl.id = r.id and r.rate is not null
    returning 1
  )
  select count(*)::int into v_count from upd;
  return v_count;
end;
$$;

grant execute on function public.restamp_missing_usd_amounts() to service_role;
revoke execute on function public.restamp_missing_usd_amounts() from anon, authenticated;

-- ---------------------------------------------------------------------
-- 4. Batches are single-currency
-- ---------------------------------------------------------------------

alter table public.payout_batches
  add column if not exists currency         text not null default 'TTD',
  add column if not exists total_amount_usd numeric(12,2);

alter table public.payout_batches
  drop constraint if exists payout_batches_currency_check;
alter table public.payout_batches
  add constraint payout_batches_currency_check check (currency in ('TTD', 'USD'));

-- Re-created with p_currency. The old 5-arg signature is dropped so
-- PostgREST cannot resolve a call to the stale overload. Callers that do
-- not pass p_currency get TTD, exactly as before.
drop function if exists public.move_release_ready_to_weekly_batch(uuid, text, text, timestamptz, timestamptz);

create or replace function public.move_release_ready_to_weekly_batch(
  p_generated_by uuid,
  p_batch_type   text    default 'one_on_one',
  p_csv_filename text    default null,
  p_window_start timestamptz default null,
  p_window_end   timestamptz default null,
  p_currency     text    default 'TTD'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_batch_id     uuid;
  v_generated_at timestamptz;
  v_window_end   timestamptz := coalesce(p_window_end, now());
  v_window_start timestamptz := coalesce(p_window_start, date_trunc('week', coalesce(p_window_end, now())));
  v_moved        int := 0;
  v_total        numeric := 0;
  v_total_usd    numeric := 0;
  v_tutors       int := 0;
begin
  if p_batch_type not in ('one_on_one','lesson') then
    raise exception 'invalid_batch_type: %', p_batch_type;
  end if;
  if p_currency not in ('TTD','USD') then
    raise exception 'invalid_currency: %', p_currency;
  end if;

  insert into public.payout_batches (
    generated_by, status, batch_type,
    window_start, window_end, csv_filename, currency
  ) values (
    p_generated_by, 'pending_download', p_batch_type,
    v_window_start, v_window_end, p_csv_filename, p_currency
  )
  returning id, generated_at into v_batch_id, v_generated_at;

  with moved as (
    update public.payout_ledger pl
       set batch_id    = v_batch_id,
           isolated_at = now(),
           updated_at  = now()
     where pl.status = 'release_ready'
       and pl.batch_id is null
       and pl.payout_currency = p_currency
       -- A USD row with no rate yet stays out until it is stamped.
       and (p_currency = 'TTD' or pl.amount_usd is not null)
       and (
         (p_batch_type = 'one_on_one' and pl.session_id is not null)
         or
         (p_batch_type = 'lesson'     and pl.subscription_payment_id is not null)
       )
     returning pl.tutor_id, pl.amount_ttd, pl.amount_usd
  )
  select
    count(*)::int,
    coalesce(sum(amount_ttd), 0),
    coalesce(sum(amount_usd), 0),
    count(distinct tutor_id)::int
  into v_moved, v_total, v_total_usd, v_tutors
  from moved;

  if v_moved = 0 then
    delete from public.payout_batches where id = v_batch_id;
    return jsonb_build_object(
      'ok', true, 'moved', 0, 'batch_id', null,
      'batch_type', p_batch_type, 'currency', p_currency,
      'window_start', v_window_start, 'window_end', v_window_end
    );
  end if;

  update public.payout_batches
     set total_amount_ttd = round(v_total, 2),
         total_amount_usd = case when p_currency = 'USD' then round(v_total_usd, 2) end,
         line_count       = v_tutors
   where id = v_batch_id;

  return jsonb_build_object(
    'ok',               true,
    'moved',            v_moved,
    'batch_id',         v_batch_id,
    'batch_type',       p_batch_type,
    'currency',         p_currency,
    'generated_at',     v_generated_at,
    'total_amount_ttd', round(v_total, 2),
    'total_amount_usd', case when p_currency = 'USD' then round(v_total_usd, 2) end,
    'line_count',       v_tutors,
    'window_start',     v_window_start,
    'window_end',       v_window_end
  );
end;
$$;

grant execute on function public.move_release_ready_to_weekly_batch(uuid, text, text, timestamptz, timestamptz, text) to service_role;
revoke execute on function public.move_release_ready_to_weekly_batch(uuid, text, text, timestamptz, timestamptz, text) from anon, authenticated;

commit;
