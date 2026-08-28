/**
 * Class Match Week — results.
 *
 * AUTHED TERRITORY now (owner's flow decision): the questionnaire ends at
 * signup, and results are the first page past it. An unauthenticated visitor
 * is sent to /class-match-week/signup — carrying ?session= so a tapped
 * Reserve resumes exactly where it happened.
 *
 * On every authed load the cookie-token submission is CLAIMED onto the
 * account (idempotent — docs 02 §2.4's last-write-wins rule): user_id +
 * claimed_at land on the row, and profiles.role is backfilled from the
 * questionnaire's role answer, which is why role is never asked again.
 *
 * The match is RE-RUN LIVE from the stored submission on every view rather
 * than replayed from a snapshot: sessions publish and cancel while the week
 * runs, and a shared or reloaded results link must reflect what is actually
 * bookable now. All reads go through the service client.
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
import { Compass } from 'lucide-react';
import { getServerClient, getServiceClient } from '@/lib/supabase/server';
import { getLiveCampaign, getSubmissionByToken } from '@/lib/classMatchWeek/portalData';
import { claimSubmission } from '@/lib/classMatchWeek/claim';
import { listUserReservations } from '@/lib/classMatchWeek/reservations';
import { runMatch } from '@/lib/classMatchWeek/matching';
import { levelLabel } from '@/lib/classMatchWeek/levels';
import { AVAILABILITY_BLOCKS, type AvailabilityBlock } from '@/lib/classMatchWeek/types';
import type { ClassMatchSubmission } from '@/lib/classMatchWeek/types';
import TeacherResultCard from '@/components/classMatchWeek/portal/TeacherResultCard';
import ScrollToAnchor from '@/components/classMatchWeek/portal/ScrollToAnchor';
import CountdownPill from '@/components/classMatchWeek/portal/CountdownPill';

export const dynamic = 'force-dynamic';

function CampaignBadge() {
  return (
    <span className="inline-flex rounded-full bg-brand-soft px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-brand-deep">
      Class Match Week
    </span>
  );
}

export default async function ClassMatchWeekResultsPage({
  searchParams,
}: {
  searchParams?: { session?: string | string[] };
}) {
  const rawSession = searchParams?.session;
  const sessionParam = Array.isArray(rawSession) ? rawSession[0] : rawSession;

  // Auth gate. The anonymous portion of the funnel ends at the questionnaire.
  const supabase = await getServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect(
      `/class-match-week/signup${sessionParam ? `?session=${encodeURIComponent(sessionParam)}` : ''}`
    );
  }

  const admin = getServiceClient();
  const cookieStore = await cookies();
  const token = cookieStore.get('cmw_token')?.value;

  // Claim the token submission onto this account (idempotent, never throws).
  let submission: ClassMatchSubmission | null = null;
  if (token) {
    const claimed = await claimSubmission(admin, { token, userId: user.id });
    submission = claimed.submission;
    if (!submission) submission = await getSubmissionByToken(admin, token);
  }

  // Cookie-less second device: fall back to the account's claimed submission.
  if (!submission) {
    const { data } = await admin
      .from('class_match_submissions')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    submission = (data as ClassMatchSubmission | null) ?? null;
  }

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

  const [campaign, match, reservations] = await Promise.all([
    getLiveCampaign(admin),
    runMatch(admin, { level, subjects, availability }),
    listUserReservations(admin, user.id),
  ]);

  const reservedSessionIds = reservations
    .filter((r) => r.status === 'reserved')
    .map((r) => r.session_id);

  // One ranked list of teachers. Subject is the only hard filter, so the split
  // is no longer "how well did you match" — it is simply whether a teacher has
  // a bookable free session this week. Suitability shows per card as reasons.
  const withSessions = match.cards.filter((c) => c.sessions.length > 0);
  const classOnly = match.cards.filter((c) => c.sessions.length === 0);

  // "Return to the card" (docs 03 §3.1): find which card carries the tapped
  // session so the page can anchor-scroll to it and emphasise the slot.
  const highlightCard = sessionParam
    ? match.cards.find((c) => c.sessions.some((s) => s.sessionId === sessionParam))
    : undefined;

  const whose = role === 'parent' ? 'your child’s' : 'your';
  const subjectList = subjects.join(', ');

  const header = (
    <>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link
            href="/class-match-week/explore"
            className="inline-flex items-center gap-1 text-xs font-semibold text-brand-deep hover:underline"
          >
            <Compass className="size-3.5" /> Browse everything
          </Link>
          {campaign && (
            <CountdownPill startsAt={campaign.starts_at} endsAt={campaign.ends_at} size="sm" />
          )}
        </div>
      </div>
      <div className="mt-6">
        <CampaignBadge />
      </div>
    </>
  );

  // No "change your answers" anywhere: the questionnaire is one-time. Browsing
  // the full catalogue is the escape hatch instead of retaking it.
  const browseAll = (
    <p className="mt-8 text-center text-xs text-ink-muted">
      Looking for something else?{' '}
      <Link
        href="/class-match-week/explore"
        className="font-semibold text-brand-deep underline underline-offset-2"
      >
        Browse every teacher this week
      </Link>
    </p>
  );

  // Nothing at any tier: still show something, and say plainly that the
  // request itself is the useful outcome — it is the demand signal that
  // decides which teachers get recruited next.
  if (match.cards.length === 0) {
    return (
      <main className="max-w-6xl mx-auto space-y-6">
      <div className="w-full">
          {header}
          <h1 className="mt-3 text-2xl lg:text-3xl font-bold text-ink">
            We don&rsquo;t teach {subjectList} yet.
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-ink-muted">
            That is the only reason this page is empty — nobody on iTutor teaches it so far.
            Requests like yours decide which teachers we bring on next, and yours is recorded.
          </p>
          <div className="mt-6 grid gap-3">
            <Link
              href="/class-match-week/explore"
              className="inline-flex items-center justify-center rounded-2xl bg-brand px-5 py-3.5 text-sm font-bold text-white transition-colors hover:bg-brand-deep"
            >
              See every subject running this week
            </Link>
          </div>
        </div>
      </main>
    );
  }

  // The page always leads with teachers, because subject is the only gate that
  // can empty it. Best fit is ordered, not filtered — each card carries its own
  // reasons, so a teacher at a different level or hour still appears and says so.
  const headline =
    withSessions.length > 0 ? 'Your teachers for Class Match Week' : 'Teachers for your subject';
  const subline =
    withSessions.length > 0
      ? `Ranked for ${whose} subject, level and times. Free 30-minute sessions — reserve any that suit.`
      : `Nobody has scheduled a free session in ${subjectList} this week, but these teachers run it as an ongoing class.`;

  const unsupportedNote =
    match.unsupportedSubjects.length > 0 && match.matchedSubjects.length > 0 ? (
      <p className="mt-3 rounded-xl bg-peach px-3 py-2 text-[11px] leading-relaxed text-[oklch(0.38_0.08_65)]">
        We don&rsquo;t teach {match.unsupportedSubjects.join(', ')} yet — that request is recorded.
        Below is everything for {match.matchedSubjects.join(', ')}.
      </p>
    ) : null;

  const renderCard = (c: (typeof match.cards)[number]) => (
    <TeacherResultCard
      key={`${c.tutorId}-${c.classId}`}
      card={c}
      authed
      reservedSessionIds={reservedSessionIds}
      highlightSessionId={sessionParam}
    />
  );

  return (
    <main className="max-w-6xl mx-auto space-y-6">
      <div className="w-full">
        {highlightCard && <ScrollToAnchor anchorId={`cmw-card-${highlightCard.classId}`} />}
        {header}
        <h1 className="mt-3 text-2xl lg:text-3xl font-bold text-ink">{headline}</h1>
        <p className="mt-2 text-sm leading-relaxed text-ink-muted">{subline}</p>
        {unsupportedNote}

        {withSessions.length > 0 && (
          <div className="mt-6 grid gap-4">{withSessions.map(renderCard)}</div>
        )}

        {classOnly.length > 0 && (
          <section className="mt-8">
            {/* Skip the section heading when the page headline already says it. */}
            {withSessions.length > 0 && (
              <h2 className="text-sm font-bold text-ink">Also teaching your subject</h2>
            )}
            <div className={`grid gap-4 ${withSessions.length > 0 ? 'mt-3' : 'mt-6'}`}>
              {classOnly.map(renderCard)}
            </div>
          </section>
        )}

        {browseAll}
      </div>
    </main>
  );
}
