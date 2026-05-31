-- ============================================================
-- MIGRATION 128: COMMUNITY TABLE CLEANUP
-- iTutor Database
-- ============================================================
--
-- !! PRE-REQUISITE — CODE DELETION MUST HAPPEN FIRST !!
--
-- Deletes / edits done in the accompanying code PR:
--   DELETED dirs:
--     app/communities/**
--     app/community/**
--     app/api/communities/**
--     app/api/subject-communities/**
--     lib/communities/**
--     lib/subject-communities/**
--     components/communities/**
--     components/community/**
--     components/subject-communities/**
--   DELETED files:
--     lib/supabase/community.ts
--     lib/supabase/community-v2.ts
--     lib/server/ensureSchoolCommunity.ts
--     lib/actions/community.ts
--     lib/types/community.ts
--     lib/types/community-v2.ts
--     lib/types/communities.ts
--     lib/types/subject-communities.ts
--     lib/featureFlags/communitiesArchived.ts
--     lib/utils/rateLimits.ts
--   EDITED (community refs stripped, file kept):
--     app/api/bookings/create/route.ts
--     app/api/sessions/create-for-booking/route.ts
--     app/api/parent/add-child/route.ts
--     lib/services/sessionService.ts
--     app/student/settings/page.tsx
--     app/signup/page.tsx
--     app/onboarding/tutor/page.tsx
--     components/EditProfileModal.tsx
--     components/DashboardLayout.tsx
--     components/landing/Footer.tsx
-- ============================================================

BEGIN;

-- ============================================================
-- STEP 1: Drop community v1 tables
-- ============================================================
DROP TABLE IF EXISTS community_mod_actions CASCADE;
DROP TABLE IF EXISTS community_reports CASCADE;
DROP TABLE IF EXISTS community_memberships CASCADE;
DROP TABLE IF EXISTS communities CASCADE;

-- ============================================================
-- STEP 2: Drop community v2.0 (school communities)
-- ============================================================
DROP TABLE IF EXISTS school_community_messages CASCADE;
DROP TABLE IF EXISTS school_community_memberships CASCADE;
DROP TABLE IF EXISTS school_communities CASCADE;

-- ============================================================
-- STEP 3: Drop community v2.1 (unified communities)
-- ============================================================
DROP TABLE IF EXISTS community_favorites_v2 CASCADE;
-- community_message_reactions_v2 already dropped in 127 — idempotent guard:
DROP TABLE IF EXISTS community_message_reactions_v2 CASCADE;
DROP TABLE IF EXISTS community_messages_v2 CASCADE;
DROP TABLE IF EXISTS community_memberships_v2 CASCADE;
DROP TABLE IF EXISTS communities_v2 CASCADE;

-- ============================================================
-- STEP 4: Drop subject communities experiment
-- ============================================================
-- subject_community_pinned_sessions already dropped in 127 — idempotent guard:
DROP TABLE IF EXISTS subject_community_pinned_sessions CASCADE;
DROP TABLE IF EXISTS subject_community_messages CASCADE;
DROP TABLE IF EXISTS subject_community_memberships CASCADE;
DROP TABLE IF EXISTS subject_communities CASCADE;

-- ============================================================
-- STEP 4b: Drop triggers that depend on community columns / funcs
-- ============================================================
-- These triggers on messages reference question_id / answer_count /
-- message_type internally, so the column drops in Step 5 fail unless
-- the triggers are dropped first. The trigger on profiles depends on
-- a function we drop in Step 8.

DROP TRIGGER IF EXISTS answer_count_increment       ON messages;
DROP TRIGGER IF EXISTS answer_count_decrement       ON messages;
DROP TRIGGER IF EXISTS question_status_update       ON messages;
DROP TRIGGER IF EXISTS trigger_auto_assign_communities ON profiles;

-- ============================================================
-- STEP 5a: Drop RLS policies that reference community_id / message_type
-- ============================================================
-- These policies block the column drops in Step 5b/5c. Drop them first,
-- then recreate clean DM-only versions in Step 5d.

DROP POLICY IF EXISTS "msg_read_dm_only"             ON messages;
DROP POLICY IF EXISTS "msg_insert_dm_only"           ON messages;
DROP POLICY IF EXISTS "users_read_messages"          ON messages;
DROP POLICY IF EXISTS "users_send_dm_messages"       ON messages;
DROP POLICY IF EXISTS "members_post_community_messages" ON messages;
DROP POLICY IF EXISTS "users_update_own_messages"    ON messages;
DROP POLICY IF EXISTS "users_delete_messages"        ON messages;
DROP POLICY IF EXISTS "Users can view messages in their conversations" ON messages;
DROP POLICY IF EXISTS "Members can read community questions"           ON messages;
DROP POLICY IF EXISTS "Users can send messages"                        ON messages;
DROP POLICY IF EXISTS "Active members can create questions"            ON messages;
DROP POLICY IF EXISTS "Users can edit own messages"                    ON messages;
DROP POLICY IF EXISTS "Moderators can moderate messages"               ON messages;
DROP POLICY IF EXISTS "Authors and moderators can delete"              ON messages;

-- ============================================================
-- STEP 5b: Strip community columns from messages
-- ============================================================
ALTER TABLE IF EXISTS messages
  DROP COLUMN IF EXISTS community_id,
  DROP COLUMN IF EXISTS question_id,
  DROP COLUMN IF EXISTS title,
  DROP COLUMN IF EXISTS topic_tag,
  DROP COLUMN IF EXISTS status,
  DROP COLUMN IF EXISTS best_answer_id,
  DROP COLUMN IF EXISTS answer_count,
  DROP COLUMN IF EXISTS views_count,
  DROP COLUMN IF EXISTS is_pinned,
  DROP COLUMN IF EXISTS helpful_count;

-- ============================================================
-- STEP 5c: Strip community columns from conversations / bookings / sessions
-- ============================================================
-- The pasted Migration-128 missed bookings.community_id and sessions.community_id
-- (added by mig 092 with FK to subject_communities). After dropping
-- subject_communities, the FK is gone but the orphan columns remain.

ALTER TABLE IF EXISTS conversations
  DROP COLUMN IF EXISTS community_id;

ALTER TABLE IF EXISTS bookings
  DROP COLUMN IF EXISTS community_id;

ALTER TABLE IF EXISTS sessions
  DROP COLUMN IF EXISTS community_id;

-- ============================================================
-- STEP 5d: Recreate clean DM-only RLS policies on messages
-- ============================================================
-- Same intent as the policies dropped in 5a, but without any reference
-- to the (now-removed) community_id / message_type fields. The
-- conversation membership check is the only gate that still matters.

CREATE POLICY "msg_read_dm_only"
ON messages
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM conversations c
    WHERE c.id = messages.conversation_id
      AND (c.participant_1_id = auth.uid() OR c.participant_2_id = auth.uid())
  )
);

CREATE POLICY "msg_insert_dm_only"
ON messages
FOR INSERT
TO authenticated
WITH CHECK (
  sender_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM conversations c
    WHERE c.id = conversation_id
      AND (c.participant_1_id = auth.uid() OR c.participant_2_id = auth.uid())
  )
);

ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- STEP 7: Drop the now-vestigial messages.message_type column + enum
-- ============================================================
-- After community removal:
--   - Only legal enum value left would be 'dm' (single-valued enum is noise)
--   - No application code reads messages.message_type — all live readers
--     were in deleted community files. booking_messages.message_type is
--     a separate text-typed column on a different table.
--   - The previous "rebuild enum via rename + recast" approach trips
--     Postgres because the renamed type (message_type_old) and the new
--     type (message_type) share no equality operator, and the USING
--     clause becomes ambiguous between column name and type name.
--
-- Cleanest path: drop the column, then drop the enum.

ALTER TABLE IF EXISTS messages
  DROP COLUMN IF EXISTS message_type;

DROP TYPE IF EXISTS message_type;

-- Drop community-only enum types
DROP TYPE IF EXISTS question_status CASCADE;
DROP TYPE IF EXISTS community_type CASCADE;
DROP TYPE IF EXISTS community_audience CASCADE;
DROP TYPE IF EXISTS member_role CASCADE;
DROP TYPE IF EXISTS member_status CASCADE;
DROP TYPE IF EXISTS school_community_member_status CASCADE;
DROP TYPE IF EXISTS school_community_member_role CASCADE;
DROP TYPE IF EXISTS v2_community_type CASCADE;
DROP TYPE IF EXISTS v2_community_member_role CASCADE;
DROP TYPE IF EXISTS v2_community_member_status CASCADE;
DROP TYPE IF EXISTS subject_community_message_type CASCADE;
DROP TYPE IF EXISTS report_target_type CASCADE;
DROP TYPE IF EXISTS report_reason CASCADE;
DROP TYPE IF EXISTS mod_action_type CASCADE;
DROP TYPE IF EXISTS dm_request_status CASCADE;
-- Keep conversation_type — 'dm', 'booking', 'group' still meaningful

-- ============================================================
-- STEP 8: Drop orphaned community / Q&A functions
-- ============================================================
-- Functions that reference dropped tables or columns.

-- Q&A trigger functions (referenced messages.question_id / message_type='answer')
DROP FUNCTION IF EXISTS public.increment_answer_count() CASCADE;
DROP FUNCTION IF EXISTS public.decrement_answer_count() CASCADE;
DROP FUNCTION IF EXISTS public.update_question_status() CASCADE;

-- Community v1 helpers
DROP FUNCTION IF EXISTS public.log_mod_action(uuid, uuid, uuid, text, text) CASCADE;
DROP FUNCTION IF EXISTS public.is_community_moderator(uuid, uuid) CASCADE;
DROP FUNCTION IF EXISTS public.can_post_in_community(uuid, uuid) CASCADE;
DROP FUNCTION IF EXISTS public.update_communities_updated_at() CASCADE;

-- Community v2.0 helpers (school communities)
DROP FUNCTION IF EXISTS public.ensure_school_communities(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.auto_assign_school_communities() CASCADE;
DROP FUNCTION IF EXISTS public.backfill_school_community_memberships() CASCADE;
DROP FUNCTION IF EXISTS public.user_institution_id() CASCADE;
DROP FUNCTION IF EXISTS public.school_community_messages_updated_at() CASCADE;

-- Subject communities helpers
DROP FUNCTION IF EXISTS public.user_is_subject_community_member(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.subject_community_update_member_count() CASCADE;

-- ============================================================
-- STEP 9: Restore create_booking_request to the pre-community signature
-- ============================================================
-- Mig 093 added p_community_id (8-arg). We're going back to 7-arg.

DROP FUNCTION IF EXISTS public.create_booking_request(uuid, uuid, uuid, uuid, timestamptz, timestamptz, text, uuid);

CREATE OR REPLACE FUNCTION public.create_booking_request(
    p_student_id uuid,
    p_tutor_id uuid,
    p_subject_id uuid,
    p_session_type_id uuid,
    p_requested_start_at timestamptz,
    p_requested_end_at timestamptz,
    p_student_notes text DEFAULT NULL
) RETURNS jsonb AS $$
DECLARE
    v_booking_id uuid;
    v_price_ttd numeric;
    v_calendar jsonb;
BEGIN
    IF auth.uid() != p_student_id THEN
        RAISE EXCEPTION 'Unauthorized: You can only create bookings for yourself';
    END IF;

    SELECT price_ttd INTO v_price_ttd
    FROM public.session_types
    WHERE id = p_session_type_id
      AND tutor_id = p_tutor_id
      AND is_active = true;

    IF v_price_ttd IS NULL THEN
        RAISE EXCEPTION 'Invalid session type';
    END IF;

    v_calendar := get_tutor_public_calendar(p_tutor_id, p_requested_start_at, p_requested_end_at);

    IF EXISTS (
        SELECT 1 FROM jsonb_array_elements(v_calendar->'busy_blocks') as bb
        WHERE time_ranges_overlap(
            p_requested_start_at,
            p_requested_end_at,
            (bb->>'start_at')::timestamptz,
            (bb->>'end_at')::timestamptz
        )
    ) THEN
        RAISE EXCEPTION 'Requested time slot is not available';
    END IF;

    INSERT INTO public.bookings (
        student_id,
        tutor_id,
        subject_id,
        session_type_id,
        requested_start_at,
        requested_end_at,
        status,
        last_action_by,
        price_ttd,
        student_notes
    ) VALUES (
        p_student_id,
        p_tutor_id,
        p_subject_id,
        p_session_type_id,
        p_requested_start_at,
        p_requested_end_at,
        'PENDING',
        'student',
        v_price_ttd,
        p_student_notes
    ) RETURNING id INTO v_booking_id;

    INSERT INTO public.booking_messages (booking_id, sender_id, message_type, body)
    VALUES (v_booking_id, p_student_id, 'system', 'Booking request created');

    RETURN jsonb_build_object('success', true, 'booking_id', v_booking_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.create_booking_request(uuid, uuid, uuid, uuid, timestamptz, timestamptz, text) TO authenticated;

COMMIT;

-- ============================================================
-- VERIFICATION (run after commit)
-- ============================================================
-- 1. No community tables remain:
--   SELECT tablename FROM pg_tables
--   WHERE schemaname = 'public'
--     AND (tablename LIKE '%communit%' OR tablename LIKE '%subject_communit%');
--
-- 2. No community columns on messages / conversations / bookings / sessions:
--   SELECT table_name, column_name
--   FROM information_schema.columns
--   WHERE table_schema = 'public'
--     AND column_name = 'community_id';
--
-- 3. message_type now only has 'dm':
--   SELECT unnest(enum_range(NULL::message_type))::text;
--
-- 4. Orphan functions removed:
--   SELECT proname FROM pg_proc p
--   JOIN pg_namespace n ON n.oid = p.pronamespace
--   WHERE n.nspname = 'public'
--     AND (prosrc ILIKE '%communit%'
--      OR proname ILIKE '%communit%'
--      OR proname IN ('increment_answer_count','decrement_answer_count','update_question_status','log_mod_action'));
-- ============================================================
