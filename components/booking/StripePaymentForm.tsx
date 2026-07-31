'use client';

// =====================================================
// STRIPE PAYMENT FORM
// =====================================================
// Shared inline card form used by both 1:1 payment flows:
//
//   1. Pay for an existing booking  — /payments/checkout via
//      <SessionCheckout />, which calls /api/payments/stripe/initiate
//      and polls on our payments.id.
//   2. Pay-first "Book a session"   — the tutor-profile modal, which
//      gets its clientSecret from /api/bookings/direct-book and polls
//      on the Stripe PaymentIntent id, because no booking or payment
//      row exists until the webhook materialises them.
//
// CRITICAL RULE: this NEVER marks a booking as paid. `confirmPayment`
// resolving without an error means Stripe accepted the card — not that
// our database knows. The tab can close or the network can drop between
// Stripe processing the charge and the promise resolving. The webhook
// is the only writer of payment state; we just wait for it.
// =====================================================

import { useCallback, useEffect, useRef, useState } from 'react';
import { loadStripe, type Stripe } from '@stripe/stripe-js';
import {
  Elements,
  PaymentElement,
  useElements,
  useStripe,
} from '@stripe/react-stripe-js';

const BRAND_GREEN = '#199356';

/** How long to wait for the webhook before telling the user to check back. */
const CONFIRM_TIMEOUT_MS = 40_000;
const POLL_INTERVAL_MS = 1_500;

// Module-scope so the Stripe.js bundle is fetched once per page load.
let stripePromise: Promise<Stripe | null> | null = null;
export function getStripe() {
  if (!stripePromise) {
    const key = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
    if (!key) {
      console.error(
        '[StripePaymentForm] NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY is not set'
      );
      return null;
    }
    stripePromise = loadStripe(key);
  }
  return stripePromise;
}

export interface StripePaymentFormProps {
  clientSecret: string;
  /**
   * Id to poll for server-side confirmation. Either our payments.id or a
   * Stripe PaymentIntent id (`pi_…`) — the status route accepts both.
   */
  statusId: string;
  amount: number;
  processingFee: number;
  total: number;
  currency?: string;
  returnUrl: string;
  submitLabel?: string;
  /**
   * Suppress the inline price breakdown. The full checkout page renders
   * its own "Checkout info" panel, and showing the same three lines twice
   * on one screen reads as a duplicate total.
   */
  hideBreakdown?: boolean;
  onConfirmed: () => void;
  onCancel?: () => void;
}

export default function StripePaymentForm(props: StripePaymentFormProps) {
  const stripe = getStripe();

  if (!stripe) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
        Payments are not configured on this environment.
      </div>
    );
  }

  return (
    <Elements
      stripe={stripe}
      options={{
        clientSecret: props.clientSecret,
        appearance: {
          theme: 'stripe',
          variables: {
            colorPrimary: BRAND_GREEN,
            colorText: '#111827',
            borderRadius: '10px',
            fontFamily: 'system-ui, sans-serif',
          },
        },
      }}
    >
      <InnerForm {...props} />
    </Elements>
  );
}

function InnerForm({
  statusId,
  amount,
  processingFee,
  total,
  currency = 'TTD',
  returnUrl,
  submitLabel,
  hideBreakdown = false,
  onConfirmed,
  onCancel,
}: StripePaymentFormProps) {
  const stripe = useStripe();
  const elements = useElements();

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
        const res = await fetch(`/api/payments/stripe/${statusId}/status`, {
          cache: 'no-store',
        });
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
          // 'pending' → the webhook hasn't landed yet; keep waiting.
        }
      } catch {
        // Network blip — keep polling until the deadline.
      }

      if (!mounted.current) return false;
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    }

    return false;
  }, [statusId]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!stripe || !elements || submitting) return;

    setSubmitting(true);
    setError('');

    // `redirect: 'if_required'` keeps card payments inline; methods that
    // genuinely need a redirect (bank apps) still get one via return_url.
    const { error: confirmError } = await stripe.confirmPayment({
      elements,
      confirmParams: { return_url: returnUrl },
      redirect: 'if_required',
    });

    if (confirmError) {
      // Card declined, validation error, etc. Safe to surface directly.
      setError(confirmError.message || 'Payment could not be completed.');
      setSubmitting(false);
      return;
    }

    // Stripe accepted the payment. This does NOT mean our database knows.
    setAwaitingWebhook(true);
    const slowTimer = setTimeout(() => {
      if (mounted.current) setSlowWarning(true);
    }, 8_000);

    const confirmed = await waitForServerConfirmation();
    clearTimeout(slowTimer);

    if (!mounted.current) return;

    if (confirmed) {
      onConfirmed();
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
      <div className="py-10 text-center">
        <div className="mx-auto h-10 w-10 animate-spin rounded-full border-b-2 border-itutor-green" />
        <p className="mt-4 font-semibold text-gray-900">Confirming your payment…</p>
        <p className="mt-1 text-sm text-gray-600">Please don&apos;t close this page.</p>
        {slowWarning && (
          <p className="mt-3 text-sm text-gray-500">
            This is taking longer than usual. Your payment is safe — we&apos;re
            just waiting on confirmation.
          </p>
        )}
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit}>
      <PaymentElement options={{ layout: 'tabs' }} />

      {/* Authoritative totals — computed server-side, never client-supplied. */}
      {!hideBreakdown && (
        <div className="mt-6 space-y-2 border-t border-gray-200 pt-4">
          <div className="flex justify-between text-sm">
            <span className="text-gray-600">Session price</span>
            <span className="text-gray-900">
              ${amount.toFixed(2)} {currency}
            </span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-600">Processing fee</span>
            <span className="text-gray-900">
              ${processingFee.toFixed(2)} {currency}
            </span>
          </div>
          <div className="flex justify-between border-t border-gray-200 pt-2 text-lg font-bold">
            <span className="text-gray-900">Total</span>
            <span className="text-itutor-green">
              ${total.toFixed(2)} {currency}
            </span>
          </div>
        </div>
      )}

      {error && (
        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={!stripe || submitting}
        className="mt-6 flex w-full items-center justify-center gap-3 rounded-xl bg-gradient-to-r from-itutor-green to-emerald-600 py-4 text-lg font-bold text-white shadow-lg transition-all duration-200 hover:from-emerald-600 hover:to-itutor-green hover:shadow-xl disabled:cursor-not-allowed disabled:opacity-50"
      >
        {submitting ? (
          <>
            <div className="h-5 w-5 animate-spin rounded-full border-b-2 border-white" />
            Processing…
          </>
        ) : (
          submitLabel ?? `Pay $${total.toFixed(2)} ${currency}`
        )}
      </button>

      {onCancel && (
        <button
          type="button"
          onClick={onCancel}
          disabled={submitting}
          className="mt-3 w-full rounded-xl bg-gray-200 py-3 font-semibold text-gray-800 transition-all duration-200 hover:bg-gray-300 disabled:opacity-50"
        >
          Cancel
        </button>
      )}
    </form>
  );
}
