/**
 * Class Match Week — my classes: every session the user reserved, upcoming
 * and past (docs 04 §4.1, cancellation floor from docs 01 §1.5).
 *
 * Auth-gated like the dashboard: no user → the campaign signup screen with a
 * same-origin ?redirect= back here. All reads go through the service client;
 * this page RENDERS, it does not compute — the join click is recorded and the
 * coupon issued server-side by /api/class-match/sessions/[id]/join, which this
 * page only links to. Nothing here fetches from the browser.
 *
 * Buckets, in render order:
 *  - Upcoming: reserved, session still running, not yet ended. Join goes live
 *    inside the two-hour window (UX gate only — the route enforces access).
 *  - No longer running: the teacher cancelled. NEVER shown as upcoming — the
 *    cancellation floor — but never silently dropped either; a family plans
 *    around these times.
 *  - Past: joined ones carry the earned discount and its expiry; not-joined
 *    ones sit muted with no CTA.
 */

import Link from 'next/link';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getServerClient, getServiceClient } from '@/lib/supabase/server';
import { getLiveCampaign } from '@/lib/classMatchWeek/portalData';
import { claimSubmission } from '@/lib/classMatchWeek/claim';
import { listUserReservations } from '@/lib/classMatchWeek/reservations';
import { listUserCoupons } from '@/lib/classMatchWeek/coupons';
import { formatAstDate, formatAstTimeRange } from '@/lib/utils/scheduleFormat';
import CountdownPill from '@/components/classMatchWeek/portal/CountdownPill';

export const dynamic = 'force-dynamic';

const JOIN_WINDOW_MS = 2 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

type ReservationEntry = Awaited<ReturnType<typeof listUserReservations>>[number];
type CouponEntry = Awaited<ReturnType<typeof listUserCoupons>>[number];

function CampaignBadge() {
  return (
    <span className="inline-flex rounded-full bg-brand-soft px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-brand-deep">
      Class Match Week
    </span>
  );
}

function sessionEndMs(r: ReservationEntry): number {
  return new Date(r.session.scheduled_at).getTime() + r.session.duration_minutes * 60_000;
}

/** "Sat, Sep 5 · 6:00 – 6:30 PM AST · 30 min" — Trinidad wall-clock, always. */
function whenLine(r: ReservationEntry): string {
  const at = new Date(r.session.scheduled_at);
  return `${formatAstDate(at, { weekday: 'short', month: 'short', day: 'numeric' })} · ${formatAstTimeRange(
    at,
    r.session.duration_minutes
  )} · ${r.session.duration_minutes} min`;
}

function couponExpiryLabel(coupon: CouponEntry, nowMs: number): string | null {
  if (coupon.redeemedAt) return null;
  if (!coupon.expiresAt) return null; // pre-233 coupons carry no deadline to surface
  const exp = new Date(coupon.expiresAt).getTime();
  if (!Number.isFinite(exp) || exp <= nowMs) return null;
  const msLeft = exp - nowMs;
  if (msLeft < DAY_MS) return 'expires today';
  const days = Math.max(1, Math.ceil(msLeft / DAY_MS));
  return `expires in ${days} ${days === 1 ? 'day' : 'days'}`;
}

export default async function ClassMatchWeekMyClassesPage() {
  const supabase = await getServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect(
      `/class-match-week/signup?redirect=${encodeURIComponent('/class-match-week/my-classes')}`
    );
  }

  const admin = getServiceClient();

  // The submission is claimed at first authed load, and this page can be that
  // load (a reminder email lands here directly). Idempotent, never throws.
  const token = (await cookies()).get('cmw_token')?.value;
  if (token) await claimSubmission(admin, { token, userId: user.id });

  const [campaign, reservations, coupons, clickData] = await Promise.all([
    getLiveCampaign(admin),
    listUserReservations(admin, user.id),
    listUserCoupons(admin, user.id),
    admin.from('class_match_join_clicks').select('session_id').eq('user_id', user.id),
  ]);
  const joinedSessionIds = new Set(
    ((clickData.data ?? []) as Array<{ session_id: string }>).map((r) => r.session_id)
  );

  const nowMs = Date.now();

  const reserved = reservations.filter((r) => r.status === 'reserved');
  const cancelled = reserved
    .filter((r) => r.session.status === 'cancelled')
    .sort((a, b) => b.session.scheduled_at.localeCompare(a.session.scheduled_at));
  const running = reserved.filter((r) => r.session.status !== 'cancelled');
  const upcoming = running
    .filter((r) => sessionEndMs(r) > nowMs)
    .sort((a, b) => a.session.scheduled_at.localeCompare(b.session.scheduled_at));
  const past = running
    .filter((r) => sessionEndMs(r) <= nowMs)
    .sort((a, b) => b.session.scheduled_at.localeCompare(a.session.scheduled_at));

  const couponByGroup = new Map(coupons.map((c) => [c.groupId, c]));

  const empty = reserved.length === 0;

  return (
    <main className="max-w-5xl mx-auto space-y-6">
      <div className="w-full">
        <div className="flex items-center justify-between gap-3">
          {campaign && (
            <CountdownPill startsAt={campaign.starts_at} endsAt={campaign.ends_at} size="sm" />
          )}
        </div>

        <div className="mt-6">
          <CampaignBadge />
        </div>
        <div className="mt-3 flex items-end justify-between gap-3">
          <h1 className="text-3xl font-bold text-ink tracking-tight">My classes</h1>
          <Link
            href="/class-match-week/dashboard"
            className="text-xs font-semibold text-brand-deep hover:underline"
          >
            Dashboard
          </Link>
        </div>

        {empty ? (
          <div className="mt-6 rounded-3xl border border-border bg-white p-6 text-center shadow-card">
            <p className="text-sm font-semibold text-ink">Nothing reserved yet</p>
            <p className="mt-1 text-xs leading-relaxed text-ink-muted">
              Reserve a free session with a matched teacher — attending unlocks a discount on
              their ongoing class.
            </p>
            <div className="mt-4 grid gap-3">
              <Link
                href="/class-match-week/results"
                className="inline-flex items-center justify-center rounded-2xl bg-brand px-5 py-3.5 text-sm font-bold text-white transition-colors hover:bg-brand-deep"
              >
                See your matches
              </Link>
              <Link
                href="/class-match-week/explore"
                className="inline-flex items-center justify-center rounded-2xl border border-border bg-white px-5 py-3.5 text-sm font-bold text-ink transition-colors hover:bg-mint"
              >
                Explore all sessions
              </Link>
            </div>
          </div>
        ) : (
          <>
            {/* ── Upcoming ───────────────────────────────────────────────── */}
            <section className="mt-6">
              <h2 className="text-sm font-bold text-ink">Upcoming</h2>
              {upcoming.length === 0 ? (
                <p className="mt-3 rounded-3xl border border-border bg-white p-4 text-xs leading-relaxed text-ink-muted shadow-card">
                  Nothing coming up.{' '}
                  <Link
                    href="/class-match-week/explore"
                    className="font-semibold text-brand-deep underline underline-offset-2"
                  >
                    Explore this week&rsquo;s sessions
                  </Link>
                  .
                </p>
              ) : (
                <div className="mt-3 grid gap-3">
                  {upcoming.map((r) => {
                    const startMs = new Date(r.session.scheduled_at).getTime();
                    const joinOpen = startMs - JOIN_WINDOW_MS <= nowMs && nowMs < sessionEndMs(r);
                    return (
                      <article
                        key={r.id}
                        className="rounded-3xl border border-border bg-white p-4 shadow-card"
                      >
                        <div className="flex items-start gap-3">
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-bold text-ink">{r.session.title}</p>
                            <p className="mt-0.5 truncate text-xs text-ink-muted">
                              {r.session.groupName} · {r.session.teacherName}
                            </p>
                            <p className="mt-1 text-[11px] text-ink-muted">{whenLine(r)}</p>
                            <div className="mt-2 flex flex-wrap items-center gap-1.5">
                              <span className="inline-flex rounded-full bg-brand-soft px-2.5 py-0.5 text-[11px] font-semibold text-brand-deep">
                                Reserved
                              </span>
                              <span className="inline-flex rounded-full bg-mint px-2.5 py-0.5 text-[11px] font-semibold text-ink">
                                {r.session.discount_percent}% off after attending
                              </span>
                            </div>
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
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </section>

            {/* ── Cancelled — never upcoming, never hidden ───────────────── */}
            {cancelled.length > 0 && (
              <section className="mt-6">
                <div className="grid gap-3">
                  {cancelled.map((r) => (
                    <article
                      key={r.id}
                      className="rounded-3xl border border-border bg-white p-4 opacity-60 shadow-card"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-bold text-ink-muted line-through">
                            {r.session.title}
                          </p>
                          <p className="mt-0.5 truncate text-xs text-ink-muted">
                            {r.session.groupName} · {r.session.teacherName}
                          </p>
                          <p className="mt-1 text-[11px] text-ink-muted">{whenLine(r)}</p>
                        </div>
                        <span className="inline-flex shrink-0 rounded-full bg-peach px-2.5 py-0.5 text-[11px] font-semibold text-ink">
                          No longer running
                        </span>
                      </div>
                    </article>
                  ))}
                </div>
              </section>
            )}

            {/* ── Past ───────────────────────────────────────────────────── */}
            {past.length > 0 && (
              <section className="mt-8">
                <h2 className="text-sm font-bold text-ink">Past sessions</h2>
                <div className="mt-3 grid gap-3">
                  {past.map((r) => {
                    const joined = joinedSessionIds.has(r.session.id);
                    const coupon = couponByGroup.get(r.session.group_id);
                    const expiry = coupon ? couponExpiryLabel(coupon, nowMs) : null;
                    if (!joined) {
                      return (
                        <article
                          key={r.id}
                          className="rounded-3xl border border-border bg-white p-4 opacity-60 shadow-card"
                        >
                          <p className="truncate text-sm font-bold text-ink-muted">
                            {r.session.title}
                          </p>
                          <p className="mt-0.5 truncate text-xs text-ink-muted">
                            {r.session.groupName} · {r.session.teacherName}
                          </p>
                          <p className="mt-1 text-[11px] text-ink-muted">
                            {whenLine(r)} · Session ended
                          </p>
                        </article>
                      );
                    }
                    return (
                      <article
                        key={r.id}
                        className="rounded-3xl border border-border bg-white p-4 shadow-card"
                      >
                        <p className="truncate text-sm font-bold text-ink">{r.session.title}</p>
                        <p className="mt-0.5 truncate text-xs text-ink-muted">
                          {r.session.groupName} · {r.session.teacherName}
                        </p>
                        <p className="mt-1 text-[11px] text-ink-muted">{whenLine(r)}</p>
                        <p className="mt-2 text-xs font-semibold text-brand-deep">
                          Attended ✓ — your discount is active
                        </p>
                        {coupon && !coupon.redeemedAt && (
                          <p className="mt-0.5 text-[11px] text-ink-muted">
                            {coupon.discount}% off {coupon.groupName}
                            {expiry ? ` — ${expiry}` : ' — expired'}
                          </p>
                        )}
                        {coupon?.redeemedAt && (
                          <p className="mt-0.5 text-[11px] text-ink-muted">
                            {coupon.discount}% off — redeemed on your enrolment
                          </p>
                        )}
                        {coupon && !coupon.redeemedAt && expiry && (
                          <Link
                            href={`/student/explore/${r.session.group_id}`}
                            className="mt-3 inline-flex items-center justify-center rounded-2xl bg-brand px-4 py-2.5 text-xs font-bold text-white transition-colors hover:bg-brand-deep"
                          >
                            Enrol with {coupon.discount}% off
                          </Link>
                        )}
                      </article>
                    );
                  })}
                </div>
              </section>
            )}
          </>
        )}
      </div>
    </main>
  );
}
