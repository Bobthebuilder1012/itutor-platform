/**
 * Class Match Week, explained to teachers.
 *
 * Public on purpose. It is the "more info" link from the My Business tab, and it
 * is also the page a teacher can be sent before they have an account — the
 * landing page's teacher card goes straight to signup, which is right for
 * someone already convinced and wrong for someone still deciding. This is where
 * deciding happens, and it ends in the same place.
 *
 * The campaign is read with the service client and passed down: RLS returns zero
 * rows to anonymous clients silently, so an anonymous read of the dates would
 * render a page with no dates on it and no error to explain why.
 *
 * Written against what the platform actually does. The discount terms are the
 * teacher's to set (migration 235), capacity defaults to unlimited, and
 * verification is deliberately not required to take part — so none of those are
 * promised differently here than the session form delivers.
 */

import Link from 'next/link';
import { ArrowLeft, ArrowRight, Check, Clock3, Users, Tag, CalendarDays } from 'lucide-react';
import { getServiceClient } from '@/lib/supabase/server';
import { getLiveCampaign } from '@/lib/classMatchWeek/portalData';
import CountdownPill from '@/components/classMatchWeek/portal/CountdownPill';
import { formatAstDate } from '@/lib/utils/scheduleFormat';

export const dynamic = 'force-dynamic';

const STEPS: ReadonlyArray<{ icon: React.ComponentType<{ className?: string }>; title: string; body: string }> = [
  {
    icon: CalendarDays,
    title: 'You schedule a free half hour',
    body: 'Pick one of your published classes and a time. We create the Google Meet link for you — you never paste one in.',
  },
  {
    icon: Users,
    title: 'Families reserve a spot',
    body: 'Parents and students answer a few questions about what they need, and your session is offered to the ones it fits. Cap the numbers or leave it open.',
  },
  {
    icon: Tag,
    title: 'Everyone who turns up unlocks your discount',
    body: 'You set the percentage, which of your classes it covers, how long the reduced price holds, and when the offer closes. It applies automatically at checkout.',
  },
];

export default async function ClassMatchWeekForTeachersPage() {
  const campaign = await getLiveCampaign(getServiceClient());

  const dateRange = campaign
    ? `${formatAstDate(new Date(campaign.starts_at), {
        month: 'long',
        day: 'numeric',
      })} – ${formatAstDate(new Date(campaign.ends_at), { month: 'long', day: 'numeric' })}`
    : null;

  return (
    <main className="min-h-screen bg-mint-wash px-4 pb-20 pt-20">
      <Link
        href="/class-match-week"
        className="fixed left-4 top-4 z-10 inline-flex items-center gap-1 rounded-full border border-border bg-white/90 px-3 py-1.5 text-xs font-semibold text-ink transition-colors hover:bg-mint"
      >
        <ArrowLeft className="size-3.5" /> Class Match Week
      </Link>

      <div className="mx-auto w-full max-w-2xl">
        <header className="text-center">
          <span className="inline-flex rounded-full bg-brand-soft px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-brand-deep">
            For teachers
          </span>
          <h1 className="mt-3 text-3xl font-bold tracking-tight text-ink sm:text-4xl">
            Fill your class with a free half hour
          </h1>
          {dateRange && (
            <p className="mt-2 text-sm font-semibold text-brand-deep">{dateRange}</p>
          )}
          <p className="mt-4 text-[15px] leading-relaxed text-ink-muted">
            For one week, families browsing iTutor can book a free 30-minute taster with you. They
            meet you before they commit — and the ones who turn up get a discount on the class you
            ran it for.
          </p>
          {campaign && (
            <div className="mt-4 flex justify-center">
              <CountdownPill startsAt={campaign.starts_at} endsAt={campaign.ends_at} />
            </div>
          )}
        </header>

        <section className="mt-10 space-y-3">
          {STEPS.map((step, i) => {
            const Icon = step.icon;
            return (
              <div
                key={step.title}
                className="flex items-start gap-4 rounded-3xl border border-border bg-white p-5"
              >
                <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-brand-soft text-brand-deep">
                  <Icon className="size-5" />
                </span>
                <div className="min-w-0">
                  <div className="text-[11px] font-bold uppercase tracking-wider text-brand-deep">
                    Step {i + 1}
                  </div>
                  <h2 className="mt-0.5 text-base font-bold text-ink">{step.title}</h2>
                  <p className="mt-1 text-sm leading-relaxed text-ink-muted">{step.body}</p>
                </div>
              </div>
            );
          })}
        </section>

        <section className="mt-8 rounded-3xl border border-border bg-white p-6">
          <h2 className="text-base font-bold text-ink">What you need</h2>
          <ul className="mt-3 space-y-2.5">
            {[
              'A complete iTutor profile — photo, bio, availability and your rate.',
              'Google Meet connected, so the session link can be created for you.',
              'At least one published class on monthly pricing to run the taster for.',
            ].map((need) => (
              <li key={need} className="flex items-start gap-2.5">
                <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-brand-soft text-brand-deep">
                  <Check className="size-3" />
                </span>
                <span className="text-sm leading-relaxed text-ink">{need}</span>
              </li>
            ))}
          </ul>
          <p className="mt-4 flex items-start gap-2 text-xs leading-relaxed text-ink-muted">
            <Clock3 className="mt-0.5 size-3.5 shrink-0" />
            You keep control of the offer: the discount percentage, which classes it covers, how long
            the reduced price lasts, and the date it stops being claimable are all yours to set on
            each session.
          </p>
        </section>

        <div className="mt-8 flex flex-col items-center gap-3">
          <Link
            href="/class-match-week/teach"
            className="inline-flex items-center gap-2 rounded-2xl bg-brand px-6 py-3.5 text-sm font-bold text-white transition-colors hover:bg-brand-deep"
          >
            Get started <ArrowRight className="size-4" />
          </Link>
          <p className="text-xs text-ink-muted">
            Already teaching on iTutor? This takes you straight to your campaign page.
          </p>
        </div>
      </div>
    </main>
  );
}
