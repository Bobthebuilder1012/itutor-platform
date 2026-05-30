create table if not exists public.group_promotions (
  id          uuid primary key default gen_random_uuid(),
  group_id    uuid not null references public.groups(id) on delete cascade,
  tutor_id    uuid not null references public.profiles(id) on delete cascade,
  kind        text not null check (kind in ('early-bird', 'time-limited', 'open-ended')),
  discount    integer not null check (discount > 0 and discount <= 100),
  student_cap integer,   -- early-bird only
  duration_days integer, -- time-limited only
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

alter table public.group_promotions enable row level security;

create policy "Tutors manage own promotions"
  on public.group_promotions
  for all
  using (tutor_id = auth.uid())
  with check (tutor_id = auth.uid());

create policy "Members view active promotions"
  on public.group_promotions
  for select
  using (active = true);
