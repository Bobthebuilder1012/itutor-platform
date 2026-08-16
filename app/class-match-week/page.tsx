/**
 * Class Match Week — landing and role selection.
 *
 * Anonymous-facing: RLS returns zero rows to anonymous clients silently, so
 * the campaign is read here with the service client and passed down as props.
 * Nothing on this page queries Supabase from the browser.
 *
 * Role is asked ONCE, here, and never again — it flows into the submission via
 * the ?role= param and later into signup. The two tap targets are plain links
 * so the choice survives without any client state.
 */

import Link from 'next/link';
import { ArrowLeft, GraduationCap, UserRound } from 'lucide-react';
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

export default async function ClassMatchWeekPage() {
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
        </div>
      </div>
    </main>
  );
}
