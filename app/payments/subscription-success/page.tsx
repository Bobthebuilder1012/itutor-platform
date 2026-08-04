'use client';

// =====================================================
// SUBSCRIPTION CONFIRMATION
// =====================================================
// Where a student lands after paying for a group class.
//
// Like the booking confirmation page, this POLLS our status route rather
// than trusting the redirect: the webhook is the only writer of payment
// state, and Stripe can bounce the browser back before invoice.paid has
// been processed. A subscription's money lands in subscription_payments,
// not `payments`, so the status route resolves it from there.
// =====================================================

import { useSearchParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';

const CONFIRM_TIMEOUT_MS = 45_000;
const POLL_INTERVAL_MS = 1_500;

type Confirmed = {
  paymentId: string;
  groupId: string | null;
  enrollmentStatus: string | null;
  paidAt: string | null;
};

export default function SubscriptionSuccess() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const intentId = searchParams.get('pi');

  const [state, setState] = useState<'waiting' | 'done' | 'timeout' | 'error'>(
    'waiting'
  );
  const [slow, setSlow] = useState(false);
  const [confirmed, setConfirmed] = useState<Confirmed | null>(null);
  const [error, setError] = useState('');

  const poll = useCallback(async () => {
    if (!intentId) {
      setError('Missing payment reference');
      setState('error');
      return;
    }

    const deadline = Date.now() + CONFIRM_TIMEOUT_MS;
    const slowTimer = setTimeout(() => setSlow(true), 8_000);

    try {
      while (Date.now() < deadline) {
        const res = await fetch(`/api/payments/stripe/${intentId}/status`, {
          cache: 'no-store',
        });
        if (res.ok) {
          const d = await res.json();
          if (d.status === 'succeeded') {
            setConfirmed({
              paymentId: d.paymentId,
              groupId: d.groupId ?? null,
              enrollmentStatus: d.enrollmentStatus ?? null,
              paidAt: d.paidAt ?? null,
            });
            setState('done');
            return;
          }
          if (d.status === 'failed' || d.status === 'cancelled') {
            setError('This payment did not complete. You have not been charged.');
            setState('error');
            return;
          }
        }
        await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
      }
      setState('timeout');
    } finally {
      clearTimeout(slowTimer);
    }
  }, [intentId]);

  useEffect(() => {
    poll();
  }, [poll]);

  if (state === 'waiting') {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center p-4">
        <div className="text-center max-w-sm">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-itutor-green mx-auto mb-4" />
          <p className="font-semibold text-gray-900">Confirming your payment…</p>
          <p className="mt-1 text-sm text-gray-600">
            Please don&apos;t close this page.
          </p>
          {slow && (
            <p className="mt-3 text-sm text-gray-500">
              This is taking longer than usual. Your payment is safe — we&apos;re
              just waiting on confirmation.
            </p>
          )}
        </div>
      </div>
    );
  }

  if (state === 'error' || state === 'timeout') {
    // A timeout is NOT a failure — the webhook may still land. Never imply
    // the student needs to pay again.
    const isTimeout = state === 'timeout';
    return (
      <div className="min-h-screen bg-white flex items-center justify-center p-4">
        <div className="max-w-md w-full rounded-2xl border border-gray-200 p-8 text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">
            {isTimeout ? 'Still confirming' : 'Payment not completed'}
          </h1>
          <p className="text-gray-600 mb-6">
            {isTimeout
              ? 'Your payment went through but is still being confirmed. You do not need to pay again — check My Classes in a few moments.'
              : error}
          </p>
          <Link
            href="/student/classes"
            className="inline-block rounded-lg bg-itutor-green px-6 py-3 font-semibold text-white transition hover:opacity-90"
          >
            Go to My Classes
          </Link>
        </div>
      </div>
    );
  }

  const receiptHref = confirmed
    ? `/api/payments/stripe/subscription/${confirmed.paymentId}/receipt?print=1`
    : '#';

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-gray-100 py-12 px-4">
      <div className="mx-auto max-w-xl">
        <div className="text-center mb-8">
          <div className="bg-green-100 rounded-full w-20 h-20 flex items-center justify-center mx-auto mb-4">
            <svg
              className="w-10 h-10 text-green-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M5 13l4 4L19 7"
              />
            </svg>
          </div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            You&apos;re enrolled
          </h1>
          <p className="text-gray-600">
            Your payment went through and your place in the class is confirmed.
          </p>
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-3">
            <p className="text-xs leading-relaxed text-amber-900">
              <strong>This is a recurring monthly payment.</strong> You can
              cancel any time from your subscriptions page and keep access for
              the period you&apos;ve already paid for.
            </p>
          </div>

          <p className="mt-5 text-sm text-gray-600">
            A receipt has been emailed to you. You can also download it here.
          </p>

          <div className="mt-4 flex flex-col gap-3 sm:flex-row">
            <a
              href={receiptHref}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 rounded-xl bg-gray-200 py-3 text-center font-semibold text-gray-800 transition hover:bg-gray-300"
            >
              Download receipt
            </a>
            <button
              onClick={() =>
                router.push(
                  confirmed?.groupId
                    ? `/student/classes/${confirmed.groupId}`
                    : '/student/classes'
                )
              }
              className="flex-1 rounded-xl bg-itutor-green py-3 font-semibold text-white transition hover:opacity-90"
            >
              Go to my class
            </button>
          </div>

          <p className="mt-4 text-center text-xs text-gray-500">
            Manage or cancel from{' '}
            <Link href="/student/subscriptions" className="underline">
              your subscriptions
            </Link>
            .
          </p>
        </div>
      </div>
    </div>
  );
}
