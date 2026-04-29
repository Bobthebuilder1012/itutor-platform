-- ============================================================
-- iTutor — Stream + Assignment Submission Full Migration
-- Run this in the Supabase SQL Editor
-- Safe to run multiple times (uses IF NOT EXISTS / ADD COLUMN IF NOT EXISTS)
-- Foreign key references removed for compatibility with your schema
-- ============================================================

-- ── STREAM POSTS ─────────────────────────────────────────────
create table if not exists stream_posts (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null,
  author_id uuid not null,
  author_role text not null default 'tutor',
  post_type text not null default 'announcement',
  message_body text not null default '',
  marks_available integer,
  due_date timestamptz,
  pinned_at timestamptz,
  pin_expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Add all columns that may be missing if table already existed
alter table stream_posts add column if not exists marks_available integer;
alter table stream_posts add column if not exists due_date timestamptz;
alter table stream_posts add column if not exists pinned_at timestamptz;
alter table stream_posts add column if not exists pin_expires_at timestamptz;

-- Drop ALL check constraints on post_type (brute-force, works regardless of name)
do $$
declare
  r record;
begin
  for r in
    select conname
    from pg_constraint
    where conrelid = 'stream_posts'::regclass and contype = 'c'
  loop
    execute 'alter table stream_posts drop constraint if exists ' || quote_ident(r.conname);
  end loop;
end;
$$;

-- Re-add with full set of allowed post types
alter table stream_posts
  add constraint stream_posts_post_type_check
  check (post_type in ('announcement', 'content', 'discussion', 'assignment'));

-- ── STREAM ATTACHMENTS ───────────────────────────────────────
create table if not exists stream_attachments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null,
  file_name text not null,
  file_url text not null,
  file_type text,
  file_size_bytes bigint,
  created_at timestamptz not null default now()
);

-- ── STREAM REPLIES ───────────────────────────────────────────
create table if not exists stream_replies (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null,
  author_id uuid not null,
  message_body text not null,
  parent_reply_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ── LESSON SUBMISSIONS ───────────────────────────────────────
create table if not exists lesson_submissions (
  id uuid primary key default gen_random_uuid(),
  lesson_id uuid,
  group_id uuid not null,
  post_id uuid not null,
  student_id uuid not null,
  file_url text not null,
  file_name text not null,
  files jsonb,
  submitted_at timestamptz not null default now(),
  status text not null default 'pending',
  score numeric,
  score_total numeric,
  result text,
  feedback jsonb,
  unique(post_id, student_id)
);

-- Add files column if table already existed without it
alter table lesson_submissions add column if not exists files jsonb;
alter table lesson_submissions add column if not exists lesson_id uuid;
alter table lesson_submissions add column if not exists submitted_at timestamptz;

alter table lesson_submissions enable row level security;

drop policy if exists "Students can submit their own work" on lesson_submissions;
create policy "Students can submit their own work"
  on lesson_submissions for insert
  with check (auth.uid() = student_id);

drop policy if exists "Students can update their own submission" on lesson_submissions;
create policy "Students can update their own submission"
  on lesson_submissions for update
  using (auth.uid() = student_id);

drop policy if exists "Students can view their own submission" on lesson_submissions;
create policy "Students can view their own submission"
  on lesson_submissions for select
  using (auth.uid() = student_id);

drop policy if exists "Service role full access to lesson_submissions" on lesson_submissions;
create policy "Service role full access to lesson_submissions"
  on lesson_submissions for all
  using (auth.role() = 'service_role');

-- ── AI GRADING RUNS ──────────────────────────────────────────
create table if not exists ai_grading_runs (
  id uuid primary key default gen_random_uuid(),
  group_id uuid,
  post_id uuid,
  tutor_id uuid,
  student_count integer,
  tokens_used integer,
  run_at timestamptz default now()
);

-- ── STORAGE POLICIES ─────────────────────────────────────────
-- First create the "submissions" bucket in Supabase dashboard:
--   Storage → New bucket → Name: submissions → Public: ON → 20MB limit
--   Allowed MIME types: image/jpeg, image/png, application/pdf
--
-- Then run the two policies below:

drop policy if exists "Students can upload their own submissions" on storage.objects;
create policy "Students can upload their own submissions"
  on storage.objects for insert
  with check (
    bucket_id = 'submissions'
    and auth.uid()::text = (string_to_array(name, '/'))[3]
  );

drop policy if exists "Anyone can view submissions" on storage.objects;
create policy "Anyone can view submissions"
  on storage.objects for select
  using (bucket_id = 'submissions');

drop policy if exists "Students can delete their own submissions" on storage.objects;
create policy "Students can delete their own submissions"
  on storage.objects for delete
  using (
    bucket_id = 'submissions'
    and auth.uid()::text = (string_to_array(name, '/'))[4]
  );

-- ── POST PRIVATE COMMENTS ─────────────────────────────────────
-- Per-post private comment threads between a student and their tutor.
-- student_id identifies whose thread the comment belongs to.
create table if not exists post_private_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null,
  student_id uuid not null,
  author_id uuid not null,
  content text not null,
  created_at timestamptz not null default now()
);

alter table post_private_comments enable row level security;

drop policy if exists "Service role full access to post_private_comments" on post_private_comments;
create policy "Service role full access to post_private_comments"
  on post_private_comments for all
  using (auth.role() = 'service_role');
