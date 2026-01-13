'use client';

import { useSearchParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase/client';
import Link from 'next/link';

interface BookingDetails {
  id: string;
  price_ttd: number;
  duration_minutes: number;
  platform_fee_pct: number;
  platform_fee_ttd: number;
  tutor_payout_ttd: number;
  currency: string;
  requested_start_at: string;
  tutor: {
    full_name: string;
    display_name?: string;
  };
  subjects: {
    name: string;
    label?: string;
  };
}

export default function PaymentCheckout() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const bookingId = searchParams.get('bookingId');
  
  const [booking, setBooking] = useState<BookingDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (bookingId) {
      fetchBooking();
    } else {
      setError('No booking ID provided');
      setLoading(false);
    }
  }, [bookingId]);

  async function fetchBooking() {
    try {
      const { data, error } = await supabase
        .from('bookings')
        .select(`
          id,
          price_ttd,
          duration_minutes,
          platform_fee_pct,
          platform_fee_ttd,
          tutor_payout_ttd,
          currency,
          requested_start_at,
          payment_status,
          tutor:profiles!bookings_tutor_id_fkey(full_name, display_name),
          subjects(name, label)
        `)
        .eq('id', bookingId)
        .single();

      if (error) throw error;

      if (data.payment_status === 'paid') {
        // Already paid, redirect to success page
        router.push(`/payments/success?bookingId=${bookingId}`);
        return;
      }

      setBooking(data as any);
    } catch (err: any) {
      console.error('Error fetching booking:', err);
      setError(err.message || 'Failed to load booking details');
    } finally {
      setLoading(false);
    }
  }

  async function handlePayNow() {
    if (!bookingId) return;

    setProcessing(true);
    setError('');

    try {
      const response = await fetch('/api/payments/wipay/initiate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookingId }),
      });

      const result = await response.json();

      if (!response.ok || result.error) {
        throw new Error(result.error || 'Failed to initiate payment');
      }

      // Redirect to WiPay payment page
      window.location.href = result.paymentUrl;
    } catch (err: any) {
      console.error('Payment initiation error:', err);
      setError(err.message || 'Failed to initiate payment');
      setProcessing(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-gray-100 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-itutor-green"></div>
      </div>
    );
  }

  if (error || !booking) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-gray-100 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8 text-center">
          <div className="bg-red-100 rounded-full w-16 h-16 flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Error</h1>
          <p className="text-gray-600 mb-6">{error || 'Booking not found'}</p>
          <Link
            href="/"
            className="inline-block bg-gradient-to-r from-itutor-green to-emerald-600 text-white px-6 py-3 rounded-lg font-semibold hover:from-emerald-600 hover:to-itutor-green transition"
          >
            Go to Dashboard
          </Link>
        </div>
      </div>
    );
  }

  const tutorName = booking.tutor.display_name || booking.tutor.full_name;
  const subjectName = booking.subjects.label || booking.subjects.name;
  const sessionDate = new Date(booking.requested_start_at).toLocaleString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-gray-100 py-12 px-4">
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">Complete Payment</h1>
          <p className="text-gray-600">Secure your tutoring session with {tutorName}</p>
        </div>

        {/* Payment Summary Card */}
        <div className="bg-white rounded-2xl shadow-xl overflow-hidden mb-6">
          {/* Session Details */}
          <div className="p-6 border-b border-gray-200">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Session Details</h2>
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-gray-600">Subject</span>
                <span className="font-semibold text-gray-900">{subjectName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Tutor</span>
                <span className="font-semibold text-gray-900">{tutorName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Duration</span>
                <span className="font-semibold text-gray-900">{booking.duration_minutes} minutes</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Scheduled Time</span>
                <span className="font-semibold text-gray-900">{sessionDate}</span>
              </div>
            </div>
          </div>

          {/* Payment Breakdown */}
          <div className="p-6 bg-gray-50">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Payment Summary</h2>
            <div className="space-y-3">
              <div className="flex justify-between text-lg">
                <span className="text-gray-700">Session Price</span>
                <span className="font-semibold text-gray-900">${booking.price_ttd.toFixed(2)} {booking.currency}</span>
              </div>
              
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Platform Fee ({booking.platform_fee_pct}%)</span>
                <span className="text-gray-700">${booking.platform_fee_ttd.toFixed(2)} {booking.currency}</span>
              </div>
              
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Tutor Receives</span>
                <span className="text-gray-700">${booking.tutor_payout_ttd.toFixed(2)} {booking.currency}</span>
              </div>
              
              <div className="border-t-2 border-gray-300 pt-3 mt-3">
                <div className="flex justify-between text-2xl font-bold">
                  <span className="text-gray-900">Total to Pay</span>
                  <span className="text-itutor-green">${booking.price_ttd.toFixed(2)} {booking.currency}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="p-6 space-y-3">
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-lg text-sm">
                {error}
              </div>
            )}

            <button
              onClick={handlePayNow}
              disabled={processing}
              className="w-full bg-gradient-to-r from-itutor-green to-emerald-600 hover:from-emerald-600 hover:to-itutor-green text-white py-4 rounded-xl font-bold text-lg shadow-lg hover:shadow-xl transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-3"
            >
              {processing ? (
                <>
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                  Processing...
                </>
              ) : (
                <>
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                  Pay with WiPay
                </>
              )}
            </button>

            <button
              onClick={() => router.back()}
              disabled={processing}
              className="w-full bg-gray-200 hover:bg-gray-300 text-gray-800 py-3 rounded-xl font-semibold transition-all duration-200 disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        </div>

        {/* Security Notice */}
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex items-start gap-3">
          <svg className="w-6 h-6 text-blue-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
          </svg>
          <div>
            <h3 className="font-semibold text-blue-900 mb-1">Secure Payment</h3>
            <p className="text-sm text-blue-800">
              Your payment is processed securely through WiPay. Your session will be confirmed once payment is received.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}













