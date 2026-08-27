-- 254 — Storage buckets for the AI series.
--
-- Three buckets, all private, following the pattern 033 established for
-- tutor-verifications. None of them is public: one holds licensed CXC
-- documents, one holds photographs of children's exam scripts, and one holds
-- generated work that has not been reviewed yet.
--
--   curriculum-source  reviewer/admin only. Licensed material (rule 4).
--                      Path: {source_id}/{filename}
--   ai-inputs          the user's own uploads. 30-day lifecycle — see the note
--                      at the bottom, this half is not SQL.
--                      Path: {user_id}/{job_id}/{filename}
--   ai-outputs         durable, user-scoped. Generated sheets, plans, marked
--                      results. Path: {user_id}/{job_id}/{filename}
--
-- Add-only.

insert into storage.buckets (id, name, public)
values
  ('curriculum-source', 'curriculum-source', false),
  ('ai-inputs',         'ai-inputs',         false),
  ('ai-outputs',        'ai-outputs',        false)
on conflict (id) do nothing;

-- ── curriculum-source ──────────────────────────────────────────────────────
--
-- No tutor policy and no student policy, by omission rather than oversight.
-- These are licensed documents; the ingestion scripts reach them with the
-- service role, which bypasses RLS. A student-role client must not be able to
-- so much as list this bucket, and with no SELECT policy granting them
-- anything, they cannot.

drop policy if exists "Reviewers read curriculum sources" on storage.objects;
create policy "Reviewers read curriculum sources"
on storage.objects for select
to authenticated
using (
  bucket_id = 'curriculum-source'
  and exists (
    select 1 from public.profiles
     where id = auth.uid()
       and (is_reviewer = true or role = 'admin')
  )
);

drop policy if exists "Reviewers upload curriculum sources" on storage.objects;
create policy "Reviewers upload curriculum sources"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'curriculum-source'
  and exists (
    select 1 from public.profiles
     where id = auth.uid()
       and (is_reviewer = true or role = 'admin')
  )
);

-- ── ai-inputs ──────────────────────────────────────────────────────────────
--
-- First path segment is the owner's id, as in 033. A tutor uploads scripts to
-- mark here and reads back only their own.

drop policy if exists "Users upload own ai inputs" on storage.objects;
create policy "Users upload own ai inputs"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'ai-inputs'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "Users read own ai inputs" on storage.objects;
create policy "Users read own ai inputs"
on storage.objects for select
to authenticated
using (
  bucket_id = 'ai-inputs'
  and (storage.foldername(name))[1] = auth.uid()::text
);

-- A re-take of a photograph replaces the bad one rather than accumulating.
drop policy if exists "Users delete own ai inputs" on storage.objects;
create policy "Users delete own ai inputs"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'ai-inputs'
  and (storage.foldername(name))[1] = auth.uid()::text
);

-- ── ai-outputs ─────────────────────────────────────────────────────────────
--
-- Read-only from the browser. The worker writes here with the service role;
-- nothing a user does should be able to alter a generated artifact in place,
-- because the job row points at it and the conversation cites it.

drop policy if exists "Users read own ai outputs" on storage.objects;
create policy "Users read own ai outputs"
on storage.objects for select
to authenticated
using (
  bucket_id = 'ai-outputs'
  and (storage.foldername(name))[1] = auth.uid()::text
);

-- ── Sanity ─────────────────────────────────────────────────────────────────

do $do$
declare found int;
begin
  select count(*) into found
    from storage.buckets
   where id in ('curriculum-source','ai-inputs','ai-outputs');

  if found <> 3 then
    raise exception '254: expected 3 AI buckets, found %', found;
  end if;

  if exists (
    select 1 from storage.buckets
     where id in ('curriculum-source','ai-inputs','ai-outputs') and public = true
  ) then
    raise exception '254: an AI bucket is public — licensed material and student work must not be';
  end if;

  raise notice '254: 3 private buckets ready. Set the 30-day lifecycle rule on ai-inputs by hand (see note).';
end $do$;

-- ── The half that is not SQL ───────────────────────────────────────────────
--
-- The 30-day lifecycle delete on ai-inputs cannot be expressed here. Supabase
-- Storage has no retention DDL; it is either a dashboard setting on the bucket
-- or a scheduled job. Until it is set, uploaded exam scripts accumulate
-- indefinitely, which is a privacy problem rather than a cost problem —
-- photographs of identifiable children's work.
--
-- Tracked as a launch blocker rather than silently assumed done.
