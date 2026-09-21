-- =====================================================
-- MIGRATION 258: TEACHER ACTIVATION — TEACHER INVITES
-- =====================================================
-- The schema behind lib/teacherInvites/*: §4's Migration Dashboard, §5's 14-day
-- launch goal, and the TDR numerator.
--
-- WHY THIS IS NOT class_invites. 257 already took that name for a different
-- thing, and the two are genuinely different rather than redundant:
--
--   class_invites (257)   one row per LINK, many redemptions each. Answers
--                         "who shared this, and who tapped it".
--   teacher_invites (258) one row per invited PERSON. Answers "which people
--                         did this teacher invite, what happened to each, and
--                         how many actually joined".
--
-- §4 asks for Joined / Invited / Needs attention as counts of PEOPLE, and a
-- link row cannot answer any of them: it has no addressee, so it cannot be
-- pending, cannot bounce, and cannot be reminded. Hence a second table rather
-- than columns bolted onto the first.
--
-- One row per invited person, then. An addressed invitation is written when the
-- teacher sends it; a shared link has no row until a real person signs up
-- through it, at which point recordLinkArrival() writes one with source='link'
-- and the address finally known. That is why invitee_email is NOT NULL: every
-- row here describes somebody real.
--
-- Numbering: staging's head was 254, 255 and 256 are taken on other branches,
-- and 257 was claimed by class_invites while this was being written. Migration
-- numbers are not globally unique in this repo — 250 and 251 already mean
-- different things on staging and union-staging-payment — so check every branch
-- before claiming the next one.
-- =====================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.teacher_invites (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tutor_id            uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  -- Nullable on purpose: a teacher may invite before they have built the class.
  -- fulfil.ts teaches the row which class it produced when the student joins.
  group_id            uuid REFERENCES public.groups(id) ON DELETE SET NULL,

  invitee_email       text NOT NULL,
  invitee_name        text,
  -- What the teacher said this person is. claim.ts reconciles it against the
  -- account that actually shows up; the account wins.
  invitee_kind        text NOT NULL DEFAULT 'unknown'
                        CHECK (invitee_kind IN ('student','parent','unknown')),

  token               text NOT NULL UNIQUE,   -- 32 random bytes, base64url
  -- Null until the invitation is adopted onto an account. The row is written
  -- before the account exists, which is the whole point.
  user_id             uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  claimed_at          timestamptz,
  role                text NOT NULL DEFAULT 'student' CHECK (role IN ('student','parent')),
  -- For a parent invite, the child who actually took the place.
  joined_student_id   uuid REFERENCES public.profiles(id) ON DELETE SET NULL,

  status              text NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending','accepted','joined','declined','expired','revoked','failed')),

  delivery_state      text NOT NULL DEFAULT 'queued'
                        CHECK (delivery_state IN ('queued','sent','suppressed','send_failed','bounced','complained')),
  delivery_error      text,
  provider_message_id text,
  last_sent_at        timestamptz,
  send_count          integer NOT NULL DEFAULT 0 CHECK (send_count >= 0),

  source              text NOT NULL DEFAULT 'single'
                        CHECK (source IN ('single','csv','link','direct_add')),
  batch_id            uuid,

  expires_at          timestamptz NOT NULL DEFAULT (now() + interval '30 days'),
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  accepted_at         timestamptz,
  joined_at           timestamptz,
  revoked_at          timestamptz,

  -- A teacher cannot be credited with their own account. claim.ts checks this
  -- too, to keep an ordinary thing to do while testing out of the error log.
  CONSTRAINT teacher_invite_not_self       CHECK (user_id IS NULL OR user_id <> tutor_id),
  CONSTRAINT teacher_invite_not_self_joined CHECK (joined_student_id IS NULL OR joined_student_id <> tutor_id)
);

-- findOpenInvite() reads by claimant and by address, both narrowed to open
-- statuses and ordered by created_at — first teacher wins.
CREATE INDEX IF NOT EXISTS idx_teacher_invites_claimant
  ON public.teacher_invites (user_id, status, created_at);
CREATE INDEX IF NOT EXISTS idx_teacher_invites_email
  ON public.teacher_invites (invitee_email, status, created_at);
-- The teacher's dashboard, and the launch-goal count.
CREATE INDEX IF NOT EXISTS idx_teacher_invites_tutor
  ON public.teacher_invites (tutor_id, status);
CREATE INDEX IF NOT EXISTS idx_teacher_invites_group
  ON public.teacher_invites (group_id);

-- DELIBERATELY NO UNIQUE INDEX ON (tutor_id, invitee_email). Duplicates are a
-- thing this feature reports rather than refuses: 'duplicate' is an
-- AttentionReason in types.ts, and a teacher who re-adds an address in a second
-- CSV should see it flagged, not get a failed import.

-- The class's own shared link. One token per class, resolved by
-- adoptFromCookie() when somebody signs up carrying it.
ALTER TABLE public.groups ADD COLUMN IF NOT EXISTS invite_link_token text;
CREATE UNIQUE INDEX IF NOT EXISTS idx_groups_invite_link_token
  ON public.groups (invite_link_token) WHERE invite_link_token IS NOT NULL;

-- A cache of the moment a teacher first reached the goal, written once by
-- markGoalIfMet(). The rebuild query is below, so being wrong is recoverable.
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS launch_goal_met_at timestamptz;

-- Rebuild, should the cache ever need it:
--   UPDATE public.profiles p SET launch_goal_met_at = s.met_at
--   FROM (SELECT tutor_id, min(joined_at) AS met_at FROM (
--           SELECT tutor_id, joined_at,
--                  row_number() OVER (PARTITION BY tutor_id ORDER BY joined_at) AS n
--           FROM (SELECT DISTINCT ON (tutor_id, joined_student_id)
--                        tutor_id, joined_student_id, joined_at
--                 FROM public.teacher_invites
--                 WHERE status = 'joined' AND joined_student_id IS NOT NULL
--                 ORDER BY tutor_id, joined_student_id, joined_at) d
--         ) r WHERE n = 5 GROUP BY tutor_id) s
--   WHERE p.id = s.tutor_id AND p.launch_goal_met_at IS NULL;

-- RLS — defence in depth. Every module here uses the service role, which
-- bypasses this. What matters is that the token column is never readable from a
-- browser: anyone able to SELECT these rows could enumerate live invite tokens
-- and adopt other people's invitations. So the only policy is the teacher
-- reading their own rows, and there is no client write policy at all.
ALTER TABLE public.teacher_invites ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Tutor reads own class invites" ON public.teacher_invites;
CREATE POLICY "Tutor reads own class invites" ON public.teacher_invites
  FOR SELECT TO authenticated USING (tutor_id = auth.uid());

COMMIT;
