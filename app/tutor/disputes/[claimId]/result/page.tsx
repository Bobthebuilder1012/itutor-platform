'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { CheckCircle2, AlertTriangle, Scale } from 'lucide-react';

export default function TutorClaimResultPage() {
  const params = useParams();
  const claimId = params.claimId as string;
  const [claim, setClaim] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/noshow-claims/${claimId}`);
        if (res.ok) setClaim(await res.json());
      } finally {
        setLoading(false);
      }
    })();
  }, [claimId]);

  if (loading) return <div className="p-10 text-center text-gray-500">Loading…</div>;
  if (!claim) return <div className="p-10 text-center text-red-600">Claim not found.</div>;

  if (claim.status !== 'resolved') {
    return (
      <div className="max-w-2xl mx-auto px-4 py-10">
        <div className="bg-white border border-blue-200 rounded-2xl shadow-sm overflow-hidden">
          <div className="bg-blue-600 text-white px-6 py-5">
            <h1 className="text-xl font-bold">Claim in progress</h1>
            <p className="text-sm opacity-90">
              {claim.status === 'awaiting_response' ? 'Awaiting student response.' : 'Under admin review.'}
            </p>
          </div>
          <div className="p-6">
            <Link href="/tutor/bookings" className="text-itutor-green hover:underline text-sm">
              {'<- All bookings'}
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // Viewer is the tutor.
  // - claim filed by tutor: tutor_noshow=lost (claim denied), student_noshow=won, tie=neutral.
  // - claim filed by student against tutor: tutor_noshow=lost, student_noshow=won-for-tutor, tie=neutral.
  const tutorWon =
    (claim.claimant_role === 'tutor' && claim.admin_verdict === 'student_noshow') ||
    (claim.claimant_role === 'student' && claim.admin_verdict === 'student_noshow');

  if (tutorWon) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-10">
        <div className="bg-white border border-green-200 rounded-2xl shadow-sm overflow-hidden">
          <div className="bg-green-600 text-white px-6 py-5">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="w-7 h-7" />
              <div>
                <h1 className="text-xl font-bold">Claim resolved in your favour</h1>
                <p className="text-sm opacity-90">The student was confirmed as a no-show.</p>
              </div>
            </div>
          </div>
          <div className="p-6 space-y-5">
            <div className="rounded-xl border bg-gray-50 p-4 text-sm space-y-1">
              <div className="font-semibold text-gray-900 mb-2">Outcome</div>
              <ul className="list-disc list-inside text-gray-700 space-y-1 text-xs">
                <li>Your payment for this session proceeds as normal.</li>
                <li>A strike was recorded against the student.</li>
                <li>No penalty against your reliability record.</li>
              </ul>
            </div>
            <Link href="/tutor/bookings" className="block text-center px-4 py-3 rounded-xl bg-green-600 hover:bg-green-700 text-white font-semibold">
              My bookings
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (claim.admin_verdict === 'tutor_noshow') {
    return (
      <div className="max-w-2xl mx-auto px-4 py-10">
        <div className="bg-white border border-red-200 rounded-2xl shadow-sm overflow-hidden">
          <div className="bg-red-600 text-white px-6 py-5">
            <div className="flex items-center gap-3">
              <AlertTriangle className="w-7 h-7" />
              <div>
                <h1 className="text-xl font-bold">Confirmed as tutor no-show</h1>
                <p className="text-sm opacity-90">Penalties have been applied to your record.</p>
              </div>
            </div>
          </div>
          <div className="p-6 space-y-5">
            <div className="rounded-xl border bg-gray-50 p-4 text-sm space-y-1">
              <div className="font-semibold text-gray-900 mb-2">Action taken</div>
              <ul className="list-disc list-inside text-gray-700 space-y-1 text-xs">
                <li>The student received a full refund.</li>
                <li>You will not receive a payout for this session.</li>
                <li>A strike was recorded on your 90-day reliability record.</li>
                <li>A 1-star system rating was applied to your profile.</li>
              </ul>
            </div>

            <div className="rounded-lg bg-blue-50 border-l-4 border-blue-500 p-3 text-xs text-gray-700">
              You can appeal the rating and the strike from your dashboard. Provide additional context for
              admin to review.
            </div>

            <Link href="/tutor/dashboard" className="block text-center px-4 py-3 rounded-xl bg-itutor-green hover:opacity-90 text-white font-semibold">
              Appeal from my dashboard
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // tie
  return (
    <div className="max-w-2xl mx-auto px-4 py-10">
      <div className="bg-white border border-indigo-200 rounded-2xl shadow-sm overflow-hidden">
        <div className="bg-indigo-600 text-white px-6 py-5">
          <div className="flex items-center gap-3">
            <Scale className="w-7 h-7" />
            <div>
              <h1 className="text-xl font-bold">Claim resolved</h1>
              <p className="text-sm opacity-90">Evidence was inconclusive.</p>
            </div>
          </div>
        </div>
        <div className="p-6 space-y-5">
          <div className="rounded-xl border bg-gray-50 p-4 text-sm space-y-1">
            <div className="font-semibold text-gray-900 mb-2">Outcome</div>
            <ul className="list-disc list-inside text-gray-700 space-y-1 text-xs">
              <li>Student received a full refund.</li>
              <li>You did not receive a payout for this session.</li>
              <li>No strike, fee, or rating penalty for either side.</li>
            </ul>
          </div>
          <Link href="/tutor/bookings" className="block text-center px-4 py-3 rounded-xl border border-gray-300 text-gray-700 font-semibold hover:bg-gray-50">
            My bookings
          </Link>
        </div>
      </div>
    </div>
  );
}
