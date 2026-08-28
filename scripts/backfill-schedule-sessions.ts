/**
 * Backfill: turn a class's Settings schedule into real sessions.
 *
 * Every tutor who set their weekly times in Settings -> Schedule instead of
 * Sessions -> Add session ended up with a class that ADVERTISED a schedule and
 * generated nothing: no occurrences, so no join links, no reminder emails, no
 * attendance sheets, and nothing on a student's or parent's calendar. The code
 * fix (lib/classes/scheduleSessions.ts, wired into PATCH /api/groups/[groupId])
 * only covers saves from now on. This script fixes the classes already in that
 * state.
 *
 * Runs against whatever Supabase project .env.local points at — check that
 * before running it against production.
 *
 *   # every affected class, no writes
 *   npx ts-node scripts/backfill-schedule-sessions.ts
 *
 *   # one tutor, no writes
 *   npx ts-node scripts/backfill-schedule-sessions.ts --tutor=ms.name@example.com
 *
 *   # one class, write
 *   npx ts-node scripts/backfill-schedule-sessions.ts --group=<uuid> --apply
 *
 *   # everyone affected, write
 *   npx ts-node scripts/backfill-schedule-sessions.ts --apply
 *
 * The sync itself is add-only and idempotent: it never deletes or rewrites an
 * existing session, it skips a weekday+time already covered by a session the
 * tutor made by hand, and running it twice creates nothing the second time. So
 * a partial run is safe to repeat.
 */

// Resolves the `@/` alias the imported lib code uses. Must come first.
import './_alias';

import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';
import {
  normaliseScheduleEntries,
  scheduleEntriesToPatterns,
  syncScheduleSessions,
} from '../lib/classes/scheduleSessions';

const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function loadEnv(): void {
  const file = path.join(process.cwd(), '.env.local');
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf-8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

function argValue(name: string): string | null {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : null;
}

function describePatterns(scheduleData: unknown): string {
  const patterns = scheduleEntriesToPatterns(normaliseScheduleEntries(scheduleData));
  if (patterns.length === 0) return '(no usable entries)';
  return patterns
    .map((p) => `${p.days.map((d) => DAY_SHORT[d]).join('/')} ${p.time} (${p.durationMin}m)`)
    .join(', ');
}

async function main() {
  loadEnv();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  if (!url || !key) throw new Error('Missing Supabase env vars (NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)');

  const apply = process.argv.includes('--apply');
  const groupFilter = argValue('group');
  const tutorFilter = argValue('tutor');

  const admin = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  console.log(`Project: ${url}`);
  console.log(apply ? 'Mode:    APPLY (writing sessions)' : 'Mode:    dry run (no writes)');
  if (groupFilter) console.log(`Filter:  group ${groupFilter}`);
  if (tutorFilter) console.log(`Filter:  tutor ${tutorFilter}`);
  console.log('');

  // Resolve a tutor email to an id up front, so a typo fails loudly instead of
  // quietly matching nothing.
  let tutorId: string | null = null;
  if (tutorFilter) {
    const { data: tutor, error: tutorErr } = await admin
      .from('profiles')
      .select('id, full_name, email')
      .ilike('email', tutorFilter)
      .maybeSingle();
    if (tutorErr) throw tutorErr;
    if (!tutor) throw new Error(`No profile with email ${tutorFilter}`);
    tutorId = tutor.id;
    console.log(`Tutor:   ${tutor.full_name ?? '(no name)'} <${tutor.email}> ${tutor.id}\n`);
  }

  let query = admin
    .from('groups')
    .select('id, name, tutor_id, schedule_data, schedule_display, end_date, status, archived_at')
    .not('schedule_data', 'is', null);

  if (groupFilter) query = query.eq('id', groupFilter);
  if (tutorId) query = query.eq('tutor_id', tutorId);

  const { data: groups, error } = await query;
  if (error) throw error;

  if (!groups || groups.length === 0) {
    console.log('No classes with a Settings schedule matched.');
    return;
  }

  // Which of those already have sessions. A class with a hand-made session may
  // still be missing some of its schedule's days, so this is reported rather
  // than used to skip — the sync decides, slot by slot.
  const { data: sessionRows, error: sessErr } = await admin
    .from('group_sessions')
    .select('group_id')
    .in(
      'group_id',
      groups.map((g: any) => g.id)
    );
  if (sessErr) throw sessErr;
  const hasSessions = new Set((sessionRows ?? []).map((s: any) => String(s.group_id)));

  let fixed = 0;
  let sessionsCreated = 0;
  let occurrencesCreated = 0;
  let alreadyFine = 0;
  const failures: Array<{ id: string; name: string; detail?: string }> = [];

  for (const group of groups as any[]) {
    const label = `${group.name ?? '(untitled)'} [${group.id}]`;
    const archived = group.archived_at ? ' ARCHIVED' : '';
    const state = hasSessions.has(String(group.id)) ? 'has sessions' : 'NO SESSIONS';
    console.log(`- ${label}${archived}`);
    console.log(`    schedule: ${describePatterns(group.schedule_data)}`);
    console.log(`    calendar: ${state}${group.end_date ? ` · ends ${String(group.end_date).slice(0, 10)}` : ''}`);

    // An archived class has no students to notify and no lessons left to teach.
    if (group.archived_at) {
      console.log('    -> skipped (archived)');
      continue;
    }

    if (!apply) {
      // Report what a real run would do without touching anything. The sync is
      // the only thing that knows which slots are already covered, so a dry run
      // can only state the schedule and the current calendar state above.
      console.log('    -> would generate sessions for any uncovered day/time');
      continue;
    }

    const result = await syncScheduleSessions({
      service: admin,
      groupId: group.id,
      scheduleData: group.schedule_data,
      endDate: group.end_date ?? null,
    });

    if (!result.ok) {
      console.log(`    -> FAILED (${result.reason}): ${result.detail}`);
      failures.push({ id: group.id, name: group.name, detail: result.detail });
      continue;
    }

    if (result.createdSessions === 0) {
      console.log(`    -> nothing to do (${result.reason})`);
      alreadyFine += 1;
      continue;
    }

    console.log(
      `    -> created ${result.createdSessions} session series, ${result.createdOccurrences} occurrences` +
        (result.skipped.length > 0
          ? ` (left ${result.skipped.length} slot(s) to existing sessions)`
          : '')
    );
    fixed += 1;
    sessionsCreated += result.createdSessions;
    occurrencesCreated += result.createdOccurrences;
  }

  console.log('');
  console.log(`Classes with a Settings schedule: ${groups.length}`);
  if (apply) {
    console.log(`Classes fixed:                    ${fixed}`);
    console.log(`Session series created:           ${sessionsCreated}`);
    console.log(`Occurrences created:              ${occurrencesCreated}`);
    console.log(`Already complete:                 ${alreadyFine}`);
    if (failures.length > 0) {
      console.log(`\nFailures (${failures.length}) — safe to re-run, the sync is idempotent:`);
      for (const f of failures) console.log(`  ${f.name} [${f.id}]: ${f.detail}`);
      process.exitCode = 1;
    }
  } else {
    console.log('Dry run — re-run with --apply to write.');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
