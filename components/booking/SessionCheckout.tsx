'use client';

// =====================================================
// SESSION CHECKOUT (Stripe Payment Element)
// =====================================================
// Renders the Stripe Payment Element for a one-on-one booking.
//
// CRITICAL RULE: this component NEVER marks a booking as paid.
// `stripe.confirmPayment` resolving without an error means Stripe
// accepted the card — not that our database knows about it. The tab
// can close or the network can drop between Stripe processing the
// charge and this promise resolving. The webhook
// (/api/payments/stripe/webhook) is the only writer of payment state.
//
// After confirmation we poll our own status endpoint until the webhook
// has landed, and only then send the user to the success page.
// =====================================================

import { useCallback, useEffect, useRef, useState } from 'react';
import { loadStripe, type Stripe } from '@stripe/stripe-js';
import {
  Elements,
  PaymentElement,
  useElements,
  useStripe,
} from '@stripe/react-stripe-js';
import { useRouter } from 'next/navigation';

// Module-scope so the Stripe.js bundle is fetched once per page load.
let stripePromise: Promise<Stripe | null> | null = null;
function getStripe() {
  if (!stripePromise) {
    const key = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
    if (!key) {
      console.error(
        '[SessionCheckout] NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY is not set'
      );
      return null;
    }
    stripePromise = loadStripe(key);
  }
  return stripePromise;
}

/** How long to wait for the webhook before telling the user to check back. */
const CONFIRM_TIMEOUT_MS = 30_000;
const POLL_INTERVAL_MS = 1_500;

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
      } catch (err) {
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

  const stripe = getStripe();

  if (loading) {
    return (
      <div className="rounded-xl bg-card p-6">
        <div className="h-4 w-32 animate-pulse rounded bg-white/10" />
        <div className="mt-4 h-24 animate-pulse rounded bg-white/5" />
      </div>
    );
  }

  if (loadError || !intent || !stripe) {
    return (
      <div className="rounded-xl bg-card p-6">
        <p className="text-sm text-red-400">
          {loadError || 'Payments are unavailable right now.'}
        </p>
        {onCancel && (
          <button
            onClick={onCancel}
            className="mt-4 text-sm text-muted underline"
          >
            Go back
          </button>
        )}
      </div>
    );
  }

  return (
    <Elements
      stripe={stripe}
      options={{
        clientSecret: intent.clientSecret,
        appearance: {
          theme: 'night',
          variables: {
            colorPrimary: '#199356',
            borderRadius: '10px',
          },
        },
      }}
    >
      <CheckoutForm
        bookingId={bookingId}
        paymentId={intent.paymentId}
        amount={intent.amount}
        processingFee={intent.processingFee}
        total={intent.total}
        onConfirmed={onConfirmed}
        onCancel={onCancel}
      />
    </Elements>
  );
}

function CheckoutForm({
  bookingId,
  paymentId,
  amount,
  processingFee,
  total,
  onConfirmed,
  onCancel,
}: {
  bookingId: string;
  paymentId: string;
  amount: number;
  processingFee: number;
  total: number;
  onConfirmed?: () => void;
  onCancel?: () => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const router = useRouter();

  const [submitting, setSubmitting] = useState(false);
  const [awaitingWebhook, setAwaitingWebhook] = useState(false);
  const [error, setError] = useState('');
  const [slowWarning, setSlowWarning] = useState(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  /**
   * Polls our own server until the webhook has recorded the payment.
   * Resolves true if confirmed, false if we gave up waiting.
   */
  const waitForServerConfirmation = useCallback(async (): Promise<boolean> => {
    const deadline = Date.now() + CONFIRM_TIMEOUT_MS;

    while (Date.now() < deadline) {
      try {
        const res = await fetch(
          `/api/payments/stripe/${paymentId}/status`,
          { cache: 'no-store' }
        );
        if (res.ok) {
          const data = (await res.json()) as {
            status?: string;
            bookingPaymentStatus?: string;
          };
          if (data.status === 'succeeded' || data.bookingPaymentStatus === 'paid') {
            return true;
          }
          if (data.status === 'failed' || data.status === 'cancelled') {
            return false;
          }
        }
      } catch {
        // Network blip — keep polling until the deadline.
      }

      if (!mounted.current) return false;
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    }

    return false;
  }, [paymentId]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!stripe || !elements || submitting) return;

    setSubmitting(true);
    setError('');

    // `redirect: 'if_required'` keeps card payments inline; methods that
    // genuinely need a redirect (bank apps) still get one via return_url.
    const { error: confirmError } = await stripe.confirmPayment({
      elements,
      confirmParams: {
        return_url: `${window.location.origin}/payments/success?bookingId=${bookingId}&paymentId=${paymentId}`,
      },
      redirect: 'if_required',
    });

    if (confirmError) {
      // Card declined, validation error, etc. Safe to surface directly.
      setError(confirmError.message || 'Payment could not be completed.');
      setSubmitting(false);
      return;
    }

    // Stripe accepted the payment. This does NOT mean our database knows.
    // Wait for the webhook before showing any success state.
    setAwaitingWebhook(true);
    const slowTimer = setTimeout(() => {
      if (mounted.current) setSlowWarning(true);
    }, 8_000);

    const confirmed = await waitForServerConfirmation();
    clearTimeout(slowTimer);

    if (!mounted.current) return;

    if (confirmed) {
      if (onConfirmed) {
        onConfirmed();
      } else {
        router.push(
          `/payments/success?bookingId=${bookingId}&paymentId=${paymentId}`
        );
      }
      return;
    }

    // Timed out. The payment may still land — the webhook will process it
    // whenever it arrives. Do NOT show an error that implies failure.
    setAwaitingWebhook(false);
    setSubmitting(false);
    setError(
      'Your payment went through but is still being confirmed. You do not need to pay again — check your bookings in a few moments.'
    );
  }

  if (awaitingWebhook) {
    return (
      <div className="rounded-xl bg-card p-6 text-center">
        <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-green-brand" />
        <p className="mt-4 text-sm font-medium">Confirming your payment…</p>
        <p className="mt-1 text-xs text-muted">
          Please don&apos;t close this page.
        </p>
        {slowWarning && (
          <p className="mt-3 text-xs text-muted">
            This is taking longer than usual. Your payment is safe — we&apos;re
            just waiting on confirmation.
          </p>
        )}
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-xl bg-card p-6">
      <PaymentElement options={{ layout: 'tabs' }} />

      <div className="mt-6 space-y-1 border-t border-white/10 pt-4 text-sm">
        <div className="flex justify-between text-muted">
          <span>Session</span>
          <span>${amount.toFixed(2)} TTD</span>
        </div>
        <div className="flex justify-between text-muted">
          <span>Processing fee</span>
          <span>${processingFee.toFixed(2)} TTD</span>
        </div>
        <div className="flex justify-between pt-1 font-semibold">
          <span>Total</span>
          <span>${total.toFixed(2)} TTD</span>
        </div>
      </div>

      {error && (
        <p className="mt-4 rounded-lg bg-red-500/10 p-3 text-sm text-red-400">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={!stripe || submitting}
        className="mt-6 w-full rounded-lg bg-green-brand py-3 font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
      >
        {submitting ? 'Processing…' : `Pay $${total.toFixed(2)} TTD`}
      </button>

      {onCancel && (
        <button
          type="button"
          onClick={onCancel}
          disabled={submitting}
          className="mt-3 w-full text-sm text-muted underline disabled:opacity-50"
        >
          Cancel
        </button>
      )}
    </form>
  );
}
