-- =====================================================
-- MARKETING CONSENT
-- =====================================================
-- The platform has never had a record of marketing consent for anyone.
-- Migration 226 was written to supply one and was never applied, so
-- `profiles.notification_preferences` exists nowhere in the public schema and
-- lib/customerio/attributes.ts carries a mapping that can never fire. Until
-- this lands, Customer.io's own unsubscribe footer is the only opt-out that
-- exists, and we hold no evidence of who agreed to what.
--
-- WHY DEFAULT TRUE, AND WHY THE BACKFILL
-- Decided with the owner. The ~300 existing accounts are customers of a
-- service they signed up for, and every lifecycle message carries Customer.io's
-- unsubscribe link. Defaulting to false instead would leave the three
-- activation ladders addressing nobody until new signups accumulated.
--
-- The two audit columns are the point. A backfilled `true` and a ticked box
-- are indistinguishable once written, and the first complaint is the wrong
-- moment to discover that. `marketing_consent_source` says which one this was.

-- WHY THE BACKFILL IS A COLUMN DEFAULT AND NOT AN UPDATE
-- An `UPDATE public.profiles SET ...` would touch every row and therefore fire
-- every row-level UPDATE trigger on the table. `profiles` carries triggers that
-- exist in NO migration in this repository -- auto_queue_onboarding_on_signup
-- among them, which queues onboarding email. It is AFTER INSERT on staging, so
-- an UPDATE is harmless there; but production has its own out-of-band history
-- and cannot be read from here to confirm it matches.
--
-- Filling the column through ADD COLUMN ... DEFAULT sidesteps the question
-- entirely: existing rows are populated as part of the DDL, no UPDATE runs, and
-- no row trigger fires whatever production happens to have. The default is then
-- dropped so NEW rows get NULL and only a real answer from the signup form ever
-- writes 'signup_form' -- otherwise every future account would be stamped as a
-- backfill.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS marketing_consent boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS marketing_consent_at timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS marketing_consent_source text DEFAULT 'backfill_existing_customer';

ALTER TABLE public.profiles ALTER COLUMN marketing_consent_at     DROP DEFAULT;
ALTER TABLE public.profiles ALTER COLUMN marketing_consent_source DROP DEFAULT;

COMMENT ON COLUMN public.profiles.marketing_consent IS
  'Gate for lifecycle/marketing email. Mapped onto Customer.io''s reserved '
  '`unsubscribed` attribute, so consent is enforced by Customer.io itself '
  'rather than by each campaign author remembering a filter.';

COMMENT ON COLUMN public.profiles.marketing_consent_source IS
  'How consent was obtained: signup_form | backfill_existing_customer | '
  'settings | admin. Without this a backfilled true cannot be told apart from '
  'an explicit one.';

-- No change is needed to the privileged-column guard (migration 217): it is a
-- deny-list over role, tutor_verification_status, is_suspended and
-- commission_rate, so a new column is self-editable by default -- which is
-- exactly what a consent flag has to be.
