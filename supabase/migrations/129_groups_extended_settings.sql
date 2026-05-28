-- Extended class settings: bio, service fee, visibility enum, primary channel, feedback price

ALTER TABLE public.groups
  ADD COLUMN IF NOT EXISTS bio                  text,
  ADD COLUMN IF NOT EXISTS member_service_fee   numeric(10,2)  NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS visibility           text           NOT NULL DEFAULT 'public',
  ADD COLUMN IF NOT EXISTS primary_channel      text           NOT NULL DEFAULT 'native',
  ADD COLUMN IF NOT EXISTS parent_feedback_price numeric(10,2) NOT NULL DEFAULT 0;

ALTER TABLE public.groups
  ADD CONSTRAINT groups_visibility_check
  CHECK (visibility IN ('public', 'unlisted', 'private'))
  NOT VALID;

ALTER TABLE public.groups
  ADD CONSTRAINT groups_primary_channel_check
  CHECK (primary_channel IN ('native', 'whatsapp', 'classroom'))
  NOT VALID;
