'use client';

import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { fmtTTD } from '@/lib/utils/formatCurrency';
import { CheckCircle2 } from 'lucide-react';

export const dynamic = 'force-dynamic';

export default function FullRefundResultPage() {
  const params = useSearchParams();
  const refund = Number(params.get('refund') || 0);
  const bookingId = params.get('bookingId');

  return (
    <div className="max-w-2xl mx-auto px-4 py-10">
      <div className="bg-white border border-green-200 rounded-2xl shadow-sm overflow-hidden">
        <div className="bg-green-600 text-white px-6 py-5">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="w-7 h-7" />
            <div>
              <h1 className="text-xl font-bold">Booking cancelled</h1>
              <p className="text-sm opacity-90">Your refund is being processed.</p>
            </div>
          </div>
        </div>

        <div className="p-6 space-y-5">
          <div className="rounded-xl bg-green-50 border border-green-200 p-5">
            <div className="text-xs text-green-700 font-semibold uppercase tracking-wide">Refund amount</div>
            <div className="text-3xl font-bold text-green-700 mt-1">{fmtTTD(refund)}</div>
            <div className="text-xs text-gray-600 mt-2">Returned to your original payment method within 2–5 business days.</div>
          </div>

          <div className="rounded-xl border bg-gray-50 p-4 text-sm space-y-2">
            <div className="font-semibold text-gray-900">What happens next</div>
            <ul className="list-disc list-inside text-gray-700 space-y-1">
              <li>Your tutor has been notified.</li>
              <li>Refund of {fmtTTD(refund)} sent to your card.</li>
              <li>Funds should appear within 2–5 business days.</li>
            </ul>
          </div>

          <div className="rounded-lg bg-blue-50 border-l-4 border-blue-500 p-3 text-xs text-gray-700">
            Three or more cancellations within 30 days may flag a reliability warning. After a warning, late
            cancellations (within 12 hours of start) incur a 50% fee.
          </div>

          <div className="flex flex-col sm:flex-row gap-2 pt-2">
            <Link
              href="/student/find-tutors"
              className="flex-1 text-center px-4 py-3 rounded-xl bg-green-600 hover:bg-green-700 text-white font-semibold"
            >
              Book another session
            </Link>
            <Link
              href={bookingId ? `/student/bookings/${bookingId}` : '/student/bookings'}
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
