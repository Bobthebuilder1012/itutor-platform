-- 249 — CSEC Mathematics: the nine sections, and the documents we need.
--
-- Numbered 249, not the handoff's 218, for the reason given at the top of 248.
--
-- Two things are seeded here, and they are deliberately different in kind.
--
-- The nine section rows are hand-entered, not extracted. They are the syllabus's
-- own top-level structure, they are stable across amendments, and having them
-- present lets the review UI, the planner and the topic tagger be built and
-- demoed before a single PDF has been ingested. Sections are structure; the
-- ~120-180 topics beneath them are content, and those come from extraction with
-- verified_at NULL like everything else.
--
-- The curriculum_sources rows are registered EMPTY — storage_path null,
-- ingest_status REGISTERED. They are a shopping list. Someone with a CXC Store
-- account has to fetch the specimen papers, mark schemes and subject reports;
-- Claude Code cannot, and rule 4 forbids sourcing them anywhere else. Making
-- the gap a set of rows means it shows up in a query instead of living in
-- somebody's memory.
--
-- Idempotent: re-running inserts nothing twice.

do $do$
declare
  v_subject_id uuid;
  v_syllabus_id uuid;
  v_units int;
  v_sources int;
begin
  -- CSEC Mathematics, as seeded by 006. Matched on name + curriculum rather
  -- than on level, because the level string ('Form 4-5') is presentation text
  -- and has been edited before.
  select id into v_subject_id
    from public.subjects
   where name = 'Mathematics' and curriculum = 'CSEC'
   order by created_at
   limit 1;

  if v_subject_id is null then
    -- Not fatal. A branch database that has not run 006 should still be able to
    -- apply the AI series; the seed simply has nothing to attach to.
    raise notice '249: no CSEC Mathematics subject row found — spine seeded empty. Run 006 first, then re-run 249.';
    return;
  end if;

  -- ── The syllabus document ────────────────────────────────────────────────
  --
  -- This one is NOT blocked on a human. CXC publishes the amended syllabus free
  -- on cxc.org, and 030_seed_syllabuses.sql already records the URL. It is
  -- CXC_OFFICIAL rather than CXC_STORE: freely published, still CXC's.
  insert into public.curriculum_sources
    (subject_id, source_type, title, license, license_note, ingest_status)
  select
    v_subject_id, 'SYLLABUS', 'CSEC Mathematics Syllabus (Amended Oct 2025)',
    'CXC_OFFICIAL',
    'Published free by CXC at cxc.org — see 030_seed_syllabuses.sql for the URL.',
    'REGISTERED'
  where not exists (
    select 1 from public.curriculum_sources
     where subject_id = v_subject_id and source_type = 'SYLLABUS'
  );

  select id into v_syllabus_id
    from public.curriculum_sources
   where subject_id = v_subject_id and source_type = 'SYLLABUS'
   limit 1;

  -- ── The documents that ARE blocked on a human ────────────────────────────
  --
  -- Specimen papers, their mark schemes, and the subject reports that 1.4
  -- mines for common errors and examiner notes. All CXC Store downloads.
  insert into public.curriculum_sources
    (subject_id, source_type, title, exam_year, paper_number, license, license_note, ingest_status)
  select
    v_subject_id, d.source_type, d.title, d.exam_year, d.paper_number,
    'CXC_STORE',
    'Awaiting download from CXC Store. Do not source from anywhere else (rule 4).',
    'REGISTERED'
  from (values
    ('SPECIMEN_PAPER'::text, 'CSEC Mathematics Specimen Paper 1'::text, null::int, 1::int),
    ('SPECIMEN_PAPER',       'CSEC Mathematics Specimen Paper 2',       null,      2),
    ('MARK_SCHEME',          'CSEC Mathematics Specimen Paper 1 Mark Scheme', null, 1),
    ('MARK_SCHEME',          'CSEC Mathematics Specimen Paper 2 Mark Scheme', null, 2),
    ('SUBJECT_REPORT',       'CSEC Mathematics Subject Report 2024',    2024,      null),
    ('SUBJECT_REPORT',       'CSEC Mathematics Subject Report 2023',    2023,      null)
  ) as d(source_type, title, exam_year, paper_number)
  where not exists (
    select 1 from public.curriculum_sources cs
     where cs.subject_id = v_subject_id
       and cs.source_type = d.source_type
       and cs.title = d.title
  );

  -- ── The nine sections ────────────────────────────────────────────────────
  --
  -- Order is the syllabus's own presentation order. It is explicitly NOT a
  -- teaching order — that comes from the prerequisite edges a reviewer draws in
  -- 1.6, which is why order_index and the edge table are separate things.
  insert into public.curriculum_tree
    (subject_id, parent_id, node_type, code, title, order_index)
  select v_subject_id, null, 'UNIT', u.code, u.title, u.order_index
  from (values
    ('S1'::text, 'Number Theory and Computation'::text, 1::int),
    ('S2', 'Consumer Arithmetic',            2),
    ('S3', 'Sets',                           3),
    ('S4', 'Measurement',                    4),
    ('S5', 'Statistics',                     5),
    ('S6', 'Algebra',                        6),
    ('S7', 'Relations, Functions and Graphs', 7),
    ('S8', 'Geometry and Trigonometry',      8),
    ('S9', 'Vectors and Matrices',           9)
  ) as u(code, title, order_index)
  where not exists (
    select 1 from public.curriculum_tree ct
     where ct.subject_id = v_subject_id
       and ct.parent_id is null
       and ct.code = u.code
  );

  select count(*) into v_units
    from public.curriculum_tree
   where subject_id = v_subject_id and parent_id is null;

  select count(*) into v_sources
    from public.curriculum_sources
   where subject_id = v_subject_id;

  if v_units <> 9 then
    raise exception '249: expected 9 CSEC Mathematics unit rows, found %', v_units;
  end if;

  raise notice '249: CSEC Mathematics seeded — % units, % sources registered (syllabus %, rest awaiting CXC Store)',
    v_units, v_sources, coalesce(v_syllabus_id::text, 'none');
end $do$;
