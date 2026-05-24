/**
 * Migration smoke tests.
 *
 * These tests verify the SQL migration files exist, are non-empty,
 * and contain the expected DDL statements.  They do NOT require a
 * live Postgres connection; the integration against a real DB is
 * handled by `supabase db push` in CI.
 */

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const MIGRATIONS_DIR = path.resolve(__dirname, '../supabase/migrations');

function readMigration(filename: string): string {
  const p = path.join(MIGRATIONS_DIR, filename);
  expect(fs.existsSync(p), `Migration file ${filename} should exist`).toBe(true);
  return fs.readFileSync(p, 'utf-8');
}

describe('Migration: cleanup', () => {
  const sql = readMigration('20260523124600_ratings_comments_v2_cleanup.sql');

  it('drops tutor_feedback', () => {
    expect(sql).toContain('DROP TABLE IF EXISTS public.tutor_feedback CASCADE');
  });

  it('truncates rating_reactions and ratings', () => {
    expect(sql).toContain('TRUNCATE public.rating_reactions, public.ratings');
  });
});

describe('Migration: extend', () => {
  const sql = readMigration('20260523124601_ratings_comments_v2_extend.sql');

  it('creates tutor_format_preference enum', () => {
    expect(sql).toContain("CREATE TYPE public.tutor_format_preference");
    expect(sql).toContain("'both'");
    expect(sql).toContain("'classes_only'");
    expect(sql).toContain("'one_on_one_only'");
  });

  it('adds tutor_format_preference column to profiles', () => {
    expect(sql).toContain('ALTER TABLE public.profiles');
    expect(sql).toContain('ADD COLUMN tutor_format_preference');
  });

  it('creates index on tutor_format_preference for tutors', () => {
    expect(sql).toContain('idx_profiles_tutor_format_preference');
  });

  it('creates rating_reactions table if not exists', () => {
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS public.rating_reactions');
  });

  it('adds helpful_count to ratings', () => {
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS helpful_count');
  });

  it('adds reaction_type check constraint', () => {
    expect(sql).toContain("reaction_type IN ('like', 'dislike')");
  });

  it('creates unique index on rating_reactions(user_id, rating_id)', () => {
    expect(sql).toContain('uq_rating_reactions_user_rating');
  });
});

describe('Migration: create new tables', () => {
  const sql = readMigration('20260523124602_ratings_comments_v2_create.sql');

  it('creates class_ratings table', () => {
    expect(sql).toContain('CREATE TABLE public.class_ratings');
    expect(sql).toContain('UNIQUE (class_id, student_id, billing_period)');
  });

  it('creates rating_prompt_status enum', () => {
    expect(sql).toContain("CREATE TYPE public.rating_prompt_status AS ENUM");
    expect(sql).toContain("'pending'");
    expect(sql).toContain("'submitted'");
    expect(sql).toContain("'expired'");
    expect(sql).toContain("'dismissed'");
  });

  it('creates rating_prompts table', () => {
    expect(sql).toContain('CREATE TABLE public.rating_prompts');
    expect(sql).toContain('UNIQUE (student_id, class_id, billing_period)');
  });

  it('creates class_comments table with soft-delete columns', () => {
    expect(sql).toContain('CREATE TABLE public.class_comments');
    expect(sql).toContain('deleted_at');
    expect(sql).toContain('hidden_at');
    expect(sql).toContain('edited_at');
  });

  it('creates tutor_profile_comments table', () => {
    expect(sql).toContain('CREATE TABLE public.tutor_profile_comments');
    expect(sql).toContain('UNIQUE (session_id)');
  });

  it('creates comment_target_type enum', () => {
    expect(sql).toContain("CREATE TYPE public.comment_target_type AS ENUM");
    expect(sql).toContain("'class_comment'");
    expect(sql).toContain("'tutor_profile_comment'");
  });

  it('creates comment_replies table with one-reply-per-comment constraint', () => {
    expect(sql).toContain('CREATE TABLE public.comment_replies');
    expect(sql).toContain('UNIQUE (target_type, target_id)');
  });

  it('creates comment_reactions table', () => {
    expect(sql).toContain('CREATE TABLE public.comment_reactions');
    expect(sql).toContain('UNIQUE (target_type, target_id, user_id)');
  });

  it('creates comment_reports table with reason and status enums', () => {
    expect(sql).toContain('CREATE TABLE public.comment_reports');
    expect(sql).toContain("CREATE TYPE public.comment_report_reason");
    expect(sql).toContain("CREATE TYPE public.comment_report_status");
  });

  it('creates recompute_tutor_rating function', () => {
    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.recompute_tutor_rating');
  });

  it('creates triggers on ratings and class_ratings for tutor cache', () => {
    expect(sql).toContain('trg_ratings_recompute');
    expect(sql).toContain('trg_class_ratings_recompute');
  });

  it('adds rating_average and rating_count to groups', () => {
    expect(sql).toContain('ALTER TABLE public.groups');
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS rating_average');
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS rating_count');
  });

  it('creates trigger to sync comment like/dislike counts', () => {
    expect(sql).toContain('trg_comment_reactions_counts');
    expect(sql).toContain('trg_sync_comment_reaction_counts');
  });

  it('enables RLS on all new tables', () => {
    const tables = [
      'class_ratings',
      'rating_prompts',
      'class_comments',
      'tutor_profile_comments',
      'comment_replies',
      'comment_reactions',
      'comment_reports',
    ];
    for (const t of tables) {
      expect(sql, `RLS should be enabled on ${t}`).toContain(
        `ALTER TABLE public.${t} ENABLE ROW LEVEL SECURITY`
      );
    }
  });

  it('has public read policy for comments', () => {
    expect(sql).toContain('Anyone can read non-hidden class comments');
    expect(sql).toContain('Anyone can read non-hidden tutor comments');
    expect(sql).toContain('Anyone can read non-deleted replies');
  });

  it('has author-only update/delete policies', () => {
    expect(sql).toContain('Authors can update their own class comments');
    expect(sql).toContain('Authors can delete their own class comments');
  });

  it('restricts report reads to reporters and admins', () => {
    expect(sql).toContain('Reporters read their own reports');
    expect(sql).toContain('Admins read all reports');
  });
});
