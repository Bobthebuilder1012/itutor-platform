-- =====================================================================
-- 267_campaign_codes_link_tracking.sql
-- Named tracking links for social media, and the numbers behind them
-- =====================================================================
--
-- WHAT THIS IS
--
-- /r/[code] has been live since Find Your iTutor Phase 0. It records every
-- click as a `ref_click` product event and stamps the code into the visitor's
-- attribution cookie, which lands in profiles.first_touch at signup. It has
-- always looked codes up in campaign_codes, and has treated the table being
-- absent (42P01) as "accept any code raw". This creates that table.
--
-- One MAIN link per platform (is_primary), plus any number of optional
-- sub-links for a specific placement ("Bio link", "Story, tutor recruitment").
-- A platform's figures are the sum of all of its links, main link included.
--
-- WHAT CHANGES FOR LIVE TRAFFIC
--
-- Only the label on unknown codes: a code that is not in this table is now
-- recorded as 'unresolved' instead of 'unvalidated'. It still redirects. A
-- printed link must never 404.
--
-- Codes are lowercase. /r/ looks them up lowercased, so /r/Instagram and
-- /r/instagram are the same link.
--
-- The admin page is /admin/link-tracking; its API is
-- /api/admin/campaign-links. Both use the service role. Nothing here is
-- readable by anon or authenticated clients.
-- =====================================================================

begin;

create table if not exists public.campaign_codes (
  code          text        primary key
                            check (code ~ '^[a-z0-9][a-z0-9_-]{0,63}$'),
  -- instagram | tiktok | facebook today. Deliberately not an enum or a CHECK
  -- list: the Finder plan's creator / captain / school codes belong in this
  -- table too, and adding a platform should not need a migration.
  platform      text        not null
                            check (platform ~ '^[a-z0-9_]{1,32}$'),
  -- Null on a platform's main link; the placement name on a sub-link.
  label         text        check (label is null or length(label) between 1 and 120),
  is_primary    boolean     not null default false,
  -- /r/ uses this as utm_medium when the link carries none of its own.
  kind          text        not null default 'social',
  -- Null = the route's default landing page (FINDER_LANDING_PATH, /start).
  -- Same-origin paths only; /r/ re-checks this before redirecting.
  landing_path  text        check (
                              landing_path is null or (
                                left(landing_path, 1) = '/'
                                and left(landing_path, 2) not in ('//', '/\')
                                and position('://' in landing_path) = 0
                                and length(landing_path) <= 500
                              )
                            ),
  -- A retired link still redirects (it may be printed or pinned somewhere),
  -- it just stops carrying its landing override. Never delete a row: the
  -- clicks and signups recorded against its code would lose their name.
  active        boolean     not null default true,
  created_by    uuid        references public.profiles(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

comment on table public.campaign_codes is
  'Named /r/<code> tracking links. Clicks are product_events (event = ref_click, '
  'props->>code); signups are profiles whose first_touch->>ref is the code. '
  'Read by app/r/[code]/route.ts and /api/admin/campaign-links.';

-- One main link per platform.
create unique index if not exists campaign_codes_one_primary_per_platform
  on public.campaign_codes (platform)
  where is_primary;

create index if not exists campaign_codes_platform
  on public.campaign_codes (platform, created_at);

alter table public.campaign_codes enable row level security;

drop policy if exists "Service role manages campaign_codes" on public.campaign_codes;
create policy "Service role manages campaign_codes"
  on public.campaign_codes for all to service_role using (true) with check (true);

-- RLS already refuses these roles (no policy names them). Revoked as well so
-- the table never depends on a policy staying absent.
revoke all on public.campaign_codes from anon, authenticated;

-- The three main links. Short, readable codes, because a bio link is read by
-- people as well as tapped: myitutor.com/r/instagram.
insert into public.campaign_codes (code, platform, label, is_primary)
values
  ('instagram', 'instagram', null, true),
  ('tiktok',    'tiktok',    null, true),
  ('facebook',  'facebook',  null, true)
on conflict (code) do nothing;

-- ---------------------------------------------------------------------
-- campaign_link_stats(p_since)
--
-- One row per link, per platform, and one grand total, told apart by
-- `level` ('link' | 'platform' | 'total'). Links with no activity in the
-- window return no row; the caller fills zeros from campaign_codes.
--
--   clicks   — every recorded /r/ hit. Crawlers and HEAD requests are not
--              recorded by the route, so these are people (or near enough).
--   visitors — distinct itutor_anon ids among those clicks. Computed per
--              level, NOT summed: one person tapping both the Instagram bio
--              link and an Instagram story link is one Instagram visitor.
--   signups  — accounts whose FIRST tracked touch was this link, created in
--              the window. First touch is the agreed rule for signups.
--
-- p_since filters clicks by when they happened and signups by when the
-- account was created. Null = all time.
-- ---------------------------------------------------------------------
create or replace function public.campaign_link_stats(p_since timestamptz default null)
returns table (
  level    text,
  platform text,
  code     text,
  clicks   bigint,
  visitors bigint,
  signups  bigint
)
language sql
stable
security invoker
set search_path = public
as $$
  with units as (
    select c.platform, c.code, e.anon_id, null::uuid as profile_id, true as is_click
    from public.product_events e
    join public.campaign_codes c on c.code = e.props->>'code'
    where e.event = 'ref_click'
      and (p_since is null or e.created_at >= p_since)

    union all

    select c.platform, c.code, null::text, p.id, false
    from public.profiles p
    join public.campaign_codes c on c.code = p.first_touch->>'ref'
    where p.first_touch is not null
      and (p_since is null or p.created_at >= p_since)
  )
  select
    case
      when grouping(u.platform) = 1 then 'total'
      when grouping(u.code) = 1 then 'platform'
      else 'link'
    end,
    u.platform,
    u.code,
    count(*) filter (where u.is_click),
    count(distinct u.anon_id),
    count(distinct u.profile_id)
  from units u
  group by grouping sets ((u.platform, u.code), (u.platform), ())
$$;

comment on function public.campaign_link_stats(timestamptz) is
  'Per-link, per-platform and total clicks / unique visitors / first-touch signups '
  'for campaign_codes. Service role only; called by /api/admin/campaign-links.';

revoke all on function public.campaign_link_stats(timestamptz) from public, anon, authenticated;
grant execute on function public.campaign_link_stats(timestamptz) to service_role;

commit;
