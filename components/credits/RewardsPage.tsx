'use client';

// The Rewards page, shared by /student/rewards and /parent/rewards.
//
// Top to bottom (spec §6): the balance as the hero (with anything still in its
// hold period shown as on the way), the invite card — three steps, progress
// toward the next reward, the share card — then "Have a code?", the friends
// list (first name and initial only), the history and the fine print.
//
// While the referral programme is switched off, balances stay visible and
// spendable but the invite card is hidden.
//
// Hierarchy is the design: one dark-green surface (the money), one card that
// asks for something (invite), everything else quiet. The balance rolls when
// it changes in front of you, never on load.

import { useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Clock, Gift, Lock, Share2, UserPlus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { fmtCredits, useCredits } from '@/lib/credits/useCredits';
import type { CreditsMePayload } from '@/lib/credits/types';
import AnimatedNumber, { formatTtd } from '@/components/credits/AnimatedNumber';
import ShareCard from '@/components/credits/ShareCard';
import RedeemCodeBox from '@/components/credits/RedeemCodeBox';
import { pressable } from '@/components/credits/press';

const FRIEND_STATUS: Record<string, { label: string; tone: string }> = {
  signed_up: { label: 'Signed up', tone: 'bg-zinc-100 text-zinc-700' },
  paid: { label: 'Paid for a class', tone: 'bg-emerald-100 text-emerald-800' },
  rewarded: { label: 'Rewarded', tone: 'bg-brand-soft text-brand-deep' },
  not_eligible: { label: 'Not eligible', tone: 'bg-zinc-100 text-zinc-500' },
};

/** Past this many, segments get too thin to read; a plain bar takes over. */
const MAX_SEGMENTS = 10;

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-TT', { day: 'numeric', month: 'short', year: 'numeric' });
}

/** "Maria S." → "MS"; "Jo" → "J". By grapheme, so an accented or emoji-first name stays whole. */
function initials(name: string) {
  const words = name.replace(/\./g, '').trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  const first = (w: string) => Array.from(w)[0]?.toUpperCase() ?? '';
  return words.length === 1 ? first(words[0]) : first(words[0]) + first(words[words.length - 1]);
}

function Card({ title, aside, children, className, id }: {
  title?: string;
  aside?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  id?: string;
}) {
  return (
    <section id={id} className={cn('scroll-mt-20 rounded-2xl border border-border bg-background p-5 sm:p-6', className)}>
      {title ? (
        <div className="mb-4 flex items-baseline justify-between gap-3">
          <h2 className="text-base font-bold tracking-tight text-ink">{title}</h2>
          {aside}
        </div>
      ) : null}
      {children}
    </section>
  );
}

export default function RewardsPage({ role }: { role: 'student' | 'parent' }) {
  const { data, loading } = useCredits('full');
  const [showAllHistory, setShowAllHistory] = useState(false);

  if (loading && !data) {
    // The page's own shape, not a spinner: the hero lands where the grey was.
    return (
      <div className="space-y-6" aria-busy="true" aria-label="Loading your rewards">
        <Header />
        <div className="h-48 animate-pulse rounded-3xl bg-muted motion-reduce:animate-none" />
        <div className="h-64 animate-pulse rounded-2xl bg-muted motion-reduce:animate-none" />
      </div>
    );
  }

  if (!data?.available) {
    return (
      <div className="space-y-6">
        <Header />
        <Card>
          <p className="text-sm text-muted-foreground">Rewards are not available yet. Check back soon.</p>
        </Card>
      </div>
    );
  }

  const programme = data.programme!;
  const wallet = data.wallet ?? { available: 0, pending: 0, reserved: 0 };
  const history = data.history ?? [];
  const friends = data.friends ?? [];
  const shownHistory = showAllHistory ? history : history.slice(0, 8);
  const exploreHref = role === 'parent' ? '/parent/classes' : '/student/find-tutors';
  const inviting = programme.referrals_enabled && Boolean(data.referral) && !data.suspended;

  return (
    <div className="space-y-6">
      <Header />

      {data.suspended ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          This account is suspended, so credits cannot be earned or spent right now.
        </div>
      ) : null}

      <BalanceHero
        wallet={wallet}
        programme={programme}
        exploreHref={exploreHref}
        inviting={inviting}
        suspended={Boolean(data.suspended)}
      />

      {inviting ? <InviteCard data={data} /> : null}

      {/* ── Have a code? ─────────────────────────────────────────────── */}
      {programme.campaign_codes_enabled && !data.suspended ? (
        <Card title="Have a code?">
          <RedeemCodeBox />
        </Card>
      ) : null}

      {/* ── Friends ──────────────────────────────────────────────────── */}
      {friends.length > 0 ? (
        <Card title="Your friends" aside={<span className="text-sm tabular-nums text-muted-foreground">{friends.length}</span>}>
          <ul className="divide-y divide-border">
            {friends.map((f, i) => {
              const status = FRIEND_STATUS[f.status];
              return (
                <li key={i} className="flex items-center gap-3 py-3">
                  <span
                    aria-hidden
                    className={cn(
                      'grid size-9 shrink-0 place-items-center rounded-full text-xs font-bold',
                      f.status === 'rewarded' || f.status === 'paid' ? 'bg-brand-soft text-brand-deep' : 'bg-muted text-muted-foreground'
                    )}
                  >
                    {initials(f.name)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-ink" title={f.name}>{f.name}</span>
                    <span className="block text-xs text-muted-foreground">Joined {fmtDate(f.at)}</span>
                  </span>
                  <span className={cn('shrink-0 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold', status?.tone ?? 'bg-zinc-100 text-zinc-700')}>
                    {status?.label ?? f.status}
                  </span>
                </li>
              );
            })}
          </ul>
        </Card>
      ) : null}

      {/* ── History ──────────────────────────────────────────────────── */}
      <Card title="History">
        {history.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No credits yet.
            {inviting ? ' Share your link — you earn credits when friends join a class.' : ''}
          </p>
        ) : (
          <>
            <ul className="divide-y divide-border">
              {shownHistory.map((h) => (
                <li key={h.id} className="flex items-start justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-ink">{h.label}</div>
                    <div className="text-xs text-muted-foreground">
                      {fmtDate(h.at)}
                      {h.detail ? ` · ${h.detail}` : ''}
                    </div>
                  </div>
                  <div
                    className={cn(
                      'shrink-0 text-sm font-semibold tabular-nums',
                      h.amount > 0 ? 'text-brand-deep' : h.amount < 0 ? 'text-ink' : 'text-muted-foreground',
                      h.status !== 'done' && 'opacity-70'
                    )}
                  >
                    {h.amount > 0 ? '+' : h.amount < 0 ? '−' : ''}
                    {fmtCredits(Math.abs(h.amount))}
                  </div>
                </li>
              ))}
            </ul>
            {history.length > 8 ? (
              <button
                type="button"
                onClick={() => setShowAllHistory((v) => !v)}
                className={cn('mt-3 rounded-lg px-1 text-sm font-semibold text-brand-deep hover:text-ink', pressable)}
              >
                {showAllHistory ? 'Show less' : `Show all ${history.length}`}
              </button>
            ) : null}
          </>
        )}
      </Card>

      {/* ── Fine print ───────────────────────────────────────────────── */}
      <Card title="Good to know">
        <ul className="space-y-2.5 text-sm text-muted-foreground">
          <li className="flex gap-2.5">
            <Lock className="mt-0.5 size-4 shrink-0" aria-hidden />
            <span>
              Credits pay for a whole payment: one month of a class, or your next monthly payment on a subscription.
              They can’t pay part of a payment, and they can’t start a new subscription.
            </span>
          </li>
          <li className="flex gap-2.5">
            <Gift className="mt-0.5 size-4 shrink-0" aria-hidden />
            <span>Your tutor is still paid in full when you pay with credits.</span>
          </li>
          <li className="flex gap-2.5">
            <Clock className="mt-0.5 size-4 shrink-0" aria-hidden />
            <span>Credits have no cash value, can’t be transferred, and can be taken back if a payment is refunded or for misuse.</span>
          </li>
        </ul>
      </Card>
    </div>
  );
}

// ── The balance ────────────────────────────────────────────────────────────

function BalanceHero({
  wallet,
  programme,
  exploreHref,
  inviting,
  suspended,
}: {
  wallet: { available: number; pending: number; reserved: number };
  programme: NonNullable<CreditsMePayload['programme']>;
  exploreHref: string;
  inviting: boolean;
  suspended: boolean;
}) {
  const empty = wallet.available <= 0;
  return (
    <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-brand-deep to-brand-dark p-6 text-white shadow-sm sm:p-8">
      {/* Decoration only: a large, faint gift anchored off the corner. */}
      <Gift aria-hidden className="pointer-events-none absolute -right-6 -top-6 size-40 rotate-12 text-white opacity-[0.08] sm:size-48" />

      <div className="relative">
        <div className="text-sm font-medium text-white/80">Your credits</div>
        <div className="mt-2 text-5xl font-bold leading-none tracking-[-0.03em] sm:text-6xl">
          <AnimatedNumber value={wallet.available} />
        </div>

        {wallet.pending > 0 || wallet.reserved > 0 ? (
          <div className="mt-4 flex flex-wrap gap-2">
            {wallet.pending > 0 ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-xs font-semibold tabular-nums">
                <Clock className="size-3.5" aria-hidden /> {fmtCredits(wallet.pending)} on the way
              </span>
            ) : null}
            {wallet.reserved > 0 ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-xs font-semibold tabular-nums">
                <Lock className="size-3.5" aria-hidden /> {fmtCredits(wallet.reserved)} held for a payment
              </span>
            ) : null}
          </div>
        ) : null}

        {wallet.pending > 0 && programme.hold_days > 0 ? (
          <p className="mt-3 max-w-md text-xs text-white/75">
            New rewards become spendable {plural(programme.hold_days, 'day')} after your friend pays.
          </p>
        ) : null}

        {suspended ? null : !empty ? (
          <Link
            href={exploreHref}
            className={cn(
              'mt-6 inline-flex h-11 items-center gap-2 rounded-xl bg-white px-5 text-sm font-semibold text-brand-deep shadow-sm hover:bg-white/90',
              pressable
            )}
          >
            Use them on a class <ArrowRight className="size-4" aria-hidden />
          </Link>
        ) : inviting ? (
          <a
            href="#invite"
            className={cn(
              'mt-6 inline-flex h-11 items-center gap-2 rounded-xl bg-white px-5 text-sm font-semibold text-brand-deep shadow-sm hover:bg-white/90',
              pressable
            )}
          >
            Earn {formatTtd(programme.credit_value_ttd, { compact: true })} <ArrowRight className="size-4" aria-hidden />
          </a>
        ) : null}
      </div>
    </section>
  );
}

// ── Invite friends ─────────────────────────────────────────────────────────

function InviteCard({ data }: { data: CreditsMePayload }) {
  const programme = data.programme!;
  const progress = data.progress;
  const reward = formatTtd(programme.credit_value_ttd, { compact: true });
  const required = Math.max(1, programme.referrals_required);

  const steps = [
    { icon: Share2, title: 'Share your link', body: 'On WhatsApp, Instagram, or show your QR code.' },
    {
      icon: UserPlus,
      title: 'A friend joins a class',
      body: `They sign up with your link and pay at least ${formatTtd(programme.min_qualifying_cash_ttd, { compact: true })} by card.`,
    },
    {
      icon: Gift,
      title: `You get ${reward}`,
      body: required === 1 ? 'For every friend who joins.' : `For every ${required} friends who join.`,
    },
  ];

  return (
    <Card id="invite" className="p-0 sm:p-0">
      <div className="p-5 sm:p-6">
        <h2 className="text-xl font-bold tracking-tight text-ink sm:text-2xl">Invite friends, earn {reward}</h2>
        <p className="mt-1 text-sm text-muted-foreground">Give a friend a great class. You both win.</p>

        <ol className="mt-5 grid gap-4 sm:grid-cols-3 sm:gap-3">
          {steps.map((s, i) => (
            <li key={s.title} className="flex gap-3 sm:flex-col sm:gap-2">
              <span className="relative grid size-10 shrink-0 place-items-center rounded-full bg-brand-soft text-brand-deep">
                <s.icon className="size-5" aria-hidden />
                <span className="absolute -right-1 -top-1 grid size-5 place-items-center rounded-full bg-brand-deep text-[11px] font-bold text-white tabular-nums">
                  {i + 1}
                </span>
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-ink">{s.title}</span>
                <span className="block text-xs leading-relaxed text-muted-foreground">{s.body}</span>
              </span>
            </li>
          ))}
        </ol>
      </div>

      {progress ? <Progress progress={progress} required={required} reward={reward} /> : null}

      <div className="p-5 sm:p-6">
        <ShareCard link={data.referral!.link} />
      </div>
    </Card>
  );
}

function Progress({
  progress,
  required,
  reward,
}: {
  progress: NonNullable<CreditsMePayload['progress']>;
  required: number;
  reward: string;
}) {
  const done = Math.min(progress.toward_next, required);
  const left = required - done;
  const segmented = required <= MAX_SEGMENTS;

  return (
    <div className="border-y border-border bg-zinc-50 px-5 py-4 sm:px-6">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <span className="text-sm font-semibold text-ink">
          {required === 1
            ? `Your next friend earns you ${reward}`
            : left === 0
              ? `Your next reward is on its way`
              : `${plural(left, 'more friend')} to your next ${reward}`}
        </span>
        {required > 1 ? (
          <span className="text-xs font-semibold tabular-nums text-muted-foreground">
            {done} of {required}
          </span>
        ) : null}
      </div>

      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={required}
        aria-valuenow={done}
        aria-label={`${done} of ${required} friends toward your next reward`}
        className="mt-3"
      >
        {segmented ? (
          <div className="flex gap-1.5">
            {Array.from({ length: required }, (_, i) => (
              <span
                key={i}
                className={cn(
                  'h-2 flex-1 rounded-full transition-colors duration-300 ease-out',
                  i < done ? 'bg-brand' : 'bg-zinc-200'
                )}
              />
            ))}
          </div>
        ) : (
          <div className="h-2 overflow-hidden rounded-full bg-zinc-200">
            <div
              className="h-full origin-left rounded-full bg-brand transition-transform duration-500 ease-[cubic-bezier(0.23,1,0.32,1)]"
              style={{ transform: `scaleX(${done / required})` }}
            />
          </div>
        )}
      </div>

      {progress.rewards > 0 || progress.friends > 0 ? (
        <p className="mt-2 text-xs text-muted-foreground">
          {progress.friends > 0 ? `${plural(progress.friends, 'friend')} joined with your link` : ''}
          {progress.friends > 0 && progress.rewards > 0 ? ' · ' : ''}
          {progress.rewards > 0 ? `${plural(progress.rewards, 'reward')} earned` : ''}
        </p>
      ) : null}
    </div>
  );
}

function Header() {
  return (
    <div>
      <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Rewards</div>
      <h1 className="mt-1 text-2xl font-bold tracking-tight text-ink lg:text-3xl">iTutor credits</h1>
      <p className="mt-1 text-sm text-muted-foreground">Earn credits by inviting friends, then use them on classes.</p>
    </div>
  );
}
