-- 230 — record WHO PAID for a group subscription, separately from who attends.
--
-- Until now the two were the same person by construction: the only route that
-- could create a group subscription was /api/groups/[groupId]/subscribe, and it
-- used auth.uid() as both the student and the Stripe customer. A parent paying
-- for a child breaks that assumption, and nothing in the schema could express it.
--
-- NULL means "the student paid" — the state every existing row is in. It is not
-- backfilled to student_id: a backfill would assert a fact about historical rows
-- that we would then be unable to distinguish from a real parent payment, and
-- "we don't know of a separate payer" is exactly what NULL should mean here.
--
-- Why this matters beyond bookkeeping: a refund goes to the card that was
-- charged, and a receipt goes to the person who paid. With no payer recorded,
-- both would be aimed at the student, whose card was never touched.

alter table public.group_enrollments
  add column if not exists payer_id uuid references public.profiles(id) on delete set null;

alter table public.subscription_payments
  add column if not exists payer_id uuid references public.profiles(id) on delete set null;

comment on column public.group_enrollments.payer_id is
  'Who pays for this enrolment when that is not the student (a parent). NULL = the student pays.';
comment on column public.subscription_payments.payer_id is
  'Who was charged for this payment when that is not the student. NULL = the student was charged.';

-- Finding "everything this parent pays for" is the query the parent billing and
-- subscription surfaces run on every page load; without an index it is a table
-- scan of every enrolment on the platform. Partial, because the overwhelming
-- majority of rows are and will remain NULL.
create index if not exists group_enrollments_payer_idx
  on public.group_enrollments (payer_id) where payer_id is not null;
create index if not exists subscription_payments_payer_idx
  on public.subscription_payments (payer_id) where payer_id is not null;

-- A payer must be a real relationship, not an arbitrary user id. The check runs
-- on write rather than as a foreign key because the constraint is on the LINK
-- existing, not on the profile existing.
--
-- SECURITY DEFINER with an explicit search_path: this is called from a trigger on
-- a table whose RLS the caller cannot see through, and an unqualified search_path
-- on a definer function is how a writable schema becomes a privilege escalation.
create or replace function public.group_enrollment_payer_guard()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.payer_id is null then
    return new;
  end if;

  -- Paying for yourself is not a "payer" in this column's sense; collapse it to
  -- NULL so there is exactly one representation of the ordinary case.
  if new.payer_id = new.student_id then
    new.payer_id := null;
    return new;
  end if;

  if not exists (
    select 1 from public.parent_child_links
     where parent_id = new.payer_id
       and child_id = new.student_id
  ) then
    raise exception 'payer_id % is not linked to student %', new.payer_id, new.student_id
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

drop trigger if exists group_enrollment_payer_guard_trg on public.group_enrollments;
create trigger group_enrollment_payer_guard_trg
  before insert or update of payer_id, student_id on public.group_enrollments
  for each row execute function public.group_enrollment_payer_guard();
