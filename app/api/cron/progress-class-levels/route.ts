// GET /api/cron/progress-class-levels
// Headers: Authorization: Bearer <CRON_SECRET>
// Query:   ?dry_run=true                    report what would move, write nothing
//          ?dry_run=true&as_of=YYYY-MM-DD   ...as though Trinidad today were that date
//
// Daily at 04:15 UTC, which is 00:15 in Trinidad. Moves every Form 1–4 class up
// one form for each 1 July it has crossed, so a class made for Form 4 students
// reads "Form 5" in the school year those students sit CSEC.
//
// HOW IT KNOWS. groups.form_level_school_year (migration 262) is the school
// year in which form_level was last true. A class stamped 2026 and read in
// school year 2027 is one form behind. The move writes the new level and the
// new year in one statement, so a second run the same day, or on any day until
// the next 1 July, finds nothing to do. That is why it runs daily rather than
// once a year: a 1 July run that was missed or failed (a bad deploy, a
// timeout) heals itself the next morning, and every other day it costs one
// empty query.
//
// A class that missed several years (the job was off) moves several forms at
// once, capped at Form 5. levelAfter() owns the ladder. SEA, Form 5, CAPE and
// legacy free-text levels such as "CSEC (14–16)" never move, and are not even
// selected.
//
// WHO IS LEFT ALONE.
//   - Archived classes. Nobody is being taught there.
//   - Classes that end before this school year began. That cohort finished at
//     the level the class shows, and relabelling a finished Form 3 class
//     "Form 4" would misdescribe what was taught. If the tutor later moves the
//     end date past 1 July, the next run moves the class up, which is right:
//     the class carried on into the new year.
//   - DRAFT classes are NOT left alone. Their level has to be true on the day
//     they are published, whenever that is.
//
// COMPARE-AND-SWAP. The update is guarded on the level and year it read. A
// tutor who changed the level between the read and the write has told us the
// truth themselves (the migration 262 trigger re-stamps the year on their
// edit), and a level computed from the stale read must not overwrite it. That
// row counts as lost_race and is not retried; it has already left the
// candidate set.
//
// NO NOTIFICATIONS, NO EMAILS. Staging is a branch of production holding real
// addresses, and a class moving up on the day every student moves up is not
// news to anyone. Each move is recorded in group_activity_log as
// 'level_progressed', which is where "why does my class say Form 5 now?" gets
// answered. A failed log write is reported but does not undo the move: the
// level is the thing students see, the log is the thing support reads.
//
// Vercel fires crons only on production, so on staging this is run by hand.
// A dry run with as_of shows what a 1 July will do before it arrives:
//
//   curl -H "Authorization: Bearer $CRON_SECRET" \
//     "$APP_URL/api/cron/progress-class-levels?dry_run=true&as_of=2027-07-01"
//
// In a dry run `progressed` stays 0, because nothing moved; `rows` lists the
// classes that would. In a real run `rows` lists the classes that did.
//
// Without migration 262 (prod, until it is applied) the select fails on the
// missing column. The job answers 200 with skipped:'schema_missing' rather than
// a 500 every night that nobody can act on until the migration lands.

import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase/server';
import {
  PROGRESSING_LEVELS,
  levelAfter,
  schoolYearOf,
  schoolYearStart,
  trinidadToday,
} from '@/lib/classes/academicCalendar';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

/** Rows per select. */
const PAGE_SIZE = 500;

/**
 * Pages per run: 10,000 classes, far past anything that exists. A run that hits
 * it says so in errors[], and the rest move on the next run, since they are
 * still candidates.
 */
const MAX_PAGES = 20;

/**
 * No new class is started after this. It leaves room under maxDuration for the
 * one in flight, so a run is never killed between moving a class and logging
 * the move. Whatever is left is still a candidate tomorrow.
 */
const TIME_BUDGET_MS = 50_000;

const SOURCE = 'cron:progress-class-levels';

const COLUMNS = 'id, name, tutor_id, form_level, form_level_school_year, end_date';

interface CandidateRow {
  id: string;
  name: string | null;
  tutor_id: string | null;
  form_level: string;
  form_level_school_year: number;
  end_date: string | null;
}

interface ProgressRow {
  id: string;
  name: string | null;
  from: string;
  to: string;
  years: number;
}

interface ProgressResult {
  dry_run: boolean;
  today: string;
  school_year: number;
  candidates: number;
  progressed: number;
  lost_race: number;
  rows: ProgressRow[];
  errors: string[];
}

/**
 * The column is missing. 42703 is Postgres' undefined_column, which is what a
 * filter on form_level_school_year raises; PGRST204 is PostgREST refusing a
 * column absent from its schema cache.
 */
function isSchemaMismatch(error: unknown): boolean {
  const err = error as { code?: unknown; message?: unknown } | null;
  const code = String(err?.code ?? '');
  const message = String(err?.message ?? '').toLowerCase();
  return (
    code === '42703' ||
    code === 'PGRST204' ||
    message.includes('does not exist') ||
    message.includes('could not find')
  );
}

/** 'YYYY-MM-DD' naming a day that exists, so 2027-02-30 is refused, not rolled over. */
function isCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const params = request.nextUrl.searchParams;
  const dryRun = params.get('dry_run') === 'true';
  const asOf = params.get('as_of');

  // A pretend date is for looking only. A real run as of next July would stamp
  // classes with a school year that has not started (the service role's year
  // is kept by the trigger), and they would show a level their students are
  // not in yet, with nothing to put it back until the level is edited.
  if (asOf !== null) {
    if (!dryRun) {
      return NextResponse.json(
        { error: 'as_of is only allowed together with dry_run=true.' },
        { status: 400 },
      );
    }
    if (!isCalendarDate(asOf)) {
      return NextResponse.json(
        { error: 'as_of must be a real date written YYYY-MM-DD.' },
        { status: 400 },
      );
    }
  }

  const today = asOf ?? trinidadToday();
  const schoolYear = schoolYearOf(today);
  const yearStart = schoolYearStart(schoolYear);
  const service = getServiceClient();
  const startedAt = Date.now();

  const result: ProgressResult = {
    dry_run: dryRun,
    today,
    school_year: schoolYear,
    candidates: 0,
    progressed: 0,
    lost_race: 0,
    rows: [],
    errors: [],
  };

  // Keyset pages on id rather than offsets. A real run moves classes out of
  // the candidate set as it goes, so offset 500 of the second query is not
  // offset 500 of the first, and offset paging would skip a page's worth of
  // classes every time. Paging past the last id seen is stable whatever the
  // run has already written, and a class that errored or lost its race is
  // never fetched, or counted, twice.
  let cursor: string | null = null;
  let exhausted = false;
  let outOfTime = false;
  let failedMoves = 0;

  for (let page = 0; page < MAX_PAGES && !exhausted && !outOfTime; page++) {
    let query = service
      .from('groups')
      .select(COLUMNS)
      .is('archived_at', null)
      .in('form_level', [...PROGRESSING_LEVELS])
      .lt('form_level_school_year', schoolYear)
      .or(`end_date.is.null,end_date.gte.${yearStart}`);
    if (cursor) query = query.gt('id', cursor);

    const { data, error } = await query.order('id', { ascending: true }).limit(PAGE_SIZE);

    if (error) {
      if (isSchemaMismatch(error)) {
        console.warn('[progress-class-levels] groups.form_level_school_year is missing; skipped.', error.message);
        return NextResponse.json({ ...result, skipped: 'schema_missing' });
      }
      console.error('[progress-class-levels] candidate query failed:', error.message);
      return NextResponse.json({ ...result, error: error.message }, { status: 500 });
    }

    const batch = (data ?? []) as unknown as CandidateRow[];
    if (batch.length < PAGE_SIZE) exhausted = true;
    if (batch.length > 0) cursor = batch[batch.length - 1].id;

    for (const row of batch) {
      if (!dryRun && Date.now() - startedAt > TIME_BUDGET_MS) {
        outOfTime = true;
        result.errors.push(
          'Stopped at the time budget. The classes not reached are still candidates and move on the next run.',
        );
        break;
      }

      result.candidates += 1;

      const from = row.form_level;
      const stamped = Number(row.form_level_school_year);
      const years = schoolYear - stamped;
      const to = levelAfter(from, years);

      // The select only returns Form 1–4 rows a year or more behind, and every
      // one of those has a next form. This is the guard for the day either of
      // those stops being true, not a case that happens.
      if (!to || to === from) continue;

      const entry: ProgressRow = { id: row.id, name: row.name, from, to, years };

      if (dryRun) {
        result.rows.push(entry);
        continue;
      }

      const { data: moved, error: moveError } = await service
        .from('groups')
        .update({ form_level: to, form_level_school_year: schoolYear })
        .eq('id', row.id)
        .eq('form_level', from)
        .eq('form_level_school_year', stamped)
        .is('archived_at', null)
        .select('id');

      if (moveError) {
        failedMoves += 1;
        result.errors.push(`${row.id}: ${moveError.message}`);
        continue;
      }
      if (!moved || moved.length === 0) {
        result.lost_race += 1;
        continue;
      }

      result.progressed += 1;
      result.rows.push(entry);

      const { error: logError } = await service.from('group_activity_log').insert({
        group_id: row.id,
        tutor_id: row.tutor_id,
        action: 'level_progressed',
        details: {
          from,
          to,
          from_school_year: stamped,
          to_school_year: schoolYear,
          years,
          source: SOURCE,
        },
      });
      if (logError) {
        result.errors.push(`${row.id}: moved to ${to}, but the activity log write failed: ${logError.message}`);
      }
    }
  }

  if (!exhausted && !outOfTime) {
    result.errors.push(
      `Stopped after ${MAX_PAGES} pages of ${PAGE_SIZE}. ${
        dryRun ? 'Classes past that are not listed.' : 'Classes past that move on the next run.'
      }`,
    );
  }

  console.log('[progress-class-levels]', {
    dry_run: result.dry_run,
    today: result.today,
    school_year: result.school_year,
    candidates: result.candidates,
    progressed: result.progressed,
    lost_race: result.lost_race,
    errors: result.errors,
  });

  // A class that failed to move answers 500, so the run shows as failed on
  // Vercel's cron dashboard. A row-specific failure (a CHECK the row violates,
  // a trigger raising) recurs every night, and a 200 would let that class sit a
  // year behind with nobody told — the subscription cron was changed to 500 on
  // task failure for the same reason. A lost race, the time budget and the
  // page cap stay 200: those classes are still candidates for the next run.
  return NextResponse.json(result, { status: failedMoves > 0 ? 500 : 200 });
}
