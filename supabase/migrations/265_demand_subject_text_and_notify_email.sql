-- =====================================================
-- 265_demand_subject_text_and_notify_email.sql
-- Demand Map: every request keeps its subject, every opt-in keeps an address
-- =====================================================
-- TWO SILENT LOSSES THIS CLOSES.
--
-- 1. "UNKNOWN SUBJECT". The wizard offers the curriculum list UNIONED with live
--    class subjects, so a family can pick "CSEC Mathematics" (a class's
--    spelling) as easily as "Mathematics" (subjects.name). Submit resolved the
--    pick with `subjects.name ILIKE <pick>`, which misses every class-spelled
--    option, and only the resolved subject_id was stored. The pick itself was
--    thrown away, so 22 of the first 96 production requests reached the Demand
--    Map as "Unknown subject" and could never be re-matched by resolve-demand.
--    Fix: store the text as picked, and resolve against name OR label with the
--    curriculum prefix stripped (lib/finder/demandSubject.ts).
--
-- 2. NOTIFY-ME FROM A VISITOR WITH NO ACCOUNT RECORDED NOTHING. The anonymous
--    button sent people to signup with `&intent=notify`, a parameter no code
--    ever read. Fix: the opt-in is recorded on the run's ledger row the moment
--    it is clicked (keyed by the httpOnly finder_token cookie), optionally with
--    an email address typed right there, and the claim attaches the account
--    later. resolve-demand emails the account's address, else notify_email.
-- =====================================================

ALTER TABLE public.finder_requests
  ADD COLUMN IF NOT EXISTS subject_text text;

ALTER TABLE public.demand_signals
  ADD COLUMN IF NOT EXISTS subject_text text,
  ADD COLUMN IF NOT EXISTS notify_email text,
  ADD COLUMN IF NOT EXISTS notify_requested_at timestamptz;

-- notify_count is used by resolve-demand; it exists on production already
-- (243) but is restated so this file stands alone on any environment.
ALTER TABLE public.demand_signals
  ADD COLUMN IF NOT EXISTS notify_count integer NOT NULL DEFAULT 0;

ALTER TABLE public.demand_signals
  DROP CONSTRAINT IF EXISTS demand_signals_notify_email_shape;
ALTER TABLE public.demand_signals
  ADD CONSTRAINT demand_signals_notify_email_shape
  CHECK (notify_email IS NULL OR (length(notify_email) <= 254 AND notify_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'));

CREATE INDEX IF NOT EXISTS idx_demand_notify_list
  ON public.demand_signals(notify_requested_at DESC)
  WHERE notify_optin;

COMMENT ON COLUMN public.demand_signals.subject_text IS
  'The subject exactly as the family picked it. subject_id is the canonical '
  'row it resolved to and may be null; this never is for new rows.';
COMMENT ON COLUMN public.demand_signals.notify_email IS
  'Address typed on the results screen by a visitor with no account. The '
  'account email (via user_id) wins when both exist.';

-- ---------------------------------------------------------------------
-- Backfill 1: opt-ins that predate notify_requested_at
-- ---------------------------------------------------------------------
UPDATE public.demand_signals
   SET notify_requested_at = created_at
 WHERE notify_optin AND notify_requested_at IS NULL;

-- ---------------------------------------------------------------------
-- Backfill 2: recover the picked subject from the finder_completed event
-- ---------------------------------------------------------------------
-- Every run emitted product_events.finder_completed with answers.subject, keyed
-- by the same anon_id / user_id, within seconds of the row.
UPDATE public.finder_requests fr
   SET subject_text = (
     SELECT pe.props->'answers'->>'subject'
       FROM public.product_events pe
      WHERE pe.event = 'finder_completed'
        AND pe.props->'answers'->>'subject' IS NOT NULL
        AND ((fr.anon_id IS NOT NULL AND pe.anon_id = fr.anon_id)
          OR (fr.user_id IS NOT NULL AND pe.user_id = fr.user_id))
        AND pe.created_at BETWEEN fr.created_at - interval '2 minutes'
                              AND fr.created_at + interval '2 minutes'
      ORDER BY abs(extract(epoch FROM pe.created_at - fr.created_at))
      LIMIT 1
   )
 WHERE fr.subject_text IS NULL
   AND fr.subject_id IS NULL;

-- Rows that did resolve: their subject is the canonical name.
UPDATE public.finder_requests fr
   SET subject_text = s.name
  FROM public.subjects s
 WHERE s.id = fr.subject_id AND fr.subject_text IS NULL;

-- ---------------------------------------------------------------------
-- Backfill 3: re-resolve subject_id the way lib/finder/demandSubject.ts does
-- ---------------------------------------------------------------------
-- Strip a leading CSEC/CAPE/SEA and any "(POB)" style suffix, compare to name
-- and label the same way, prefer the curriculum the level implies.
WITH picks AS (
  SELECT fr.id,
         fr.level,
         lower(trim(regexp_replace(regexp_replace(fr.subject_text, '\s*\([^)]*\)', '', 'g'),
                                   '^(csec|cape|sea)\s+', '', 'i'))) AS key
    FROM public.finder_requests fr
   WHERE fr.subject_id IS NULL AND fr.subject_text IS NOT NULL
),
candidates AS (
  SELECT s.id, s.curriculum,
         lower(trim(regexp_replace(regexp_replace(s.name, '\s*\([^)]*\)', '', 'g'),
                                   '^(csec|cape|sea)\s+', '', 'i'))) AS key_name,
         lower(trim(regexp_replace(regexp_replace(coalesce(s.label, ''), '\s*\([^)]*\)', '', 'g'),
                                   '^(csec|cape|sea)\s+', '', 'i'))) AS key_label
    FROM public.subjects s
),
best AS (
  SELECT DISTINCT ON (p.id) p.id AS request_id, c.id AS subject_id
    FROM picks p
    JOIN candidates c ON c.key_name = p.key OR c.key_label = p.key
   ORDER BY p.id,
            CASE
              WHEN p.level = 'CAPE' AND c.curriculum = 'CAPE' THEN 0
              WHEN p.level = 'SEA' AND c.curriculum ILIKE 'SEA%' THEN 0
              WHEN p.level LIKE 'FORM_%' AND c.curriculum = 'CSEC' THEN 0
              ELSE 1
            END,
            c.id
)
UPDATE public.finder_requests fr
   SET subject_id = best.subject_id
  FROM best
 WHERE fr.id = best.request_id;

-- Copy both onto the ledger.
UPDATE public.demand_signals ds
   SET subject_text = coalesce(ds.subject_text, fr.subject_text),
       subject_id   = coalesce(ds.subject_id, fr.subject_id)
  FROM public.finder_requests fr
 WHERE fr.id = ds.request_id
   AND (ds.subject_text IS NULL OR ds.subject_id IS NULL);
