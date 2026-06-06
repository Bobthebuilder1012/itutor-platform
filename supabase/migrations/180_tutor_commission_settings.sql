-- Global commission setting: one row stores the platform-wide default.
CREATE TABLE IF NOT EXISTS public.global_commission_settings (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  commission_mode  text        NOT NULL CHECK (commission_mode IN ('constant', 'reflexive')),
  commission_rate  numeric(5,2),
  updated_by       uuid,
  updated_at       timestamptz NOT NULL DEFAULT now()
);

-- Seed one default row (reflexive = existing tier-based logic)
INSERT INTO public.global_commission_settings (commission_mode, commission_rate)
SELECT 'reflexive', NULL
WHERE NOT EXISTS (SELECT 1 FROM public.global_commission_settings);

-- Per-tutor commission overrides and exception flag
CREATE TABLE IF NOT EXISTS public.tutor_commission_settings (
  id                      uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tutor_id                uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  commission_mode         text        NOT NULL CHECK (commission_mode IN ('constant', 'reflexive')),
  commission_rate         numeric(5,2),
  is_commission_exception boolean     NOT NULL DEFAULT false,
  created_by              uuid,
  updated_by              uuid,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tutor_id)
);

-- RLS: admin-only access
ALTER TABLE public.global_commission_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tutor_commission_settings   ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_global_commission" ON public.global_commission_settings
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "admin_tutor_commission" ON public.tutor_commission_settings
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );
