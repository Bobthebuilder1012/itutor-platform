-- =====================================================================
-- 266_tutor_payout_cycles.sql
-- Monthly per-tutor payout cycles for lesson (group class) earnings
-- =====================================================================
--
-- THE RULE
--
-- A tutor's payout day is the day of the month (Port of Spain calendar) on
-- which they received their FIRST lesson payment. It is set once and never
-- recomputed — a trigger refuses any change. Their first payout is that day
-- in the following month and then the same day every month. A month without
-- that day (31st in February, 30th, 29th) uses its last day for that cycle
-- only; the stored day is unchanged.
--
-- Every payout carries ALL unpaid lesson earnings accumulated up to it, so
-- each tutor gets one bulk transfer a month instead of one per enrolment.
--
-- WHAT MOVES next_payout_on
--
-- Only an admin confirming a batch (mark_payout_batch_paid). Generating a CSV
-- does not. On confirmation the tutor's next payout becomes the first cycle
-- date strictly after max(today, the cycle that was due):
--
--   due Feb 9, confirmed Feb 9  -> next Mar 9
--   due Feb 9, confirmed Feb 20 (late) -> next Mar 9
--   due Mar 9, confirmed Feb 20 (EARLY) -> next Apr 9
--
-- Paying early uses up that cycle without changing the day: earnings that
-- arrive between the early payment and the cycle date it covered carry into
-- the following cycle, so a tutor is never paid twice in one cycle.
-- last_paid_cycle_on records which cycle a confirmation covered; it is later
-- than last_paid_at exactly when the payout was early.
--
-- The TypeScript twin is lib/payouts/payoutCycle.ts. Keep them in step;
-- scripts/verify-payout-cycle.ts tests that copy, and
-- supabase/_verify_payout_cycles.sql tests this one.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 1. Cycle arithmetic
-- ---------------------------------------------------------------------

-- The n-th payout date for a tutor anchored on p_anchor (n = 1 is the first
-- payout, one month after the first payment). Clamped to the month's end.
-- ::timestamp keeps date_trunc off timestamptz, so the session time zone can't
-- shift the result.
create or replace function public.payout_cycle_date(p_anchor date, p_n int)
returns date
language sql
immutable
as $$
  select (date_trunc('month', p_anchor::timestamp) + make_interval(months => p_n))::date
       + (least(
            extract(day from p_anchor)::int,
            extract(day from (date_trunc('month', p_anchor::timestamp)
                              + make_interval(months => p_n + 1)
                              - interval '1 day'))::int
          ) - 1);
$$;

-- Index of the first cycle whose date is strictly after p_floor.
create or replace function public.payout_cycle_index_after(p_anchor date, p_floor date)
returns int
language plpgsql
immutable
as $$
declare
  n int := greatest(1,
    (extract(year from p_floor)::int - extract(year from p_anchor)::int) * 12
    + extract(month from p_floor)::int - extract(month from p_anchor)::int);
begin
  -- Cycle n falls in p_floor's month, so cycle n-1 is always <= p_floor.
  while public.payout_cycle_date(p_anchor, n) <= p_floor loop
    n := n + 1;
  end loop;
  return n;
end;
$$;

create or replace function public.payout_next_cycle_after(p_anchor date, p_floor date)
returns date
language sql
immutable
as $$
  select public.payout_cycle_date(p_anchor, public.payout_cycle_index_after(p_anchor, p_floor));
$$;

-- ---------------------------------------------------------------------
-- 2. tutor_payout_schedules
-- ---------------------------------------------------------------------

create table if not exists public.tutor_payout_schedules (
  tutor_id                      uuid primary key references public.profiles(id) on delete cascade,
  -- Day of month of the first lesson payment, Port of Spain time. Never changes.
  payout_day                    smallint not null check (payout_day between 1 and 31),
  -- Calendar date of that first payment; payout_day is its day of month.
  anchor_date                   date not null,
  first_paid_at                 timestamptz not null,
  first_subscription_payment_id uuid references public.subscription_payments(id) on delete set null,
  next_payout_on                date not null,
  last_paid_cycle_on            date,
  last_paid_at                  timestamptz,
  last_paid_batch_id            uuid references public.payout_batches(id) on delete set null,
  last_paid_by                  uuid references public.profiles(id) on delete set null,
  created_at                    timestamptz not null default now(),
  updated_at                    timestamptz not null default now(),
  constraint tutor_payout_schedules_day_matches_anchor
    check (payout_day = extract(day from anchor_date)::int)
);

comment on table public.tutor_payout_schedules is
  'One row per tutor with lesson earnings. payout_day is fixed at the first lesson payment; '
  'next_payout_on advances only when an admin confirms a payout batch (migration 266).';

create index if not exists idx_tutor_payout_schedules_next
  on public.tutor_payout_schedules (next_payout_on);

-- Admin-only data. The service role bypasses RLS; nothing else gets in.
alter table public.tutor_payout_schedules enable row level security;
revoke all on public.tutor_payout_schedules from anon, authenticated;

-- payout_day and its anchor are set once. A correction is a deliberate
-- delete-and-reinsert by someone at the SQL editor, never an UPDATE.
create or replace function public.tutor_payout_schedules_guard()
returns trigger
language plpgsql
as $$
begin
  if new.payout_day is distinct from old.payout_day
     or new.anchor_date is distinct from old.anchor_date then
    raise exception 'payout_day_immutable: the payout day for tutor % is fixed at %', old.tutor_id, old.payout_day;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_tutor_payout_schedules_guard on public.tutor_payout_schedules;
create trigger trg_tutor_payout_schedules_guard
  before update on public.tutor_payout_schedules
  for each row execute function public.tutor_payout_schedules_guard();

-- ---------------------------------------------------------------------
-- 3. Anchor on the first lesson payout row
-- ---------------------------------------------------------------------
-- payout_ledger is written by activate_subscription and other RPCs; a trigger
-- covers them all. ON CONFLICT DO NOTHING is what makes it "first only".

create or replace function public.anchor_tutor_payout_schedule()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_paid_at timestamptz;
  v_anchor  date;
begin
  if new.subscription_payment_id is null then
    return new;
  end if;
  if exists (select 1 from public.tutor_payout_schedules where tutor_id = new.tutor_id) then
    return new;
  end if;

  select coalesce(sp.paid_at, now()) into v_paid_at
    from public.subscription_payments sp
   where sp.id = new.subscription_payment_id;
  v_paid_at := coalesce(v_paid_at, now());
  v_anchor  := (v_paid_at at time zone 'America/Port_of_Spain')::date;

  insert into public.tutor_payout_schedules (
    tutor_id, payout_day, anchor_date, first_paid_at,
    first_subscription_payment_id, next_payout_on
  ) values (
    new.tutor_id, extract(day from v_anchor)::int, v_anchor, v_paid_at,
    new.subscription_payment_id, public.payout_cycle_date(v_anchor, 1)
  )
  on conflict (tutor_id) do nothing;

  return new;
end;
$$;

drop trigger if exists trg_anchor_tutor_payout_schedule on public.payout_ledger;
create trigger trg_anchor_tutor_payout_schedule
  after insert on public.payout_ledger
  for each row execute function public.anchor_tutor_payout_schedule();

-- ---------------------------------------------------------------------
-- 4. Backfill tutors who already have lesson earnings
-- ---------------------------------------------------------------------
-- Anchor = earliest paid lesson payment that produced a ledger row. If lesson
-- money has already been released to them, the next payout is the first cycle
-- after the last release; otherwise it is their first cycle (which may well be
-- in the past — that tutor is overdue, and the page will say so).

insert into public.tutor_payout_schedules (
  tutor_id, payout_day, anchor_date, first_paid_at,
  first_subscription_payment_id, next_payout_on, last_paid_at
)
select
  f.tutor_id,
  extract(day from f.anchor)::int,
  f.anchor,
  f.paid_at,
  f.sp_id,
  case when r.last_released is null
       then public.payout_cycle_date(f.anchor, 1)
       else public.payout_next_cycle_after(f.anchor,
              greatest(f.anchor, (r.last_released at time zone 'America/Port_of_Spain')::date))
  end,
  r.last_released
from (
  select distinct on (pl.tutor_id)
         pl.tutor_id,
         sp.id      as sp_id,
         sp.paid_at as paid_at,
         (sp.paid_at at time zone 'America/Port_of_Spain')::date as anchor
    from public.payout_ledger pl
    join public.subscription_payments sp on sp.id = pl.subscription_payment_id
   where sp.paid_at is not null
   order by pl.tutor_id, sp.paid_at asc
) f
left join (
  select tutor_id, max(released_at) as last_released
    from public.payout_ledger
   where subscription_payment_id is not null and status = 'released'
   group by tutor_id
) r on r.tutor_id = f.tutor_id
on conflict (tutor_id) do nothing;

-- ---------------------------------------------------------------------
-- 5. payout_batches.paid_by
-- ---------------------------------------------------------------------

alter table public.payout_batches
  add column if not exists paid_by uuid references public.profiles(id) on delete set null;

-- ---------------------------------------------------------------------
-- 6. mark_payout_batch_paid: records who confirmed, advances cycles
-- ---------------------------------------------------------------------
-- Migration 186's body (download gate, balance decrement, release) plus:
--   * paid_by on the batch
--   * each lesson tutor in the batch moves to their next cycle
-- One transaction: a batch is either paid with its cycles advanced, or not.
-- A second call on the same batch raises (status is no longer 'exported'),
-- and a ledger row can only ever sit in one batch, so the same payment can't
-- be paid twice.

drop function if exists public.mark_payout_batch_paid(uuid);

create or replace function public.mark_payout_batch_paid(
  p_batch_id uuid,
  p_paid_by  uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_batch    payout_batches;
  v_count    int;
  v_today    date := (now() at time zone 'America/Port_of_Spain')::date;
  v_advanced int := 0;
begin
  select * into v_batch from payout_batches where id = p_batch_id for update;

  if not found then
    raise exception 'Batch % not found', p_batch_id;
  end if;

  if v_batch.status = 'paid' then
    raise exception 'already_paid: batch % was confirmed paid at %', p_batch_id, v_batch.paid_at;
  end if;

  if v_batch.status <> 'exported' then
    raise exception 'Batch % is not in exported status (current: %)',
      p_batch_id, v_batch.status;
  end if;

  if v_batch.csv_generated_at is null then
    raise exception 'csv_not_generated: download the CSV for batch % before marking it paid', p_batch_id;
  end if;

  update tutor_balances tb
     set available_ttd = available_ttd - sub.total,
         last_updated  = now()
    from (
      select tutor_id, sum(amount_ttd) as total
        from payout_ledger
       where batch_id = p_batch_id and status = 'release_ready'
       group by tutor_id
    ) sub
   where tb.tutor_id = sub.tutor_id;

  update payout_ledger
     set status      = 'released',
         released_at = now(),
         updated_at  = now()
   where batch_id = p_batch_id and status = 'release_ready';

  get diagnostics v_count = row_count;

  update payout_batches
     set status = 'paid', paid_at = now(), paid_by = p_paid_by
   where id = p_batch_id;

  -- Advance every lesson tutor carried in this batch, once.
  with tutors as (
    select distinct tutor_id
      from payout_ledger
     where batch_id = p_batch_id and subscription_payment_id is not null
  ),
  nxt as (
    select s.tutor_id,
           public.payout_cycle_index_after(s.anchor_date, greatest(v_today, s.next_payout_on)) as n
      from tutor_payout_schedules s
      join tutors t on t.tutor_id = s.tutor_id
  )
  update tutor_payout_schedules s
     set next_payout_on     = public.payout_cycle_date(s.anchor_date, nxt.n),
         last_paid_cycle_on = public.payout_cycle_date(s.anchor_date, nxt.n - 1),
         last_paid_at       = now(),
         last_paid_batch_id = p_batch_id,
         last_paid_by       = p_paid_by
    from nxt
   where s.tutor_id = nxt.tutor_id;

  get diagnostics v_advanced = row_count;

  return jsonb_build_object(
    'batch_id',         p_batch_id,
    'released_count',   v_count,
    'total_amount_ttd', v_batch.total_amount_ttd,
    'cycles_advanced',  v_advanced
  );
end;
$$;

revoke all on function public.mark_payout_batch_paid(uuid, uuid) from public, anon, authenticated;
grant execute on function public.mark_payout_batch_paid(uuid, uuid) to service_role;

commit;

-- VERIFY
-- select public.payout_cycle_date('2026-01-09', 1);        -- 2026-02-09
-- select public.payout_cycle_date('2026-01-31', 1);        -- 2026-02-28
-- select public.payout_next_cycle_after('2026-01-09', '2026-03-09'); -- 2026-04-09
-- select count(*) from public.tutor_payout_schedules;
