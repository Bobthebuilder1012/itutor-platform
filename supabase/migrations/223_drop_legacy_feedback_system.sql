-- =====================================================
-- MIGRATION 223: DROP THE LEGACY FEEDBACK SYSTEM
-- =====================================================
-- Resolves §12.3 (monthly versus session feedback) in favour of the unified
-- request-driven model in migrations 221/222. Product decision, taken 2026-08-12.
--
-- WHAT IS BEING DROPPED
--   tutor_feedback           tutor -> student free text, one row per session
--   group_feedback_entries   three ratings + comment, per student per period
--   group_feedback_periods   period windows with due_at
--   group_feedback_settings  per-class enable flag, frequency, deadline_days
--
-- WHY IT CANNOT COEXIST WITH THE NEW MODEL, RATHER THAN JUST BEING REDUNDANT
-- The legacy system is built on deadlines: group_feedback_settings.deadline_days,
-- group_feedback_periods.due_at, and — worst — a middleware redirect that read
-- tutor_feedback and TRAPPED a tutor on a feedback form until they filled it in.
-- §8.1 allows "No deadline, no expiry, no reminder, no escalation" and decision
-- 12 gives feedback no payout consequence. A forced redirect is a deadline, a
-- reminder and an escalation at once, so leaving it running would have meant the
-- platform enforcing the opposite of its own stated model.
--
-- SAFETY: verified empty before dropping, on BOTH environments
--   staging branch (thjsdcbzlvjradczhgso):  0 / 0 / 0 / 0
--   production     (nfkrfciozjxrodkusrhh):  0 / 0 / 0 / 0
-- No parent or student has ever received feedback through these tables, so
-- nothing is being taken away from anyone. Had a single row existed the tables
-- would have been renamed and kept instead — a report a parent once read is not
-- ours to delete.
--
-- Dependency check before dropping: no views or materialised views reference
-- them, and the only foreign key pointing at any of them is internal
-- (group_feedback_entries.period_id -> group_feedback_periods). Hence a plain
-- ordered DROP, with no CASCADE — if anything unexpected did depend on them the
-- drop should fail loudly rather than quietly take that dependency with it.
--
-- WHAT IS DELIBERATELY *NOT* DROPPED
-- The session RATINGS system (public.ratings, /api/feedback/student,
-- /feedback/student/[sessionId], StudentSessionRatingForm, and the student half
-- of /api/feedback/pending). That is student -> tutor, it feeds
-- profiles.rating_average and the marketplace ranking view, and it shares the
-- word "feedback" and the /feedback URL prefix with the system above without
-- being any part of it. Removing it would silently break tutor rankings and the
-- review moderation surface.
--
-- groups.feedback_mode and groups.parent_feedback_price also stay. They priced a
-- paid parent-feedback add-on that no longer has a mechanism behind it, so they
-- are now inert, but they are read by the student and parent class pages to
-- display pricing and dropping them is a separate product decision about what
-- those pages show.
-- =====================================================

BEGIN;

-- Child before parent: entries references periods.
DROP TABLE IF EXISTS public.group_feedback_entries;
DROP TABLE IF EXISTS public.group_feedback_periods;
DROP TABLE IF EXISTS public.group_feedback_settings;
DROP TABLE IF EXISTS public.tutor_feedback;

COMMIT;
