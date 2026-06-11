-- Dev account flag: tutors/groups with this flag are hidden from non-dev users
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_dev_account boolean NOT NULL DEFAULT false;

-- Mark the platform dev/test account
UPDATE public.profiles
SET is_dev_account = true
WHERE email = 'jovangoodluck@myitutor.com';

COMMENT ON COLUMN public.profiles.is_dev_account IS
  'When true, this account and any groups it owns are hidden from users who are not also flagged as dev accounts.';
