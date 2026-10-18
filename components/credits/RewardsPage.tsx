'use client';

// The Rewards page, shared by /student/rewards and /parent/rewards.
//
// Top to bottom (spec §6): balance (with anything still in its hold period
// shown as pending), progress toward the next reward, the share card, the
// friends list (first name and initial only), the history, and how it works.
// Campaign codes are redeemed in the "Have a code?" box.
//
// While the referral programme is switched off, balances stay visible and
// spendable but the share card and progress are hidden.

import { useState } from 'react';
import Link from 'next/link';
import { Clock, Gift, Loader2, Sparkles, Users } from 'lucide-react';
import { cn } from '@/lib/utils';
import { fmtCredits, useCredits } from '@/lib/credits/useCredits';
import ShareCard from '@/components/credits/ShareCard';
import RedeemCodeBox from '@/components/credits/RedeemCodeBox';

const FRIEND_STATUS: Record<string, { label: string; tone: string }> = {
  signed_up: { label: 'Signed up', tone: 'bg-zinc-100 text-zinc-700' },
  paid: { label: 'Paid for a class', tone: 'bg-emerald-100 text-emerald-700' },
  rewarded: { label: 'Rewarded', tone: 'bg-brand/15 text-brand-deep' },
  not_eligible: { label: 'Not eligible', tone: 'bg-zinc-100 text-zinc-500' },
};

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-TT', { day: 'numeric', month: 'short', year: 'numeric' });
}

function Card({ title, children, className }: { title?: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn('rounded-2xl border border-border bg-background p-5 sm:p-6', className)}>
      {title ? <h2 className="mb-4 text-base font-bold text-ink">{title}</h2> : null}
      {children}
    </section>
  );
}

export default function RewardsPage({ role }: { role: 'student' | 'parent' }) {
  const { data, loading } = useCredits('full');
  const [showAllHistory, setShowAllHistory] = useState(false);

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground">
        <Loader2 className="mr-2 size-5 animate-spin" /> Loading your rewards…
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
  const progress = data.progress;
  const history = data.history ?? [];
  const shownHistory = showAllHistory ? history : history.slice(0, 8);
  const exploreHref = role === 'parent' ? '/parent/classes' : '/student/find-tutors';

  return (
    <div className="space-y-6">
      <Header />

      {data.suspended ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          This account is suspended, so credits cannot be earned or spent right now.
        </div>
      ) : null}

      {/* ── Balance ─────────────────────────────────────────────────── */}
      <Card>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="text-sm font-medium text-muted-foreground">Your credits</div>
            <div className="mt-1 text-4xl font-bold text-ink">{fmtCredits(wallet.available)}</div>
            <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
              {wallet.pending > 0 ? (
                <span className="inline-flex items-center gap-1">
                  <Clock className="size-3.5" /> {fmtCredits(wallet.pending)} pending
                </span>
              ) : null}
              {wallet.reserved > 0 ? <span>{fmtCredits(wallet.reserved)} held for a payment</span> : null}
            </div>
          </div>
          {wallet.available > 0 ? (
            <Link
              href={exploreHref}
              className="inline-flex items-center gap-2 rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-deep transition"
            >
              <Sparkles className="size-4" /> Use them on a class
            </Link>
          ) : null}
        </div>
        {wallet.pending > 0 && programme.hold_days > 0 ? (
          <p className="mt-3 text-xs text-muted-foreground">
            New rewards become spendable {programme.hold_days} day{programme.hold_days === 1 ? '' : 's'} after
            your friend pays.
          </p>
        ) : null}
      </Card>

      {/* ── Progress + share (programme on only) ────────────────────── */}
      {programme.referrals_enabled && data.referral && !data.suspended ? (
        <Card title="Invite friends, earn credits">
          {progress ? (
            <div className="mb-5 space-y-2">
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-sm font-semibold text-ink">
                  {progress.toward_next} of {progress.required} friend{progress.required === 1 ? '' : 's'} toward your next reward
                </span>
                <span className="text-sm font-semibold text-brand-deep">{fmtCredits(programme.credit_value_ttd)}</span>
              </div>
              <div className="h-2.5 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-400 transition-all"
                  style={{ width: `${Math.min(100, Math.round((progress.toward_next / Math.max(1, progress.required)) * 100))}%` }}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                A friend counts once they sign up with your link and pay for a class.
                {progress.rewards > 0 ? ` You have earned ${progress.rewards} reward${progress.rewards === 1 ? '' : 's'} so far.` : ''}
              </p>
            </div>
          ) : null}
          <ShareCard link={data.referral.link} />
        </Card>
      ) : null}

      {/* ── Have a code? ─────────────────────────────────────────────── */}
      {programme.campaign_codes_enabled && !data.suspended ? (
        <Card title="Have a code?">
          <RedeemCodeBox />
        </Card>
      ) : null}

      {/* ── Friends ──────────────────────────────────────────────────── */}
      {(data.friends ?? []).length > 0 ? (
        <Card title="Your friends">
          <ul className="divide-y divide-border">
            {(data.friends ?? []).map((f, i) => (
              <li key={i} className="flex items-center justify-between gap-3 py-2.5">
                <span className="inline-flex items-center gap-2 text-sm font-medium text-ink">
                  <Users className="size-4 text-muted-foreground" /> {f.name}
                </span>
                <span className="flex items-center gap-3">
                  <span className="hidden text-xs text-muted-foreground sm:inline">{fmtDate(f.at)}</span>
                  <span className={cn('rounded-full px-2.5 py-0.5 text-xs font-semibold', FRIEND_STATUS[f.status]?.tone)}>
                    {FRIEND_STATUS[f.status]?.label ?? f.status}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      {/* ── History ──────────────────────────────────────────────────── */}
      <Card title="History">
        {history.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No credits yet.{' '}
            {programme.referrals_enabled ? 'Share your link — you earn credits when friends join a class.' : ''}
          </p>
        ) : (
          <>
            <ul className="divide-y divide-border">
              {shownHistory.map((h) => (
                <li key={h.id} className="flex items-start justify-between gap-3 py-2.5">
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
              <button type="button" onClick={() => setShowAllHistory((v) => !v)} className="mt-3 text-sm font-semibold text-brand">
                {showAllHistory ? 'Show less' : `Show all ${history.length}`}
              </button>
            ) : null}
          </>
        )}
      </Card>

      {/* ── How it works ─────────────────────────────────────────────── */}
      <Card title="How it works">
        <ul className="space-y-2 text-sm text-muted-foreground">
          {programme.referrals_enabled ? (
            <li>
              • Share your link. When {programme.referrals_required === 1 ? 'a friend' : `${programme.referrals_required} friends`} sign up
              with it and pay at least {fmtCredits(programme.min_qualifying_cash_ttd)} for a group class, you earn{' '}
              {fmtCredits(programme.credit_value_ttd)} in credits.
            </li>
          ) : null}
          <li>• Credits pay for a whole payment: one month of a class, or your next monthly payment on a subscription. They can’t pay part of a payment, and they can’t start a new subscription.</li>
          <li>• Your tutor is still paid in full when you pay with credits.</li>
          <li>• Credits have no cash value, can’t be transferred, and can be taken back if a payment is refunded or for misuse.</li>
        </ul>
      </Card>
    </div>
  );
}

function Header() {
  return (
    <div>
      <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Rewards</div>
      <h1 className="mt-1 inline-flex items-center gap-2 text-2xl font-bold text-ink lg:text-3xl">
        <Gift className="size-6 text-brand" /> iTutor credits
      </h1>
      <p className="mt-1 text-sm text-muted-foreground">Earn credits by inviting friends, then use them on classes.</p>
    </div>
  );
}
