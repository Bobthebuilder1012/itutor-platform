/**
 * Class Match Week — learner dashboard (docs/class-match-week/04 §4.1).
 *
 * Auth-gated: the anonymous phase of the campaign ends at questionnaire Q5,
 * and everything from results onward requires an account. No user → the
 * campaign signup screen, carrying a same-origin ?redirect= back here (the
 * repo's param — never ?next=).
 *
 * All reads go through the service client (RLS on the campaign tables yields
 * zero rows to anon, silently) and every figure on the page is computed here,
 * server-side. The only browser work is the imminent strip's minute tick,
 * which is pure client time math on props — this page never fetches from the
 * browser.
 *
 * On every authed load the cmw_token cookie, when present, is claimed onto
 * the account via claimSubmission — idempotent and never-throwing by
 * contract — so a submission made anonymously on this device is attached to
 * the user before anything tries to read it back by user_id.
 */

import Link from 'next/link';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { ArrowLeft, CalendarDays, ChevronRight } from 'lucide-react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getServerClient, getServiceClient } from '@/lib/supabase/server';
import { getLiveCampaign } from '@/lib/classMatchWeek/portalData';
import { claimSubmission } from '@/lib/classMatchWeek/claim';
import { listUserReservations } from '@/lib/classMatchWeek/reservations';
import { listUserCoupons } from '@/lib/classMatchWeek/coupons';
import type { ClassMatchSubmission } from '@/lib/classMatchWeek/types';
import { formatAstDate, formatAstTimeRange } from '@/lib/utils/scheduleFormat';
import CountdownPill from '@/components/classMatchWeek/portal/CountdownPill';
import ImminentStrip from '@/components/classMatchWeek/portal/ImminentStrip';
import SavingsHero from '@/components/classMatchWeek/portal/SavingsHero';

export const dynamic = 'force-dynamic';

const JOIN_WINDOW_MS = 2 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

type CouponEntry = Awaited<ReturnType<typeof listUserCoupons>>[number];

type CouponState =
  | { kind: 'redeemed' }
  | { kind: 'expired' }
  | { kind: 'active'; daysLeft: number; expiresToday: boolean; urgent: boolean };

function couponState(coupon: CouponEntry, nowMs: number): CouponState {
  if (coupon.redeemedAt) return { kind: 'redeemed' };
  // Pre-233 coupons can carry no expiry; treat "no deadline" as expired-never,
  // i.e. active with the longest horizon we ever display.
  if (!coupon.expiresAt) return { kind: 'active', daysLeft: 30, expiresToday: false, urgent: false };
  const exp = new Date(coupon.expiresAt).getTime();
  if (!Number.isFinite(exp) || exp <= nowMs) return { kind: 'expired' };
  const msLeft = exp - nowMs;
  const daysLeft = Math.max(1, Math.ceil(msLeft / DAY_MS));
  // Expiry is the sharpest conversion lever available — urgent tone at ≤5 days.
  return { kind: 'active', daysLeft, expiresToday: msLeft < DAY_MS, urgent: daysLeft <= 5 };
}

/**
 * The user's submission: claim the cookie token onto the account first (safe —
 * idempotent, never throws, last-write-wins per docs 02 §2.4), then fall back
 * to the newest row already claimed by this user, which covers a sign-in on a
 * device that never held the cookie.
 */
async function resolveSubmission(
  admin: SupabaseClient,
  token: string | undefined,
  userId: string
): Promise<ClassMatchSubmission | null> {
  if (token) {
    const { submission } = await claimSubmission(admin, { token, userId });
    if (submission) return submission;
  }
  const { data } = await admin
    .from('class_match_submissions')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as ClassMatchSubmission | null) ?? null;
}

type MatchedTeacher = {
  groupId: string;
  className: string;
  subject: string | null;
  teacherName: string;
};

/**
 * DEVIATION from docs 04 §4.1's "teachers viewed", noted deliberately: no
 * view-tracking entity exists anywhere in the campaign schema, so this list is
 * the submission's recommended_session_ids resolved to teacher + class — the
 * honest available set the user was actually shown, revisitable as a list
 * rather than a count. Order preserved from the snapshot.
 */
async function listMatchedTeachers(
  admin: SupabaseClient,
  recommendedSessionIds: string[]
): Promise<MatchedTeacher[]> {
  if (recommendedSessionIds.length === 0) return [];

  const { data: sessionData } = await admin
    .from('class_match_sessions')
    .select('id, group_id, tutor_id')
    .in('id', recommendedSessionIds);
  const sessions = (sessionData ?? []) as Array<{ id: string; group_id: string; tutor_id: string }>;
  if (sessions.length === 0) return [];

  const sessionById = new Map(sessions.map((s) => [s.id, s]));
  const groupIds = [...new Set(sessions.map((s) => s.group_id))];
  const tutorIds = [...new Set(sessions.map((s) => s.tutor_id))];

  const [{ data: groupData }, { data: profileData }] = await Promise.all([
    admin.from('groups').select('id, name, subject').in('id', groupIds),
    admin.from('profiles').select('id, display_name, full_name').in('id', tutorIds),
  ]);
  const groupById = new Map(
    ((groupData ?? []) as Array<{ id: string; name: string; subject: string | null }>).map((g) => [
      g.id,
      g,
    ])
  );
  const profileById = new Map(
    (
      (profileData ?? []) as Array<{ id: string; display_name: string | null; full_name: string | null }>
    ).map((p) => [p.id, p])
  );

  const seen = new Set<string>();
  const out: MatchedTeacher[] = [];
  for (const id of recommendedSessionIds) {
    const session = sessionById.get(id);
    if (!session) continue;
    const key = `${session.tutor_id}|${session.group_id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const group = groupById.get(session.group_id);
    if (!group) continue;
    const profile = profileById.get(session.tutor_id);
    out.push({
      groupId: session.group_id,
      className: group.name,
      subject: group.subject,
      // coalesce(display_name, full_name) — two eligible teachers carry a
      // handle rather than a name in full_name.
      teacherName: profile?.display_name || profile?.full_name || 'iTutor teacher',
    });
  }
  return out;
}

function CampaignBadge() {
  return (
    <span className="inline-flex rounded-full bg-brand-soft px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-brand-deep">
      Class Match Week
    </span>
  );
}

export default async function ClassMatchWeekDashboardPage() {
  const supabase = await getServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect(`/class-match-week/signup?redirect=${encodeURIComponent('/class-match-week/dashboard')}`);
  }

  const cookieStore = await cookies();
  const token = cookieStore.get('cmw_token')?.value;

  const admin = getServiceClient();
  const [campaign, submission, reservations, coupons, joinClicks] = await Promise.all([
    getLiveCampaign(admin),
    resolveSubmission(admin, token, user.id),
    listUserReservations(admin, user.id),
    listUserCoupons(admin, user.id),
    admin
      .from('class_match_join_clicks')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id),
  ]);
  const joinedCount = joinClicks.count ?? 0;

  const matchedTeachers = await listMatchedTeachers(
    admin,
    submission?.recommended_session_ids ?? []
  );

  const nowMs = Date.now();

  // Upcoming = my live reservations on sessions that are still running and
  // have not finished. Cancelled sessions never appear as upcoming (the
  // cancellation floor, docs 01 §1.5) — my-classes shows them, muted.
  const upcoming = reservations
    .filter((r) => r.status === 'reserved' && r.session.status !== 'cancelled')
    .filter(
      (r) =>
        new Date(r.session.scheduled_at).getTime() + r.session.duration_minutes * 60_000 > nowMs
    )
    .sort((a, b) => a.session.scheduled_at.localeCompare(b.session.scheduled_at));

  const savedTotal = coupons.reduce((sum, c) => sum + (c.savingsValue ?? 0), 0);

  return (
    <main className="min-h-screen bg-background px-4 pb-16 pt-6">
      <div className="mx-auto w-full max-w-xl">
        {/* First when anything is imminent — a state, not a reordering. The
            strip decides visibility itself with client time math. */}
        <ImminentStrip
          sessions={upcoming.map((r) => ({
            sessionId: r.session.id,
            title: r.session.title,
            teacherName: r.session.teacherName,
            scheduledAt: r.session.scheduled_at,
            durationMinutes: r.session.duration_minutes,
          }))}
        />

        <div className="mt-4 flex items-center justify-between gap-3">
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
        <div className="mt-3 flex items-end justify-between gap-3">
          <h1 className="text-2xl font-bold tracking-tight text-ink">Your dashboard</h1>
          <Link
            href="/class-match-week/my-classes"
            className="text-xs font-semibold text-brand-deep hover:underline"
          >
            My classes
          </Link>
        </div>

        <div className="mt-5">
          <SavingsHero savedTotal={savedTotal} />
        </div>

        {/* ── Upcoming reserved sessions ─────────────────────────────────── */}
        <section className="mt-8">
          <h2 className="text-sm font-bold text-ink">Upcoming sessions</h2>
          {upcoming.length === 0 ? (
            <p className="mt-3 rounded-3xl border border-border bg-white p-4 text-xs leading-relaxed text-ink-muted shadow-card">
              Nothing reserved yet.{' '}
              <Link
                href="/class-match-week/results"
                className="font-semibold text-brand-deep underline underline-offset-2"
              >
                See your matches
              </Link>{' '}
              and reserve a free session.
            </p>
          ) : (
            <ul className="mt-3 divide-y divide-border overflow-hidden rounded-3xl border border-border bg-white shadow-card">
              {upcoming.map((r) => {
                const at = new Date(r.session.scheduled_at);
                const startMs = at.getTime();
                // The join route enforces nothing time-based; this gate is UX
                // only — the button goes live two hours before start.
                const joinOpen =
                  startMs - JOIN_WINDOW_MS <= nowMs &&
                  nowMs < startMs + r.session.duration_minutes * 60_000;
                return (
                  <li key={r.id} className="flex items-center gap-3 p-4">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-ink">{r.session.title}</p>
                      <p className="mt-0.5 truncate text-[11px] text-ink-muted">
                        {r.session.groupName} · {r.session.teacherName}
                      </p>
                      <p className="mt-0.5 text-[11px] text-ink-muted">
                        {formatAstDate(at, { weekday: 'short', month: 'short', day: 'numeric' })} ·{' '}
                        {formatAstTimeRange(at, r.session.duration_minutes)}
                      </p>
                    </div>
                    {joinOpen ? (
                      <a
                        href={`/api/class-match/sessions/${r.session.id}/join`}
                        className="shrink-0 rounded-2xl bg-brand px-4 py-2.5 text-xs font-bold text-white transition-colors hover:bg-brand-deep"
                      >
                        Join
                      </a>
                    ) : (
                      <span
                        title="Join opens 2 hours before the session"
                        className="shrink-0 cursor-not-allowed rounded-2xl bg-mint px-4 py-2.5 text-xs font-bold text-ink-muted"
                      >
                        Join
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* ── Sessions joined ────────────────────────────────────────────────
            The metric is JOIN CLICKS — someone opened the session link, which
            is not proof they stayed. Labelled "joined", never "attended"
            (docs 03 §3.4), so the number says what it measures. */}
        <section className="mt-8 flex items-center gap-4 rounded-3xl border border-border bg-white p-5 shadow-card">
          <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-brand-soft">
            <CalendarDays className="size-5 text-brand-deep" />
          </span>
          <div>
            <p className="text-2xl font-bold tracking-tight text-ink">{joinedCount}</p>
            <p className="text-[11px] text-ink-muted">
              {joinedCount === 1 ? 'Session joined' : 'Sessions joined'} — each one unlocks a class
              discount
            </p>
          </div>
        </section>

        {/* ── Coupons, with expiry surfaced ──────────────────────────────── */}
        <section className="mt-8">
          <h2 className="text-sm font-bold text-ink">Your discounts</h2>
          {coupons.length === 0 ? (
            <p className="mt-3 rounded-3xl border border-border bg-white p-4 text-xs leading-relaxed text-ink-muted shadow-card">
              No discounts yet — they unlock the moment you join a free session.
            </p>
          ) : (
            <ul className="mt-3 divide-y divide-border overflow-hidden rounded-3xl border border-border bg-white shadow-card">
              {coupons.map((c) => {
                const state = couponState(c, nowMs);
                const inactive = state.kind !== 'active';
                return (
                  <li key={c.id} className="flex items-center gap-3 p-4">
                    <div className="min-w-0 flex-1">
                      <p
                        className={`truncate text-sm font-semibold ${
                          inactive ? 'text-ink-muted line-through' : 'text-ink'
                        }`}
                      >
                        {c.discount}% off {c.groupName}
                      </p>
                      <p className="mt-0.5 truncate text-[11px] text-ink-muted">
                        with {c.teacherName}
                        {(c.priceDurationMonths ?? 0) > 0 && (
                          <>
                            {' '}
                            · holds your price for {c.priceDurationMonths}{' '}
                            {c.priceDurationMonths === 1 ? 'month' : 'months'}
                          </>
                        )}
                      </p>
                      <p
                        className={`mt-0.5 text-[11px] ${
                          state.kind === 'active' && state.urgent
                            ? 'font-semibold text-coral'
                            : 'text-ink-muted'
                        }`}
                      >
                        {state.kind === 'redeemed' && 'Redeemed — applied to your enrolment'}
                        {state.kind === 'expired' && 'Expired'}
                        {state.kind === 'active' &&
                          (state.expiresToday
                            ? 'Expires today'
                            : `Expires in ${state.daysLeft} ${state.daysLeft === 1 ? 'day' : 'days'}`)}
                      </p>
                    </div>
                    {state.kind === 'active' && (
                      <Link
                        href={`/student/explore/${c.groupId}`}
                        className="shrink-0 rounded-2xl bg-brand px-4 py-2.5 text-xs font-bold text-white transition-colors hover:bg-brand-deep"
                      >
                        Enrol
                      </Link>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* ── Matched teachers, revisitable (see listMatchedTeachers) ────── */}
        {matchedTeachers.length > 0 && (
          <section className="mt-8">
            <h2 className="text-sm font-bold text-ink">Your matched teachers</h2>
            <ul className="mt-3 divide-y divide-border overflow-hidden rounded-3xl border border-border bg-white shadow-card">
              {matchedTeachers.map((t) => (
                <li key={`${t.teacherName}-${t.groupId}`}>
                  <Link
                    href={`/student/explore/${t.groupId}`}
                    className="flex items-center gap-3 p-4 transition-colors hover:bg-mint-wash"
                  >
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-brand-soft text-base font-bold text-brand-deep">
                      {t.teacherName.charAt(0).toUpperCase()}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-ink">
                        {t.teacherName}
                      </span>
                      <span className="block truncate text-[11px] text-ink-muted">
                        {[t.className, t.subject].filter(Boolean).join(' · ')}
                      </span>
                    </span>
                    <ChevronRight className="size-4 shrink-0 text-ink-muted" />
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        <p className="mt-8 text-center text-xs text-ink-muted">
          <Link
            href="/class-match-week/results"
            className="font-semibold text-brand-deep underline underline-offset-2"
          >
            Back to your matches
          </Link>
        </p>
      </div>
    </main>
  );
}
