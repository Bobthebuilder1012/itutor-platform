-- =====================================================================
-- MIGRATION 260: student count drives marketplace rank
-- =====================================================================
--
-- The more students a tutor or class has, the higher it ranks. Before this,
-- a class's members were 25% of its score and a tutor's students were not
-- counted at all — a tutor's rank came from ratings, profile completeness,
-- sessions held and classes created.
--
-- Both curves are log-scaled so the first students matter most and a large
-- tutor cannot run away with the top of the list: 5 students is ~46% of the
-- student weight, 20 is ~77%, and it saturates at 50 (tutor) / 25 (class).
-- Production at time of writing: 3 tutors with any students, max 5.
--
-- "Students" for a tutor = distinct people who are approved/active members
-- of the tutor's unarchived classes, or who completed a 1:1 session with them
-- (same statuses tutor_session_stats counts). Counted inline rather than as a
-- new view: public views inherit anon grants in this project.
--
-- Weights (both sum to 100):
--   tutor  students 30 · rating 25 · completeness 15 · sessions 15 · classes 5 · boost 10
--          (was       — · rating 30 · completeness 20 · sessions 25 · classes 15 · boost 10)
--   class  members  35 · fill 10 · rating 20 · tutor 15 · completeness 10 · boost 10
--          (was members 15 · fill 10 · rating 25 · tutor 25 · completeness 15 · boost 10)
--
-- group_marketplace_rankings and the tutor listing call these functions, so
-- no view changes are needed. Signatures are unchanged; grants carry over.

begin;

CREATE OR REPLACE FUNCTION public.tutor_ranking_score(p_tutor_id uuid)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
  SELECT round((
      25.0 * coalesce(
        ( coalesce((SELECT sum(r.stars)::numeric  FROM ratings r       WHERE r.tutor_id  = p.id AND r.deleted_at  IS NULL), 0)
        + coalesce((SELECT sum(gr.rating)::numeric FROM group_reviews gr WHERE gr.tutor_id = p.id AND gr.deleted_at IS NULL), 0) )
        / NULLIF(
            coalesce((SELECT count(*) FROM ratings r        WHERE r.tutor_id  = p.id AND r.deleted_at  IS NULL), 0)
          + coalesce((SELECT count(*) FROM group_reviews gr WHERE gr.tutor_id = p.id AND gr.deleted_at IS NULL), 0)
        , 0)
      , 0) / 5.0
    + 30.0 * least(1.0, ln(1 + (
        SELECT count(DISTINCT st) FROM (
          SELECT m.user_id AS st
            FROM group_members m JOIN groups g ON g.id = m.group_id
           WHERE g.tutor_id = p.id AND g.archived_at IS NULL
             AND m.status IN ('approved', 'active')
          UNION
          SELECT s.student_id
            FROM sessions s
           WHERE s.tutor_id = p.id AND s.student_id IS NOT NULL
             AND s.status IN ('COMPLETED_ASSUMED', 'EARLY_END_SHORT')
        ) x
      )) / ln(1 + 50))
    + 15.0 * tutor_completion_score(p.id) / 100.0
    + 15.0 * least(1.0, ln(1 + coalesce(ss.sessions_held, 0)) / ln(1 + 200))
    +  5.0 * least(1.0, ln(1 + coalesce(cs.classes_created, 0)) / ln(1 + 20))
    + 10.0 * coalesce(p.admin_boost, 0) / 100.0
  )::numeric, 3)
  FROM profiles p
  LEFT JOIN tutor_session_stats ss ON ss.tutor_id = p.id
  LEFT JOIN tutor_class_stats  cs ON cs.tutor_id = p.id
  WHERE p.id = p_tutor_id;
$fn$;

CREATE OR REPLACE FUNCTION public.group_ranking_score(p_group_id uuid)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
  SELECT round((
      35.0 * least(1.0, ln(1 + coalesce(st.member_count, 0)) / ln(1 + 25))
    + 10.0 * least(1.0, coalesce(st.member_count, 0)::numeric
                        / NULLIF(coalesce(st.max_students, 0), 0))
    + 20.0 * coalesce(st.rating_avg, 0) / 5.0
    + 15.0 * coalesce(tutor_ranking_score(g.tutor_id), 0) / 100.0
    + 10.0 * group_completion_score(g.id) / 100.0
    + 10.0 * coalesce(g.admin_boost, 0) / 100.0
  )::numeric, 3)
  FROM groups g
  LEFT JOIN group_class_stats st ON st.group_id = g.id
  WHERE g.id = p_group_id;
$fn$;

commit;
