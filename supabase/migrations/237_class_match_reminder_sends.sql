-- Class Match Week reminder emails: what has already been sent.
--
-- Reminders go out 24 hours and 1 hour before each taster (docs 04 §4.4). Email
-- is the ONLY contact channel the campaign collects — no phone number — so a
-- reminder that does not arrive is a reservation that does not become
-- attendance, and attendance is how the campaign converts.
--
-- WHY THIS IS NOT session_reminders. That table is a queue of rows with an
-- absolute send_at, keyed to `sessions` — one-to-one bookings. A taster is a
-- `class_match_sessions` row with its own meeting link, its own attendee list
-- and no booking behind it; pointing session_reminders at it would mean either a
-- nullable foreign key on a table whose whole contract is that the session
-- exists, or a fake booking per taster.
--
-- WHY A LEDGER RATHER THAN A QUEUE. Nothing needs to be scheduled. The cron can
-- see which tasters start in the next hour and who holds a seat at them, so the
-- only thing it cannot derive is what it has already sent. That is what this
-- records — one row per (session, user, kind), inserted after a successful send.
--
-- The UNIQUE constraint is the deduplication, not a read-then-write: the cron
-- runs every five minutes and two overlapping runs would otherwise both decide a
-- reminder was unsent and both send it.

create table if not exists public.class_match_reminder_sends (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.class_match_sessions(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  -- '24h' or '1h'. Text with a CHECK rather than an enum, matching every other
  -- status column in this schema.
  kind text not null,
  sent_at timestamptz not null default now(),
  constraint class_match_reminder_sends_kind_check check (kind in ('24h', '1h')),
  unique (session_id, user_id, kind)
);

comment on table public.class_match_reminder_sends is
  'One row per Class Match Week reminder email actually sent. The UNIQUE (session_id, user_id, kind) is what stops a second cron run re-sending; there is no queue because nothing needs scheduling — the due set is derivable from the session times.';

create index if not exists class_match_reminder_sends_session_idx
  on public.class_match_reminder_sends (session_id);

-- ---------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------
-- Written and read only by the cron, on the service client, which bypasses RLS.
-- Enabled with no policy on purpose: that is a deny-all for every other caller,
-- which is what this should be. A family does not need to read the log of what
-- was emailed to them, and a teacher must not be able to read one for another's
-- session.

alter table public.class_match_reminder_sends enable row level security;
