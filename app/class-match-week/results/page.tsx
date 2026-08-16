/**
 * Class Match Week — results.
 *
 * The match is RE-RUN LIVE from the stored submission on every view rather
 * than replayed from a snapshot: sessions publish and cancel while the week
 * runs, and a shared or reloaded results link must reflect what is actually
 * bookable now. The submission is found by the HttpOnly `cmw_token` cookie the
 * submission route set — the visitor still has no account, so all reads go
 * through the service client (anonymous RLS returns zero rows, silently).
 *
 * Rendering rules: the no-match state is the MAJORITY outcome (~83% measured)
 * and is treated as a primary screen. Copy leads with what exists — when only
 * fallbacks match, the headline sells the available sessions and the mismatch
 * is per-card context, never an apology. Single-result is the norm at this
 * catalogue size, so cards sit in a single column that looks complete alone.
 */

import Link from 'next/link';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { getServiceClient } from '@/lib/supabase/server';
import { getLiveCampaign, getSubmissionByToken } from '@/lib/classMatchWeek/portalData';
import { runMatch } from '@/lib/classMatchWeek/matching';
import { levelLabel } from '@/lib/classMatchWeek/levels';
import { AVAILABILITY_BLOCKS, type AvailabilityBlock } from '@/lib/classMatchWeek/types';
import TeacherResultCard from '@/components/classMatchWeek/portal/TeacherResultCard';
import CountdownPill from '@/components/classMatchWeek/portal/CountdownPill';

export const dynamic = 'force-dynamic';

function CampaignBadge() {
  return (
    <span className="inline-flex rounded-full bg-brand-soft px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-brand-deep">
      Class Match Week
    </span>
  );
}

export default async function ClassMatchWeekResultsPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get('cmw_token')?.value;
  if (!token) redirect('/class-match-week');

  const admin = getServiceClient();
  const submission = await getSubmissionByToken(admin, token);
  if (!submission) redirect('/class-match-week');

  const role = submission.role === 'student' ? 'student' : 'parent';
  const level = submission.level;
  const subjects = submission.subjects ?? [];
  // The stored column is unconstrained text[]; keep only the six blocks the
  // matcher understands rather than passing through anything unexpected.
  const validBlocks = new Set<string>(AVAILABILITY_BLOCKS.map((b) => b.value));
  const availability = (submission.availability ?? []).filter((a): a is AvailabilityBlock =>
    validBlocks.has(a)
  );

  // A submission without the three matching answers cannot be matched — send
  // the visitor back into the questionnaire with their role intact.
  if (!level || subjects.length === 0 || availability.length === 0) {
    redirect(`/class-match-week/match?role=${role}`);
  }

  const [campaign, match] = await Promise.all([
    getLiveCampaign(admin),
    runMatch(admin, { level, subjects, availability }),
  ]);

  const exact = match.cards.filter((c) => c.tier === 'exact');
  const close = match.cards.filter((c) => c.tier === 'fallback_schedule');
  const classOnly = match.cards.filter((c) => c.tier === 'fallback_class');

  const whose = role === 'parent' ? 'your child’s' : 'your';
  const subjectList = subjects.join(', ');

  const header = (
    <>
      <div className="flex items-center justify-between gap-3">
        <Link
          href="/"
          className="inline-flex items-center gap-1 text-xs font-semibold text-ink-muted transition-colors hover:text-ink"
        >
          <ArrowLeft className="size-3.5" /> iTutor
        </Link>
        {campaign && (
          <CountdownPill startsAt={campaign.starts_at} endsAt={campaign.ends_at} size="sm" />
        )}
      </div>
      <div className="mt-6">
        <CampaignBadge />
      </div>
    </>
  );

  const changeAnswers = (
    <p className="mt-8 text-center text-xs text-ink-muted">
      Not quite right?{' '}
      <Link
        href={`/class-match-week/match?role=${role}`}
        className="font-semibold text-brand-deep underline underline-offset-2"
      >
        Change your answers
      </Link>
    </p>
  );

  // Nothing at any tier: still show something, and say plainly that the
  // request itself is the useful outcome — it is the demand signal that
  // decides which teachers get recruited next.
  if (match.cards.length === 0) {
    return (
      <main className="min-h-screen bg-background px-4 pb-16 pt-6">
        <div className="mx-auto w-full max-w-xl">
          {header}
          <h1 className="mt-3 text-2xl font-bold tracking-tight text-ink">
            Your request is in.
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-ink-muted">
            No {levelLabel(level)} classes in {subjectList} are running this week yet. Requests
            like yours decide which teachers iTutor brings on next, and new sessions can appear
            while the week runs — it&rsquo;s worth checking back.
          </p>
          <div className="mt-6 grid gap-3">
            <Link
              href="/"
              className="inline-flex items-center justify-center rounded-2xl bg-brand px-5 py-3.5 text-sm font-bold text-white transition-colors hover:bg-brand-deep"
            >
              Browse all tutors on iTutor
            </Link>
            <Link
              href={`/class-match-week/match?role=${role}`}
              className="inline-flex items-center justify-center rounded-2xl border border-border bg-white px-5 py-3.5 text-sm font-bold text-ink transition-colors hover:bg-mint"
            >
              Change my answers
            </Link>
          </div>
        </div>
      </main>
    );
  }

  // Copy leads with what exists. Exact matches get the direct headline; a
  // fallback-only page headlines the sessions that ARE running, with the
  // mismatch carried per card via mismatchNote — never an apology up top.
  let headline: string;
  let subline: string;
  if (exact.length > 0) {
    headline = 'Here are your matches.';
    subline = `Each is a free 30-minute session with a teacher whose ongoing class fits ${whose} level, subjects and schedule.`;
  } else if (close.length > 0) {
    headline = 'These teachers are running free sessions this week';
    subline = 'The times sit a little outside what you picked — each card says exactly how.';
  } else {
    headline = 'These teachers already teach your subject';
    subline =
      'No free session is scheduled for it this week, but their ongoing classes are open to join.';
  }

  return (
    <main className="min-h-screen bg-background px-4 pb-16 pt-6">
      <div className="mx-auto w-full max-w-xl">
        {header}
        <h1 className="mt-3 text-2xl font-bold tracking-tight text-ink">{headline}</h1>
        <p className="mt-2 text-sm leading-relaxed text-ink-muted">{subline}</p>

        {exact.length > 0 && (
          <div className="mt-6 grid gap-4">
            {exact.map((c) => (
              <TeacherResultCard key={`${c.tutorId}-${c.classId}`} card={c} />
            ))}
          </div>
        )}

        {close.length > 0 && (
          <section className="mt-8">
            {exact.length > 0 && <h2 className="text-sm font-bold text-ink">Close matches</h2>}
            <div className={`grid gap-4 ${exact.length > 0 ? 'mt-3' : 'mt-6'}`}>
              {close.map((c) => (
                <TeacherResultCard key={`${c.tutorId}-${c.classId}`} card={c} />
              ))}
            </div>
          </section>
        )}

        {classOnly.length > 0 && (
          <section className="mt-8">
            {/* Skip the section heading when the page headline already says it. */}
            {exact.length + close.length > 0 && (
              <h2 className="text-sm font-bold text-ink">Also teaching your subject</h2>
            )}
            <div className={`grid gap-4 ${exact.length + close.length > 0 ? 'mt-3' : 'mt-6'}`}>
              {classOnly.map((c) => (
                <TeacherResultCard key={`${c.tutorId}-${c.classId}`} card={c} />
              ))}
            </div>
          </section>
        )}

        {changeAnswers}
      </div>
    </main>
  );
}
