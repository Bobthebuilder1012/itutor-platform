'use client';

// =====================================================
// SESSION CHECKOUT
// =====================================================
// "Pay for an existing booking" flow, used by /payments/checkout.
// Calls /api/payments/stripe/initiate to create a PaymentIntent for a
// booking that already exists, then hands off to <StripePaymentForm />.
//
// Replaces the LuniPay hosted-checkout redirect — the card form is now
// inline, so the student never leaves the site.
//
// The pay-first flow (tutor profile "Book a session" modal) uses
// StripePaymentForm directly, since /api/bookings/direct-book returns
// the clientSecret itself and no booking exists yet.
// =====================================================

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import StripePaymentForm from './StripePaymentForm';

interface SessionCheckoutProps {
  bookingId: string;
  /** Called once the server confirms payment. Defaults to redirecting. */
  onConfirmed?: () => void;
  onCancel?: () => void;
}

interface InitiateResponse {
  clientSecret: string;
  paymentId: string;
  amount: number;
  processingFee: number;
  total: number;
  currency: string;
  error?: string;
}

export default function SessionCheckout({
  bookingId,
  onConfirmed,
  onCancel,
}: SessionCheckoutProps) {
  const router = useRouter();
  const [intent, setIntent] = useState<InitiateResponse | null>(null);
  const [loadError, setLoadError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function initiate() {
      try {
        const res = await fetch('/api/payments/stripe/initiate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ bookingId }),
        });
        const data = (await res.json()) as InitiateResponse;

        if (cancelled) return;

        if (!res.ok) {
          setLoadError(data.error || 'Could not start checkout.');
        } else if (!data.clientSecret) {
          setLoadError('Checkout could not be initialised.');
        } else {
          setIntent(data);
        }
      } catch {
        if (!cancelled) {
          setLoadError('Could not reach the payment service. Please try again.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    initiate();
    return () => {
      cancelled = true;
    };
  }, [bookingId]);

  if (loading) {
    return (
      <div className="p-6">
        <div className="h-4 w-40 animate-pulse rounded bg-gray-200" />
        <div className="mt-4 h-32 animate-pulse rounded-lg bg-gray-100" />
        <div className="mt-4 h-12 animate-pulse rounded-xl bg-gray-100" />
      </div>
    );
  }

  if (loadError || !intent) {
    return (
      <div className="p-6">
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {loadError || 'Payments are unavailable right now.'}
        </div>
        {onCancel && (
          <button
            onClick={onCancel}
            className="mt-4 w-full rounded-xl bg-gray-200 py-3 font-semibold text-gray-800 transition hover:bg-gray-300"
          >
            Go back
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="p-6">
      <h2 className="mb-4 text-xl font-semibold text-gray-900">Payment Details</h2>
      <StripePaymentForm
        clientSecret={intent.clientSecret}
        statusId={intent.paymentId}
        amount={intent.amount}
        processingFee={intent.processingFee}
        total={intent.total}
        currency={intent.currency}
        returnUrl={`${typeof window !== 'undefined' ? window.location.origin : ''}/payments/success?bookingId=${bookingId}&paymentId=${intent.paymentId}`}
        onConfirmed={() => {
          if (onConfirmed) onConfirmed();
          else
            router.push(
              `/payments/success?bookingId=${bookingId}&paymentId=${intent.paymentId}`
            );
        }}
        onCancel={onCancel}
      />
    </div>
  );
}
