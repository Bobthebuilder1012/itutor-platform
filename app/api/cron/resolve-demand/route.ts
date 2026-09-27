// =====================================================
// GET /api/cron/resolve-demand
// =====================================================
// The other half of the demand ledger.
//
// Every Finder run writes a demand_signals row. Without this job that table is
// a graveyard: a family told us they wanted CSEC Physics on a Saturday, we had
// nothing, they ticked "tell me when a class opens", and nothing ever tells
// them. The promise on that button is the only thing that makes recording
// unserved demand worth anything to the family rather than only to us.
//
// WHAT IT DOES. Re-runs the matcher over every unresolved signal against
// TODAY'S catalogue. A signal that now has an exact match is closed
// (resolved_at, resolved_by) and, if the family opted in, produces one email
// naming the class.
//
// WHY THE MATCHER AND NOT A SQL QUERY. The subject comparison is whole-word
// containment over normalised tokens, the level vocabularies are two, and
// availability is block overlap resolved through a three-tier schedule
// fallback. None of that survives translation to SQL, and a cheaper
// approximation here would announce classes the results page would not have
// shown — a family clicking through to a class that does not fit is worse than
// not being emailed.
//
// ONLY EXACT MATCHES CLOSE A SIGNAL. Not `near`, not `fallback`. The email says
// a class opened that fits what they asked for, and the whole point of those
// other two classifications is that they do not fit. Announcing them would
// train families to ignore the email, which is the one asset this job spends.
//
// Headers: Authorization: Bearer <CRON_SECRET>

import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase/server';
import { loadFinderSupply, type SupplyRow } from '@/lib/finder/supply';
import { matchFinderRequest, type FinderCandidate } from '@/lib/matching/finder';
import type { AvailabilityBlock } from '@/lib/matching/availability';
import type { CanonicalLevel } from '@/lib/matching/levels';
import type { DeliveryPref } from '@/lib/matching/delivery';
import { renderEmail } from '@/lib/email/design';
import { sendEmail } from '@/lib/services/emailService';

export const dynamic = 'force-dynamic';

/**
 * How many "a class opened" emails one signal may ever produce.
 *
 * One. A signal is closed the moment it is announced, so this is belt and
 * braces against a re-opened row or a bug that clears resolved_at — an opt-in
 * must never become an unsubscribe problem, and the family's remedy (running
 * the Finder again) is one tap.
 */
const MAX_NOTIFICATIONS = 1;

/**
 * Signals older than this are resolved but not announced.
 *
 * A family who asked in February does not want an email in November about a
 * class they no longer need — the child has moved up a year and the request is
 * about a level they have left. The signal still closes, because the ledger
 * should stop counting it as unmet demand, but silently.
 */
const NOTIFY_MAX_AGE_DAYS = 120;

/** Batch ceiling, so one run cannot send hundreds of emails or time out. */
const MAX_PER_RUN = 200;

const DAY_NAMES = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];

interface SignalRow {
  id: string;
  user_id: string | null;
  subject_id: string | null;
  level: string | null;
  availability_blocks: string[] | null;
  budget_max: number | string | null;
  delivery_pref?: string | null;
  notify_optin: boolean;
  notify_count?: number | null;
  created_at: string;
  subject: { name: string | null } | null;
}

/**
 * Two tiers, because delivery_pref and notify_count arrive in migration 243 and
 * a missing column fails the whole select. Unlike the read paths this one fails
 * invisibly — a cron returning 500 into a log nobody reads is how a feature
 * quietly stops existing.
 */
const SELECT_TIERS = [
  `id, user_id, subject_id, level, availability_blocks, budget_max, delivery_pref,
   notify_optin, notify_count, created_at, subject:subjects(name)`,
  `id, user_id, subject_id, level, availability_blocks, budget_max,
   notify_optin, created_at, subject:subjects(name)`,
];

function isSchemaMismatch(error: unknown): boolean {
  const err = error as { code?: unknown; message?: unknown } | null;
  const code = String(err?.code ?? '');
  const message = String(err?.message ?? '').toLowerCase();
  return (
    code === '42703' ||
    code === '42P01' ||
    code === 'PGRST204' ||
    code === 'PGRST205' ||
    message.includes('does not exist') ||
    message.includes('could not find')
  );
}

function toNumber(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

/** "Saturday 10:00, Sunday 14:00" — the fact the family is deciding on. */
function classTimes(row: SupplyRow): string {
  const entries = row.scheduleEntries ?? [];
  if (entries.length === 0) return 'Schedule to be confirmed';
  return entries
    .slice(0, 3)
    .map(entry => `${DAY_NAMES[entry.day] ?? 'Day'} ${entry.time}`)
    .join(', ');
}

function priceText(monthly: number | null): string {
  if (monthly === null || monthly === 0) return 'Free';
  return `$${Number.isInteger(monthly) ? monthly : monthly.toFixed(2)} TTD a month`;
}

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const service = getServiceClient();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? '';

  // 1. Unresolved signals, oldest first.
  let signals: SignalRow[] | null = null;

  for (const columns of SELECT_TIERS) {
    const { data, error } = await service
      .from('demand_signals')
      .select(columns)
      .is('resolved_at', null)
      .order('created_at', { ascending: true })
      .limit(MAX_PER_RUN);

    if (!error) {
      signals = (data ?? []) as unknown as SignalRow[];
      break;
    }
    if (!isSchemaMismatch(error)) {
      console.error('[resolve-demand] signal query failed:', error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  if (signals === null) {
    console.error('[resolve-demand] every select tier failed.');
    return NextResponse.json({ error: 'schema_unreadable' }, { status: 500 });
  }
  if (signals.length === 0) {
    return NextResponse.json({ examined: 0, resolved: 0, notified: 0 });
  }

  // 2. Today's catalogue, loaded ONCE. Same loader the wizard uses, so this job
  //    cannot announce a class the results page would have filtered out.
  const supply = await loadFinderSupply(service);
  if (supply.length === 0) {
    return NextResponse.json({ examined: signals.length, resolved: 0, notified: 0 });
  }
  const bySupplyId = new Map(supply.map(row => [row.groupId, row]));

  // 3. Re-match each signal.
  const now = Date.now();
  const notifyCutoff = now - NOTIFY_MAX_AGE_DAYS * 24 * 60 * 60 * 1000;
  const resolutions: Array<{ signal: SignalRow; match: SupplyRow }> = [];

  for (const signal of signals) {
    const subjectName = signal.subject?.name ?? null;

    // A signal with no resolvable subject cannot be re-matched. Left OPEN
    // rather than closed: closing it would delete the evidence of demand
    // without having served it, which is the one thing this table is for.
    if (!subjectName) continue;

    const verdict = matchFinderRequest(
      supply as FinderCandidate[],
      {
        subjectNames: [subjectName],
        level: (signal.level as CanonicalLevel | null) ?? null,
        availabilityBlocks: (signal.availability_blocks ?? []) as AvailabilityBlock[],
        budgetMax: toNumber(signal.budget_max),
        deliveryPref: (signal.delivery_pref as DeliveryPref | null) ?? null,
      },
      1
    );

    if (verdict.matchClass !== 'exact' || verdict.matches.length === 0) continue;

    const match = bySupplyId.get(verdict.matches[0].groupId);
    if (match) resolutions.push({ signal, match });
  }

  if (resolutions.length === 0) {
    return NextResponse.json({ examined: signals.length, resolved: 0, notified: 0 });
  }

  // 4. Close them, THEN email.
  //
  // This order is deliberate and is the opposite of what reads naturally.
  // Emailing first would mean a crash between the two steps re-sends the same
  // announcement on the next run; closing first means the worst case is a
  // family who is never told about a class they can still find for themselves.
  // An unwanted duplicate costs trust that a missing email does not.
  let resolved = 0;
  const notifiable: Array<{ signal: SignalRow; match: SupplyRow }> = [];

  for (const { signal, match } of resolutions) {
    const { error } = await service
      .from('demand_signals')
      .update({
        resolved_at: new Date().toISOString(),
        resolved_by: match.groupId,
      })
      .eq('id', signal.id)
      .is('resolved_at', null); // guard against a concurrent run

    if (error) {
      console.error(`[resolve-demand] could not close ${signal.id}:`, error.message);
      continue;
    }
    resolved += 1;

    const tooOld = Date.parse(signal.created_at) < notifyCutoff;
    const alreadyTold = (signal.notify_count ?? 0) >= MAX_NOTIFICATIONS;
    if (signal.notify_optin && signal.user_id && !tooOld && !alreadyTold) {
      notifiable.push({ signal, match });
    }
  }

  // 5. The emails.
  let notified = 0;

  for (const { signal, match } of notifiable) {
    // Read per-signal rather than batched: this loop is capped at MAX_PER_RUN
    // and the alternative is holding every family's address in memory to serve
    // the handful that are actually notifiable.
    const { data: profile } = await service
      .from('profiles')
      .select('email, full_name')
      .eq('id', signal.user_id as string)
      .maybeSingle();

    const to = (profile as { email?: string | null } | null)?.email ?? null;
    if (!to) continue;

    const fullName = (profile as { full_name?: string | null } | null)?.full_name ?? '';
    const firstName = fullName.split(' ')[0] || null;

    const rendered = renderEmail({
      family: 'service-announcement',
      subject: `A ${match.subject ?? 'new'} class just opened`,
      preheader: `${match.name} — ${classTimes(match)}`,
      heading: 'A class opened that fits',
      intro: firstName
        ? `${firstName}, you asked us to tell you. Here it is.`
        : 'You asked us to tell you. Here it is.',
      blocks: [
        {
          kind: 'card',
          title: match.name,
          lines: [
            `with ${match.tutorName ?? 'an iTutor'}`,
            classTimes(match),
            priceText(match.monthlyPrice),
          ],
        },
        {
          kind: 'paragraph',
          // Says WHY they are receiving it. An unexplained email about a class
          // weeks after the fact reads as spam even when it was requested.
          text:
            'This matches the subject, times and budget you gave us when you used ' +
            'Find your iTutor. Places are limited and go in the order people join.',
        },
      ],
      cta: {
        label: 'See the class',
        href: `${appUrl}/student/explore/${match.groupId}`,
      },
      secondary: {
        label: 'Change what you are looking for',
        href: `${appUrl}/find`,
      },
      closing:
        'You are getting this because you asked to be told when a class opened. ' +
        'This is the only email we will send about that request.',
    });

    const result = await sendEmail({
      to,
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
    });

    if (!result.success) {
      console.warn(`[resolve-demand] email failed for signal ${signal.id}`);
      continue;
    }

    notified += 1;

    // Non-fatal: the send has already happened, and failing the run here would
    // hide a successful announcement from the counters without undoing it.
    const { error: markError } = await service
      .from('demand_signals')
      .update({
        notified_at: new Date().toISOString(),
        notify_count: (signal.notify_count ?? 0) + 1,
      })
      .eq('id', signal.id);

    if (markError && isSchemaMismatch(markError)) {
      // Pre-243 database: notify_count does not exist yet. Fall back to the
      // column that does, so the send is still recorded somewhere.
      await service
        .from('demand_signals')
        .update({ notified_at: new Date().toISOString() })
        .eq('id', signal.id);
    } else if (markError) {
      console.warn(`[resolve-demand] notify mark failed for ${signal.id}:`, markError.message);
    }
  }

  return NextResponse.json({ examined: signals.length, resolved, notified });
}
