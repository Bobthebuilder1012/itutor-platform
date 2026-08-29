/**
 * Class Match Week — landing and role selection.
 *
 * Anonymous-facing: RLS returns zero rows to anonymous clients silently, so
 * the campaign is read here with the service client and passed down as props.
 * Nothing on this page queries Supabase from the browser.
 *
 * Role is asked ONCE, here, and never again — it flows into the submission via
 * the ?role= param and later into signup. The two learner tap targets are plain
 * links so the choice survives without any client state.
 *
 * The teacher card is a THIRD tap target on a different axis. It is not a third
 * answer to "who is the learner", so it sits below the pair rather than in the
 * grid, and it goes to /class-match-week/teach — a decision-only route — rather
 * than into the questionnaire, which has no question a teacher can answer. It
 * appears in the pre-launch state too: supply is the campaign's constraint
 * (docs 00 §1), and the weeks before a campaign opens are exactly when a
 * teacher reading this page is worth the most.
 */

import Link from 'next/link';
import { ArrowLeft, ArrowRight, GraduationCap, Presentation, UserRound } from 'lucide-react';
import { getServiceClient } from '@/lib/supabase/server';
import { getLiveCampaign } from '@/lib/classMatchWeek/portalData';
import CountdownPill from '@/components/classMatchWeek/portal/CountdownPill';
import { formatAstDate } from '@/lib/utils/scheduleFormat';

export const dynamic = 'force-dynamic';

/** Persistent way back to the main site, per the portal-shell rule. */
function BackToItutor() {
  return (
    <Link
      href="/"
      className="fixed left-4 top-4 z-10 inline-flex items-center gap-1 rounded-full border border-border bg-white/90 px-3 py-1.5 text-xs font-semibold text-ink transition-colors hover:bg-mint"
    >
      <ArrowLeft className="size-3.5" /> iTutor
    </Link>
  );
}

function CampaignBadge() {
  return (
    <span className="inline-flex rounded-full bg-brand-soft px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-brand-deep">
      Class Match Week
    </span>
  );
}

/**
 * The supply side's way in.
 *
 * Styled as its own panel below a divider, not as a third card in the grid: the
 * grid answers one question and a teacher is not one of its answers. Quieter
 * than the learner cards — smaller icon, one line of copy — because a visitor
 * who is here to find a class should not have to read past it, while a teacher
 * scanning the page still finds it.
 */
function TeacherCallout() {
  return (
    <div className="mt-8 border-t border-border pt-6">
      <Link
        href="/class-match-week/teach"
        className="group flex items-center gap-4 rounded-3xl border border-border bg-white/70 p-4 transition hover:border-brand hover:bg-white hover:shadow-card"
      >
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-brand-deep">
          <Presentation className="size-5" />
        </span>
        <span className="min-w-0 flex-1 text-left">
          <span className="block text-sm font-bold text-ink">I&rsquo;m a teacher</span>
          <span className="block text-xs text-ink-muted">
            Offer a free taster and fill your class
          </span>
        </span>
        <ArrowRight className="size-4 shrink-0 text-ink-muted transition-transform group-hover:translate-x-0.5 group-hover:text-brand-deep" />
      </Link>
    </div>
  );
}

/**
 * Shown when /teach bounces a signed-in learner back here.
 *
 * `profiles.role` is fixed once set, so there is no teacher page to send a
 * student or parent account to. Saying so beats returning them to an unchanged
 * page, which would read as a button that does nothing.
 */
function TeacherAccountNotice() {
  return (
    <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-left">
      <p className="text-sm font-semibold text-amber-900">That account can&rsquo;t offer classes</p>
      <p className="mt-1 text-xs leading-relaxed text-amber-800">
        You&rsquo;re signed in with a learner account, and an account&rsquo;s role is fixed once
        it&rsquo;s created. Teaching a Class Match Week taster needs a teacher account — sign out and
        create one, or carry on below as a learner.
      </p>
    </div>
  );
}

export default async function ClassMatchWeekPage({
  searchParams,
}: {
  searchParams?: { teach?: string | string[] };
}) {
  const rawTeach = searchParams?.teach;
  const teachParam = Array.isArray(rawTeach) ? rawTeach[0] : rawTeach;
  const wrongAccountForTeaching = teachParam === 'needs-teacher-account';

  const campaign = await getLiveCampaign(getServiceClient());

  if (!campaign) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center bg-mint-wash px-4 py-16">
        <BackToItutor />
        <div className="w-full max-w-md rounded-3xl border border-border bg-white p-8 text-center shadow-card">
          <CampaignBadge />
          <h1 className="mt-4 text-2xl font-bold tracking-tight text-ink">Coming soon</h1>
          <p className="mt-3 text-sm leading-relaxed text-ink-muted">
            A week of free 30-minute sessions with real teachers — and if it clicks, a discount on
            their ongoing class. We&rsquo;re lining up the teachers now.
          </p>
          <Link
            href="/"
            className="mt-6 inline-flex rounded-2xl bg-brand px-5 py-3 text-sm font-bold text-white transition-colors hover:bg-brand-deep"
          >
            Explore iTutor
          </Link>
          {wrongAccountForTeaching && <TeacherAccountNotice />}
          {/* "Lining up the teachers now" is literal — this is where they sign up. */}
          <TeacherCallout />
        </div>
      </main>
    );
  }

  const dateRange = `${formatAstDate(new Date(campaign.starts_at), {
    month: 'long',
    day: 'numeric',
  })} – ${formatAstDate(new Date(campaign.ends_at), { month: 'long', day: 'numeric' })}`;

  return (
    <main className="min-h-screen bg-mint-wash px-4 pb-16 pt-20">
      <BackToItutor />
      <div className="mx-auto w-full max-w-md">
        <div className="text-center">
          <CampaignBadge />
          <h1 className="mt-3 text-3xl font-bold tracking-tight text-ink">{campaign.name}</h1>
          <p className="mt-1 text-sm font-semibold text-brand-deep">{dateRange}</p>
          <p className="mt-3 text-[15px] leading-relaxed text-ink-muted">
            Meet a teacher free for 30 minutes.
            <br />
            If it clicks, their ongoing class is discounted.
          </p>
          <div className="mt-4 flex justify-center">
            <CountdownPill startsAt={campaign.starts_at} endsAt={campaign.ends_at} />
          </div>
        </div>

        {wrongAccountForTeaching && <TeacherAccountNotice />}

        <div className="mt-10">
          <h2 className="text-center text-sm font-semibold text-ink">
            Who are we finding a teacher for?
          </h2>
          <div className="mt-3 grid gap-3">
            <Link
              href="/class-match-week/match?role=parent"
              className="flex items-center gap-4 rounded-3xl border border-border bg-white p-5 transition hover:border-brand hover:shadow-card"
            >
              <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-brand-soft text-brand-deep">
                <UserRound className="size-6" />
              </span>
              <span>
                <span className="block text-base font-bold text-ink">I&rsquo;m a parent</span>
                <span className="block text-xs text-ink-muted">Finding classes for my child</span>
              </span>
            </Link>
            <Link
              href="/class-match-week/match?role=student"
              className="flex items-center gap-4 rounded-3xl border border-border bg-white p-5 transition hover:border-brand hover:shadow-card"
            >
              <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-brand-soft text-brand-deep">
                <GraduationCap className="size-6" />
              </span>
              <span>
                <span className="block text-base font-bold text-ink">I&rsquo;m a student</span>
                <span className="block text-xs text-ink-muted">Finding classes for myself</span>
              </span>
            </Link>
          </div>

          <TeacherCallout />
        </div>
      </div>
    </main>
  );
}
