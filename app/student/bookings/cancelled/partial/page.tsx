'use client';

import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { AlertTriangle } from 'lucide-react';

export const dynamic = 'force-dynamic';

export default function PartialRefundResultPage() {
  const params = useSearchParams();
  const refund = Number(params.get('refund') || 0);
  const retained = Number(params.get('retained') || 0);
  const bookingId = params.get('bookingId');
  const total = refund + retained;

  return (
    <div className="max-w-2xl mx-auto px-4 py-10">
      <div className="bg-white border border-red-200 rounded-2xl shadow-sm overflow-hidden">
        <div className="bg-red-600 text-white px-6 py-5">
          <div className="flex items-center gap-3">
            <AlertTriangle className="w-7 h-7" />
            <div>
              <h1 className="text-xl font-bold">Booking cancelled</h1>
              <p className="text-sm opacity-90">A late cancellation fee has been applied.</p>
            </div>
          </div>
        </div>

        <div className="p-6 space-y-5">
          <div className="rounded-xl bg-amber-50 border border-amber-300 p-5 space-y-2 text-sm">
            <div className="flex justify-between text-gray-700">
              <span>Session price</span>
              <span className="font-medium">TTD {total.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-red-700">
              <span>Late cancellation fee (50%)</span>
              <span className="font-medium">− TTD {retained.toFixed(2)}</span>
            </div>
            <div className="flex justify-between border-t border-amber-300 pt-2 mt-2">
              <span className="font-semibold">Your refund</span>
              <span className="text-2xl font-bold text-amber-700">TTD {refund.toFixed(2)}</span>
            </div>
          </div>

          <div className="rounded-xl border bg-gray-50 p-4 text-sm space-y-1">
            <div className="font-semibold text-gray-900 mb-2">Where the fee goes</div>
            <div className="text-xs text-gray-600">
              The retained TTD {retained.toFixed(2)} compensates the tutor for the reserved time. The standard
              commission split applies — the tutor receives their share and the platform takes its standard fee.
            </div>
          </div>

          <div className="rounded-lg bg-blue-50 border-l-4 border-blue-500 p-3 text-xs text-gray-700">
            To avoid future fees: cancel more than 12 hours before start, or use the reschedule option with your
            tutor's agreement (counter-offer system).
          </div>

          <div className="pt-2">
            <Link
              href={bookingId ? `/student/bookings/${bookingId}` : '/student/bookings'}
              className="block text-center px-4 py-3 rounded-xl border border-gray-300 text-gray-700 font-semibold hover:bg-gray-50"
            >
              View my bookings
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
