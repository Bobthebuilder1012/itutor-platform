-- =====================================================================
-- MIGRATION 236: a parent can clear the feedback notification
-- =====================================================================
--
-- The parent dashboard's attention card and the sidebar's Feedback badge both
-- counted feedback by AGE — anything from the last 14 days, and the last 7,
-- respectively. Nothing recorded that a parent had read it, so "Read feedback"
-- navigated to the page and changed nothing: the item cleared itself only by
-- growing old. From the parent's side that is a notification with no dismiss.
--
-- Read state is modelled as ONE TIMESTAMP PER PARENT rather than a receipt per
-- feedback row. What the counters ask is "has anything arrived since you last
-- looked", which a high-water mark answers exactly, and it stays correct when a
-- parent has several children and many reports. A per-row table would let a
-- parent dismiss one report while leaving another unread, which is a finer
-- distinction than the surfaces here can express — both render a single count.
--
-- Consequence worth knowing: opening the feedback page marks EVERYTHING to date
-- as seen, including a report that arrived while the page was open. That is the
-- behaviour of every "mark all read on view" inbox, and the alternative — a
-- count that survives the page it points at — is the bug being fixed.

alter table public.profiles
  add column if not exists feedback_seen_at timestamptz;

comment on column public.profiles.feedback_seen_at is
  'High-water mark for the parent feedback notification: only feedback created after this counts toward the dashboard attention card and the sidebar badge. Stamped when the parent opens /parent/feedback. NULL means never opened, so everything in the window counts.';
