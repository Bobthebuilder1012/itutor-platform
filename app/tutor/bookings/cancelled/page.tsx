'use client';

import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { fmtTTD } from '@/lib/utils/formatCurrency';
import { CheckCircle2 } from 'lucide-react';

export const dynamic = 'force-dynamic';

export default function TutorCancelledResultPage() {
  const params = useSearchParams();
  const refund = Number(params.get('refund') || 0);
  const wasSuperLate = params.get('late') === 'true';
  const bookingId = params.get('bookingId');

  return (
    <div className="max-w-2xl mx-auto px-4 py-10">
      <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
        <div className="bg-gray-700 text-white px-6 py-5">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="w-7 h-7" />
            <div>
              <h1 className="text-xl font-bold">Session cancelled</h1>
              <p className="text-sm opacity-90">The student has been notified and refunded.</p>
            </div>
          </div>
        </div>

        <div className="p-6 space-y-5">
          <div className="rounded-xl border bg-gray-50 p-4 text-sm space-y-1">
            <div className="flex justify-between">
              <span className="text-gray-500">Student refund</span>
              <span className="font-semibold text-green-700">{fmtTTD(refund)} (full)</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Your payout</span>
              <span className="font-semibold text-red-600">TT$0</span>
            </div>
          </div>

          <div className="rounded-xl border bg-amber-50 border-amber-300 p-4 text-sm space-y-1">
            <div className="font-semibold text-amber-900">Reliability impact</div>
            <ul className="list-disc list-inside text-gray-700 space-y-1 mt-1">
              <li>A strike has been recorded on your 90-day reliability record.</li>
              {wasSuperLate && (
                <li className="text-red-700 font-medium">
                  Cancelling within 15 minutes of start time also recorded a 2-star system rating on your profile.
                  You can appeal this from your reviews page.
                </li>
              )}
              <li>3+ strikes triggers a reliability warning. 5+ strikes triggers a temporary suspension review.</li>
            </ul>
          </div>

          <div className="rounded-lg bg-blue-50 border-l-4 border-blue-500 p-3 text-xs text-gray-700">
            Consider rescheduling via the counter-offer system next time. If rescheduling more than 12 hours
            before session start with the student's agreement, no penalty, strike, or fee is applied.
          </div>

          <div className="flex flex-col sm:flex-row gap-2 pt-2">
            <Link
              href="/tutor/sessions"
              className="flex-1 text-center px-4 py-3 rounded-xl bg-itutor-green hover:opacity-90 text-white font-semibold"
            >
              View my sessions
            </Link>
            <Link
              href={bookingId ? `/tutor/bookings/${bookingId}` : '/tutor/bookings'}
              className="flex-1 text-center px-4 py-3 rounded-xl border border-gray-300 text-gray-700 font-semibold hover:bg-gray-50"
            >
              View my bookings
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
