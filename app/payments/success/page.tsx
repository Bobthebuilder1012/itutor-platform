'use client';

import { useSearchParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase/client';
import Link from 'next/link';
import { format } from 'date-fns';

interface PaymentReceipt {
  payment: {
    id: string;
    amount_ttd: number;
    currency: string;
    provider_reference: string;
    status: string;
    created_at: string;
  };
  booking: {
    id: string;
    duration_minutes: number;
    requested_start_at: string;
    platform_fee_ttd: number;
    tutor_payout_ttd: number;
    platform_fee_pct: number;
  };
  payer: {
    full_name: string;
    email: string;
  };
  tutor: {
    full_name: string;
    display_name?: string;
  };
  subject: {
    name: string;
    label?: string;
  };
}

export default function PaymentSuccess() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const bookingId = searchParams.get('bookingId');
  const transactionId = searchParams.get('transaction_id');
  const isMock = searchParams.get('mock') === 'true';
  
  const [receipt, setReceipt] = useState<PaymentReceipt | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (bookingId) {
      fetchReceipt();
    } else {
      setError('No booking ID provided');
      setLoading(false);
    }
  }, [bookingId]);

  async function fetchReceipt() {
    try {
      // Get payment details
      const { data: payments, error: paymentError } = await supabase
        .from('payments')
        .select('*')
        .eq('booking_id', bookingId)
        .order('created_at', { ascending: false })
        .limit(1);

      if (paymentError) throw paymentError;

      if (!payments || payments.length === 0) {
        throw new Error('Payment not found');
      }

      const payment = payments[0];

      // Get booking details with related data
      const { data: booking, error: bookingError } = await supabase
        .from('bookings')
        .select(`
          id,
          duration_minutes,
          requested_start_at,
          platform_fee_ttd,
          tutor_payout_ttd,
          platform_fee_pct,
          payer:profiles!bookings_payer_id_fkey(full_name, email),
          tutor:profiles!bookings_tutor_id_fkey(full_name, display_name),
          subjects(name, label)
        `)
        .eq('id', bookingId)
        .single();

      if (bookingError) throw bookingError;

      setReceipt({
        payment,
        booking: booking as any,
        payer: (booking as any).payer,
        tutor: (booking as any).tutor,
        subject: (booking as any).subjects,
      });
    } catch (err: any) {
      console.error('Error fetching receipt:', err);
      setError(err.message || 'Failed to load receipt');
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-gray-100 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-itutor-green"></div>
      </div>
    );
  }

  if (error || !receipt) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-gray-100 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8 text-center">
          <div className="bg-red-100 rounded-full w-16 h-16 flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Error</h1>
          <p className="text-gray-600 mb-6">{error || 'Receipt not found'}</p>
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

  const tutorName = receipt.tutor.display_name || receipt.tutor.full_name;
  const subjectName = receipt.subject.label || receipt.subject.name;
  const sessionDate = format(new Date(receipt.booking.requested_start_at), 'PPPp');

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-gray-100 py-12 px-4">
      <div className="max-w-3xl mx-auto">
        {/* Success Message */}
        <div className="text-center mb-8">
          <div className="bg-green-100 rounded-full w-20 h-20 flex items-center justify-center mx-auto mb-4 animate-bounce">
            <svg className="w-10 h-10 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h1 className="text-4xl font-bold text-gray-900 mb-2">Payment Successful!</h1>
          <p className="text-lg text-gray-600">
            Your session has been confirmed
          </p>
          {isMock && (
            <div className="mt-4 bg-yellow-50 border border-yellow-200 text-yellow-800 px-4 py-2 rounded-lg inline-block">
              <p className="text-sm font-semibold">🧪 Test Mode - No actual payment was processed</p>
            </div>
          )}
        </div>

        {/* Receipt Card */}
        <div className="bg-white rounded-2xl shadow-xl overflow-hidden mb-6">
          {/* Header */}
          <div className="bg-gradient-to-r from-itutor-green to-emerald-600 p-6 text-white">
            <h2 className="text-2xl font-bold mb-1">Payment Receipt</h2>
            <p className="text-emerald-100">Transaction ID: {receipt.payment.provider_reference}</p>
          </div>

          {/* Session Details */}
          <div className="p-6 border-b border-gray-200">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Session Details</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <span className="text-sm text-gray-600">Subject</span>
                <p className="font-semibold text-gray-900">{subjectName}</p>
              </div>
              <div>
                <span className="text-sm text-gray-600">Tutor</span>
                <p className="font-semibold text-gray-900">{tutorName}</p>
              </div>
              <div>
                <span className="text-sm text-gray-600">Duration</span>
                <p className="font-semibold text-gray-900">{receipt.booking.duration_minutes} minutes</p>
              </div>
              <div>
                <span className="text-sm text-gray-600">Scheduled</span>
                <p className="font-semibold text-gray-900">{sessionDate}</p>
              </div>
            </div>
          </div>

          {/* Payment Details */}
          <div className="p-6 border-b border-gray-200">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Payment Details</h3>
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-gray-600">Session Price</span>
                <span className="font-semibold text-gray-900">
                  ${receipt.payment.amount_ttd.toFixed(2)} {receipt.payment.currency}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Platform Fee ({receipt.booking.platform_fee_pct}%)</span>
                <span className="text-gray-700">${receipt.booking.platform_fee_ttd.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Tutor Receives</span>
                <span className="text-gray-700">${receipt.booking.tutor_payout_ttd.toFixed(2)}</span>
              </div>
              <div className="border-t pt-3 flex justify-between text-lg font-bold">
                <span className="text-gray-900">Total Paid</span>
                <span className="text-itutor-green">
                  ${receipt.payment.amount_ttd.toFixed(2)} {receipt.payment.currency}
                </span>
              </div>
            </div>
          </div>

          {/* Payer Details */}
          <div className="p-6 bg-gray-50">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Paid By</h3>
            <div className="space-y-2">
              <p className="font-semibold text-gray-900">{receipt.payer.full_name}</p>
              <p className="text-sm text-gray-600">{receipt.payer.email}</p>
              <p className="text-xs text-gray-500">
                {format(new Date(receipt.payment.created_at), 'PPPp')}
              </p>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="p-6 flex flex-col sm:flex-row gap-3">
            <Link
              href="/"
              className="flex-1 bg-gradient-to-r from-itutor-green to-emerald-600 hover:from-emerald-600 hover:to-itutor-green text-white py-3 rounded-xl font-semibold text-center transition-all shadow-lg hover:shadow-xl"
            >
              Go to Dashboard
            </Link>
            <button
              onClick={() => window.print()}
              className="flex-1 bg-gray-200 hover:bg-gray-300 text-gray-800 py-3 rounded-xl font-semibold transition-all flex items-center justify-center gap-2"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
              </svg>
              Print Receipt
            </button>
          </div>
        </div>

        {/* Next Steps */}
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-6">
          <h3 className="text-lg font-semibold text-blue-900 mb-3">What happens next?</h3>
          <ul className="space-y-2 text-blue-800">
            <li className="flex items-start gap-2">
              <svg className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span>Your iTutor will review and confirm your session request</span>
            </li>
            <li className="flex items-start gap-2">
              <svg className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
              </svg>
              <span>You'll receive a notification once your session is confirmed</span>
            </li>
            <li className="flex items-start gap-2">
              <svg className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <span>The meeting link will be available before your scheduled session</span>
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}


