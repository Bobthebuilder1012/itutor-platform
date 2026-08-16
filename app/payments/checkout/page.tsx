'use client';

// =====================================================
// CHECKOUT
// =====================================================
// Full-page checkout, two-column: summary on the left, payment on the
// right. Replaces both the LuniPay hosted redirect and the in-modal
// payment step — the tutor-profile modal now collects subject/slot/notes
// and hands off here.
//
// Serves BOTH 1:1 payment flows:
//
//   ?pi=pi_…            pay-first. No booking exists yet; the summary is
//                       rebuilt from the PaymentIntent metadata via
//                       /api/payments/stripe/intent/[id]. The booking is
//                       materialised by the webhook after payment.
//
//   ?bookingId=…        pay for a booking that already exists; the
//                       PaymentIntent is created by /initiate.
//
// Payment state and confirmation live in <StripePaymentForm />, which
// treats the webhook as the only source of truth.
// =====================================================

import { useSearchParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase/client';
import Link from 'next/link';
import StripePaymentForm from '@/components/booking/StripePaymentForm';
import UserAvatar from '@/components/UserAvatar';

type Summary = {
  clientSecret: string;
  statusId: string;
  amount: number;
  processingFee: number;
  total: number;
  currency: string;
  durationMinutes: number;
  startAt: string | null;
  tutor: { id: string; name: string; avatarUrl: string | null };
  subject: string;
  /** Where to send the student once the webhook confirms. */
  successHref: string;
  /** Monthly group subscription rather than a single session. */
  isSubscription?: boolean;
  endDate?: string | null;
  /** Paying up front to hold a seat in a class that hasn't started yet. */
  isSecureSpot?: boolean;
  /** When the held first month is delivered — end of what this payment buys. */
  releaseDate?: string | null;
  /** Class finishes inside the first month: one-time purchase, nothing after. */
  shortClass?: boolean;
};

export default function PaymentCheckout() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const bookingId = searchParams.get('bookingId');
  const intentId = searchParams.get('pi');

  const [summary, setSummary] = useState<Summary | null>(null);
  const [rating, setRating] = useState<{ avg: number | null; count: number }>({
    avg: null,
    count: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  // The payer is not always a student. Every "get me out of here" link on this
  // page pointed at /student/*, which for a parent is a route AuthProvider
  // bounces them straight back out of — so a failed checkout dead-ended.
  const [role, setRole] = useState<string | null>(null);
  // Checkout waits for this. The role arrives asynchronously, and an
  // already-paid intent redirects on the very first pass — without the gate a
  // parent would be sent to /student/bookings before their role was known.
  const [roleLoaded, setRoleLoaded] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      // A signed-out visitor still has to stop waiting, or the page spins.
      if (!user) { setRoleLoaded(true); return; }
      const { data } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
      setRole((data as { role: string | null } | null)?.role ?? null);
      setRoleLoaded(true);
    })();
  }, []);

  const isParent = role === 'parent';
  const browseHref = isParent ? '/parent/classes' : '/student/explore';
  const browseLabel = isParent ? 'Back to classes' : 'Back to Explore';

  // ---- Load whichever flow we're in -------------------------------
  const load = useCallback(async () => {
    // Hold until the role is known — an already-paid intent redirects on the
    // first pass, and redirecting a parent into /student/* is a bounce.
    if (!roleLoaded) return;
    try {
      if (intentId) {
        const res = await fetch(`/api/payments/stripe/intent/${intentId}`, {
          cache: 'no-store',
        });
        const d = await res.json();
        if (d?.alreadyPaid) {
          router.replace(isParent ? '/parent/dashboard' : '/student/bookings');
          return;
        }
        if (!res.ok) throw new Error(d?.error || 'Could not load checkout');
        setSummary({
          clientSecret: d.clientSecret,
          statusId: d.paymentIntentId,
          amount: d.amount,
          processingFee: d.processingFee,
          total: d.total,
          currency: d.currency,
          durationMinutes: d.durationMinutes,
          startAt: d.startAt,
          tutor: d.tutor,
          subject: d.subject,
          isSubscription: d.kind === 'group_subscription',
          endDate: d.endDate ?? null,
          isSecureSpot: d.kind === 'secure_spot',
          releaseDate: d.releaseDate ?? null,
          shortClass: d.shortClass ?? false,
          // Land on the confirmation page, which polls the status route and
          // then shows the receipt + download. Keyed on the intent id because
          // the payments row doesn't exist until the webhook creates it.
          //
          // Subscriptions get their own confirmation page: their money lands
          // in subscription_payments, not `payments`, so /payments/success
          // has nothing to render for them.
          // A secured spot is also settled in subscription_payments, so it
          // shares the subscription confirmation page rather than
          // /payments/success, which reads the `payments` table.
          successHref:
            d.kind === 'group_subscription' || d.kind === 'secure_spot'
              ? `/payments/subscription-success?pi=${d.paymentIntentId}`
              : `/payments/success?pi=${d.paymentIntentId}`,
        });
        return;
      }

      if (!bookingId) throw new Error('Nothing to pay for');

      // Existing-booking flow: read the booking, then create its intent.
      const { data: booking, error: bErr } = await supabase
        .from('bookings')
        .select(
          `id, price_ttd, duration_minutes, currency, requested_start_at, payment_status,
           tutor:profiles!bookings_tutor_id_fkey(id, full_name, display_name, avatar_url),
           subjects(name, label)`
        )
        .eq('id', bookingId)
        .single();
      if (bErr || !booking) throw new Error('Booking not found');

      if ((booking as any).payment_status === 'paid') {
        router.replace(`/payments/success?bookingId=${bookingId}`);
        return;
      }

      const res = await fetch('/api/payments/stripe/initiate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookingId }),
      });
      const d = await res.json();
      if (!res.ok || !d.clientSecret)
        throw new Error(d?.error || 'Could not start checkout');

      const t = (booking as any).tutor;
      const s = (booking as any).subjects;
      setSummary({
        clientSecret: d.clientSecret,
        statusId: d.paymentId,
        amount: d.amount,
        processingFee: d.processingFee,
        total: d.total,
        currency: d.currency,
        durationMinutes: (booking as any).duration_minutes,
        startAt: (booking as any).requested_start_at,
        tutor: {
          id: t?.id,
          name: t?.display_name || t?.full_name || 'Your tutor',
          avatarUrl: t?.avatar_url ?? null,
        },
        subject: s?.label || s?.name || 'Tutoring session',
        successHref: `/payments/success?bookingId=${bookingId}&paymentId=${d.paymentId}`,
      });
    } catch (e: any) {
      setError(e?.message || 'Could not load checkout');
    } finally {
      setLoading(false);
    }
  }, [bookingId, intentId, router, roleLoaded, isParent]);

  useEffect(() => {
    load();
  }, [load]);

  // Reuse the same aggregation the tutor profile uses, rather than
  // recomputing ratings (soft-deletes, category blending) here.
  useEffect(() => {
    if (!summary?.tutor?.id) return;
    fetch(`/api/public/tutors/${summary.tutor.id}/reviews?limit=1&offset=0`, {
      cache: 'no-store',
    })
      .then((r) => r.json())
      .then((d) => {
        const a = d?.averageRating == null ? null : Number(d.averageRating);
        setRating({
          avg: Number.isFinite(a as number) ? (a as number) : null,
          count: Number(d?.totalReviews ?? 0),
        });
      })
      .catch(() => {});
  }, [summary?.tutor?.id]);

  if (loading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-itutor-green" />
      </div>
    );
  }

  if (error || !summary) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center p-4">
        <div className="max-w-md w-full rounded-2xl border border-gray-200 p-8 text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">
            Checkout unavailable
          </h1>
          <p className="text-gray-600 mb-6">{error || 'Something went wrong.'}</p>
          <Link
            href={browseHref}
            className="inline-block rounded-lg bg-itutor-green px-6 py-3 font-semibold text-white transition hover:opacity-90"
          >
            Back to Explore
          </Link>
        </div>
      </div>
    );
  }

  const start = summary.startAt ? new Date(summary.startAt) : null;
  const end =
    start && summary.durationMinutes
      ? new Date(start.getTime() + summary.durationMinutes * 60000)
      : null;
  const fmtTime = (d: Date) =>
    // 12-hour, like the rest of the product. "18:00" on a payment screen reads
    // as a different service to the "6:00 PM" the class page advertises.
    d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  const cancelBy = start ? new Date(start.getTime() - 24 * 3600 * 1000) : null;

  // A subscription to a class that finishes inside the first billing month.
  // Billing stops on the month boundary after the end date (endDateToCancelAt),
  // so this is the student's only charge.
  const classEndsSoon = (() => {
    if (!summary.isSubscription || !summary.endDate) return false;
    const endsAt = Date.parse(`${summary.endDate}T23:59:59-04:00`);
    if (!Number.isFinite(endsAt)) return false;
    const oneMonthOut = new Date();
    oneMonthOut.setMonth(oneMonthOut.getMonth() + 1);
    return endsAt < oneMonthOut.getTime();
  })();

  return (
    <div className="min-h-screen bg-white">
      {/* Hero */}
      <div className="bg-brand-soft/60 px-4 py-10 text-center">
        <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-gray-900">
          Confirm and pay for your{' '}
          <span className="text-itutor-green">{summary.subject}</span> lesson
        </h1>
      </div>

      <div className="mx-auto max-w-5xl px-4 pb-16 -mt-6">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] items-start">
          {/* ---------------- LEFT: summary ---------------- */}
          <div className="space-y-4">
            <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
              <h2 className="text-sm font-semibold text-gray-500 mb-4">
                Your tutor
              </h2>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-2xl font-bold text-gray-900">
                    {summary.tutor.name}
                  </div>
                  {rating.avg !== null && (
                    <div className="mt-1 flex items-center gap-1 text-sm">
                      <span className="text-yellow-500">★</span>
                      <span className="font-semibold text-gray-900">
                        {rating.avg.toFixed(1)}
                      </span>
                      <span className="text-gray-500">
                        ({rating.count} review{rating.count === 1 ? '' : 's'})
                      </span>
                    </div>
                  )}
                </div>
                <UserAvatar
                  avatarUrl={summary.tutor.avatarUrl}
                  name={summary.tutor.name}
                  size={64}
                  className="rounded-2xl shrink-0"
                />
              </div>
            </section>

            <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
              <h2 className="text-lg font-bold text-gray-900 mb-4">
                {summary.isSecureSpot
                  ? 'What you’re reserving'
                  : summary.isSubscription
                    ? 'Subscription details'
                    : 'Lesson details'}
              </h2>
              {summary.isSecureSpot ? (
                <div className="space-y-3 text-sm">
                  {/* The start date is the whole point of this checkout — the
                      student is paying for a class that hasn't happened yet,
                      so it leads rather than hiding in a schedule string. */}
                  {start && (
                    <div className="flex items-center gap-4 rounded-xl bg-brand-soft/60 px-4 py-3">
                      <div className="grid h-14 w-14 shrink-0 place-items-center rounded-xl bg-white text-center">
                        <div>
                          <div className="text-[10px] font-bold uppercase tracking-wide text-itutor-green">
                            {start.toLocaleDateString('en-US', { month: 'short' })}
                          </div>
                          <div className="text-lg font-bold leading-none text-gray-900">
                            {start.getDate()}
                          </div>
                        </div>
                      </div>
                      <div>
                        <div className="font-semibold text-gray-900">
                          Classes start {start.toLocaleDateString('en-US', {
                            weekday: 'long', month: 'long', day: 'numeric',
                          })}
                        </div>
                        <div className="text-sm text-gray-500">First lesson at {fmtTime(start)}</div>
                      </div>
                    </div>
                  )}

                  <div className="flex justify-between">
                    <span className="text-gray-600">You’re paying for</span>
                    <span className="font-semibold text-gray-900">
                      {summary.shortClass ? 'The whole class' : 'Your first month'}
                    </span>
                  </div>
                  {summary.releaseDate && (
                    <div className="flex justify-between">
                      <span className="text-gray-600">
                        {summary.shortClass ? 'Class ends' : 'First month runs until'}
                      </span>
                      <span className="font-semibold text-gray-900">
                        {new Date(`${summary.releaseDate}T00:00:00`).toLocaleDateString('en-US', {
                          month: 'long', day: 'numeric', year: 'numeric',
                        })}
                      </span>
                    </div>
                  )}
                  {summary.durationMinutes ? (
                    <div className="flex justify-between">
                      <span className="text-gray-600">Session length</span>
                      <span className="font-semibold text-gray-900">
                        {summary.durationMinutes} minutes
                      </span>
                    </div>
                  ) : null}

                  {/* Stated before the card form, like the recurring-payment
                      disclaimer: this is what the student must understand
                      before paying weeks ahead of the first lesson. */}
                  <div className="mt-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
                    <p className="text-xs leading-relaxed text-emerald-900">
                      <strong>This is a one-time payment, not a subscription.</strong>{' '}
                      Your place is held for you and your payment is held by iTutor
                      until your first month of classes has been taught. If the tutor
                      cancels the class before it starts, you&apos;re refunded
                      automatically.
                      {summary.shortClass
                        ? ' This class finishes inside that period, so there is nothing further to pay.'
                        : ' After your first month you’ll be asked whether you’d like to continue — nothing is charged automatically.'}
                    </p>
                  </div>
                </div>
              ) : summary.isSubscription ? (
                <div className="space-y-3 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Plan</span>
                    <span className="font-semibold text-gray-900">
                      Monthly · billed every 30 days
                    </span>
                  </div>
                  {summary.durationMinutes ? (
                    <div className="flex justify-between">
                      <span className="text-gray-600">Session length</span>
                      <span className="font-semibold text-gray-900">
                        {summary.durationMinutes} minutes
                      </span>
                    </div>
                  ) : null}
                  {summary.endDate && (
                    <div className="flex justify-between">
                      <span className="text-gray-600">Class ends</span>
                      <span className="font-semibold text-gray-900">
                        {new Date(`${summary.endDate}T00:00:00`).toLocaleDateString(
                          'en-US',
                          { month: 'long', day: 'numeric', year: 'numeric' }
                        )}
                      </span>
                    </div>
                  )}
                  {/* Recurring-payment disclaimer. Deliberately prominent and
                      stated before the card form: this is the one thing a
                      student must understand before entering card details. */}
                  {/* A class finishing inside this first month is a one-off
                      purchase wearing a subscription's clothes: the student
                      pays a full month for less class than that, and there is
                      no second charge. Saying "then every month" there would
                      be false, so it gets its own notice. */}
                  {classEndsSoon ? (
                    <div className="mt-2 rounded-xl border border-orange-200 bg-orange-50 px-4 py-3">
                      <p className="text-xs leading-relaxed text-orange-900">
                        <strong>This class ends soon.</strong> It finishes on{' '}
                        <strong>
                          {new Date(`${summary.endDate}T00:00:00`).toLocaleDateString('en-US', {
                            month: 'long', day: 'numeric', year: 'numeric',
                          })}
                        </strong>
                        , which is less than a month away. You&apos;re paying for
                        one full month —{' '}
                        <strong>
                          ${summary.total.toFixed(2)} {summary.currency}
                        </strong>{' '}
                        — and <strong>you won&apos;t be charged again</strong>; the
                        subscription ends with the class.
                      </p>
                    </div>
                  ) : (
                    <div className="mt-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
                      <p className="text-xs leading-relaxed text-amber-900">
                        <strong>This is a recurring payment.</strong> You&apos;ll
                        be charged{' '}
                        <strong>
                          ${summary.total.toFixed(2)} {summary.currency}
                        </strong>{' '}
                        today and then every month
                        {summary.endDate
                          ? ' until the class ends'
                          : ' until you cancel'}
                        . You can <strong>cancel at any time</strong> from your
                        account, and you&apos;ll keep access for the period
                        you&apos;ve already paid for.
                      </p>
                    </div>
                  )}
                </div>
              ) : start ? (
                <div className="flex items-center gap-4">
                  <div className="grid h-14 w-14 shrink-0 place-items-center rounded-xl bg-brand-soft text-center">
                    <div>
                      <div className="text-[10px] font-bold uppercase tracking-wide text-itutor-green">
                        {start.toLocaleDateString('en-US', { month: 'short' })}
                      </div>
                      <div className="text-lg font-bold leading-none text-gray-900">
                        {start.getDate()}
                      </div>
                    </div>
                  </div>
                  <div>
                    <div className="font-semibold text-gray-900">
                      {fmtTime(start)}
                      {end ? ` – ${fmtTime(end)}` : ''}
                    </div>
                    <div className="text-sm text-gray-500">
                      Time is shown in your local timezone
                    </div>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-gray-500">
                  {summary.durationMinutes} minute lesson
                </p>
              )}

              {cancelBy && !summary.isSubscription && (
                <div className="mt-4 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
                  <span className="font-semibold">
                    Cancel or reschedule for free
                  </span>{' '}
                  until{' '}
                  {cancelBy.toLocaleString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    hour: 'numeric',
                    minute: '2-digit',
                    hour12: true,
                  })}
                </div>
              )}
            </section>

            <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
              <h2 className="text-lg font-bold text-gray-900 mb-4">
                Checkout info
              </h2>
              <div className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600">
                    {summary.isSecureSpot
                      ? `${summary.subject} — ${summary.shortClass ? 'full class' : 'first month'}`
                      : summary.isSubscription
                        ? `${summary.subject} — monthly`
                        : `${summary.durationMinutes}-min lesson`}
                  </span>
                  <span className="text-gray-900">
                    ${summary.amount.toFixed(2)} {summary.currency}
                  </span>
                </div>
                {/* One line, every payment type. The card/conversion/fixed
                    split is Stripe's internal arithmetic, not something a
                    student is buying, and itemising it made a small preorder
                    look like it was mostly fees. */}
                <div className="flex justify-between">
                  <span className="text-gray-600">Processing fee</span>
                  <span className="text-gray-900">
                    ${summary.processingFee.toFixed(2)} {summary.currency}
                  </span>
                </div>
                <div className="flex items-center justify-between border-t border-gray-200 pt-3 text-xl font-bold">
                  <span className="text-gray-900">Total</span>
                  <span className="text-gray-900">
                    ${summary.total.toFixed(2)} {summary.currency}
                  </span>
                </div>
              </div>
            </section>
          </div>

          {/* ---------------- RIGHT: payment ---------------- */}
          <div className="space-y-4">
            <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
              <h2 className="text-lg font-bold text-gray-900 mb-4">
                Choose how to pay
              </h2>

              {/* The Payment Element renders card plus any wallets Stripe
                  has enabled for this account (Apple Pay / Google Pay show
                  automatically on supported devices) — we don't hand-roll
                  those buttons, so nothing here can advertise a method that
                  isn't actually available. */}
              <StripePaymentForm
                clientSecret={summary.clientSecret}
                statusId={summary.statusId}
                amount={summary.amount}
                processingFee={summary.processingFee}
                total={summary.total}
                currency={summary.currency}
                hideBreakdown
                submitLabel={
                  summary.isSecureSpot
                    ? `Secure your spot · $${summary.total.toFixed(2)} ${summary.currency}`
                    : `Book lesson and pay · $${summary.total.toFixed(2)} ${summary.currency}`
                }
                returnUrl={`${typeof window !== 'undefined' ? window.location.origin : ''}${summary.successHref}`}
                onConfirmed={() => router.push(summary.successHref)}
                onCancel={() => router.back()}
              />

              <p className="mt-4 text-xs leading-relaxed text-gray-500">
                By paying you agree to iTutor&apos;s{' '}
                <Link href="/terms" className="underline">
                  Terms &amp; Refund Policy
                </Link>
                . Card details are entered directly into Stripe and never touch
                our servers.
                {/* Single link on purpose — there is no /refund-policy route,
                    and linking one would 404 from the checkout page. */}
              </p>
            </section>

            <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
              <h2 className="text-base font-bold text-gray-900">
                {summary.tutor.name} is a great choice
              </h2>
              {rating.avg !== null ? (
                <div className="mt-3 flex items-center gap-2">
                  <span className="rounded-lg bg-gray-100 px-3 py-1 text-sm font-semibold text-gray-900">
                    ★ {rating.avg.toFixed(1)}
                  </span>
                  <span className="text-sm text-gray-600">
                    {rating.count} review{rating.count === 1 ? '' : 's'}
                  </span>
                </div>
              ) : (
                <p className="mt-2 text-sm text-gray-600">
                  Free cancellation up to 24 hours before your lesson.
                </p>
              )}
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
