/**
 * The school year, as far as a class's level and end date are concerned.
 *
 * School year Y runs 1 July Y to 30 June Y+1, on Trinidad wall-clock time. On
 * 1 July every Form 1–4 class moves up a form (see
 * app/api/cron/progress-class-levels), so a class's level is always the level
 * its students are in THIS school year.
 *
 * Pure and client-safe: the create page imports it to suggest an end date, the
 * cron imports it to decide who moves up. The SQL twin of schoolYearOf is
 * public.trinidad_school_year() in migration 262 — keep the two in step.
 *
 * Dates are 'YYYY-MM-DD' strings throughout, which is what the groups.end_date
 * DATE column takes, and which compare correctly as plain strings.
 */

import { trinidadToday } from '@/lib/payments/secureSpot';
import { LEVEL_LABELS } from '@/lib/utils/formatLevel';

export { trinidadToday };

/** Mirrors MAX_CLASS_YEARS in app/api/groups/route.ts and /api/tutor/classes/end-dates. */
export const MAX_CLASS_YEARS = 2;

/** The levels that move up on 1 July. SEA, FORM_5 and CAPE never do. */
export const PROGRESSING_LEVELS = ['FORM_1', 'FORM_2', 'FORM_3', 'FORM_4'] as const;
export type ProgressingLevel = (typeof PROGRESSING_LEVELS)[number];

const LADDER = ['FORM_1', 'FORM_2', 'FORM_3', 'FORM_4', 'FORM_5'] as const;

/**
 * A Form 1–3 suggestion closer than this rolls to the NEXT school year's end.
 * Created in late June, "the end of this school year" is days away — too short
 * to be what the tutor meant.
 */
const MIN_SUGGESTION_DAYS = 30;

function parseYmd(ymd: string): { year: number; month: number; day: number } {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!m) throw new RangeError(`Expected YYYY-MM-DD, got ${JSON.stringify(ymd)}`);
  return { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) };
}

function daysBetween(fromYmd: string, toYmd: string): number {
  const a = Date.parse(`${fromYmd}T00:00:00Z`);
  const b = Date.parse(`${toYmd}T00:00:00Z`);
  return Math.round((b - a) / 86_400_000);
}

/** The school year a date falls in, as Y for 1 Jul Y – 30 Jun Y+1. */
export function schoolYearOf(ymd: string): number {
  const { year, month } = parseYmd(ymd);
  return month >= 7 ? year : year - 1;
}

export const currentSchoolYear = (now: Date = new Date()): number => schoolYearOf(trinidadToday(now));
export const schoolYearStart = (y: number): string => `${y}-07-01`;
export const schoolYearEnd = (y: number): string => `${y + 1}-06-30`;

export type EndDateSuggestion = {
  date: string;
  /** Reads after "Suggested for Form 4: 30 April 2028, …". */
  reason: string;
  basis: 'school_year_end' | 'csec' | 'cape';
};

/**
 * The end date to offer a tutor creating a class at `level` on `todayYmd`.
 *
 *   Form 1–3  30 Jun at the end of this school year (next year's, if this
 *             year's is under 30 days away)
 *   Form 4    30 Apr two school years on — just before CSEC in Form 5
 *   Form 5    30 Apr this school year (next year's, if that has passed)
 *   CAPE      30 Apr two school years on — just before Unit 2
 *   anything else, SEA included: no suggestion
 *
 * Every date lands inside the API's two-year cap: the latest is 30 Apr Y+2,
 * and the cap for any day of school year Y is 1 Jul Y+2 or later.
 */
export function suggestEndDate(
  level: string | null | undefined,
  todayYmd: string,
): EndDateSuggestion | null {
  const y = schoolYearOf(todayYmd);
  switch (level) {
    case 'FORM_1':
    case 'FORM_2':
    case 'FORM_3': {
      let year = y;
      if (daysBetween(todayYmd, schoolYearEnd(year)) < MIN_SUGGESTION_DAYS) year += 1;
      return {
        date: schoolYearEnd(year),
        basis: 'school_year_end',
        reason: `the end of the ${schoolYearLabel(year)} school year`,
      };
    }
    case 'FORM_4':
      return {
        date: `${y + 2}-04-30`,
        basis: 'csec',
        reason: `just before CSEC exams begin in ${y + 2}`,
      };
    case 'FORM_5': {
      let date = `${y + 1}-04-30`;
      if (date <= todayYmd) date = `${y + 2}-04-30`;
      return { date, basis: 'csec', reason: `just before CSEC exams begin in ${date.slice(0, 4)}` };
    }
    case 'CAPE':
      return {
        date: `${y + 2}-04-30`,
        basis: 'cape',
        reason: `just before CAPE exams begin in ${y + 2}`,
      };
    default:
      return null;
  }
}

export function isProgressingLevel(level: string | null | undefined): level is ProgressingLevel {
  return (PROGRESSING_LEVELS as readonly string[]).includes(level ?? '');
}

/** The level after `years` 1-July boundaries. Anything that never moves comes back unchanged. */
export function levelAfter(level: string | null | undefined, years: number): string | null {
  if (!isProgressingLevel(level) || !Number.isInteger(years) || years <= 0) return level ?? null;
  return LADDER[Math.min(LADDER.indexOf(level) + years, LADDER.length - 1)];
}

/**
 * When a class stamped with `stampedYear` next moves up, or null if it never
 * does or ends first. Drives the "This class becomes Form 5 on 1 July" line.
 */
export function nextProgression(
  level: string | null | undefined,
  stampedYear: number,
  endDateYmd?: string | null,
): { toLevel: string; on: string } | null {
  if (!isProgressingLevel(level)) return null;
  const on = schoolYearStart(stampedYear + 1);
  if (endDateYmd && endDateYmd < on) return null;
  return { toLevel: levelAfter(level, 1)!, on };
}

/**
 * The latest end date the API accepts. Same arithmetic as POST /api/groups:
 * a UTC date moved on two calendar years, so 29 Feb + 2y is 1 Mar.
 */
export function maxClassEndDate(todayYmd: string): string {
  const d = new Date(`${todayYmd}T00:00:00Z`);
  d.setUTCFullYear(d.getUTCFullYear() + MAX_CLASS_YEARS);
  return d.toISOString().slice(0, 10);
}

/** "2026–27". */
export function schoolYearLabel(y: number): string {
  return `${y}–${String((y + 1) % 100).padStart(2, '0')}`;
}

/** "Form 4" from FORM_4 — the label without its age range. */
export function shortLevelLabel(level: string): string {
  return (LEVEL_LABELS[level] ?? level).replace(/\s*\(.*\)\s*$/, '');
}

/** "30 April 2028". Noon UTC so no zone can move it to another day. */
export function formatSchoolDate(ymd: string): string {
  return new Date(`${ymd}T12:00:00Z`).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}
